import { api } from '../api.js';
import { createCard, btn } from '../components/card.js';
import { confirmDialog } from '../components/confirm.js';

export function createRegistryView({ initialCollapsed = false } = {}) {
  const refreshBtn = btn('Refresh', { primary: true });
  const clearBtn = btn('Clear all');

  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'registry-sections';

  const statusEl = document.createElement('div');
  statusEl.className = 'status';

  const body = document.createElement('div');
  body.appendChild(sectionsEl);
  body.appendChild(buildAddSection());
  body.appendChild(buildAddJson());
  body.appendChild(statusEl);

  const { element } = createCard({
    id: 'registry',
    title: 'Registry inspector',
    initialCollapsed,
    actions: [refreshBtn, clearBtn],
    body,
    // Auto-read the registry whenever the panel is expanded.
    onToggle: (collapsed) => { if (!collapsed) refresh(); }
  });

  let busy = false;
  // Collapsed section names, kept across re-renders (renderSections rebuilds DOM).
  const collapsedSections = new Set();
  function setBusy(b) {
    busy = b;
    // Disable everything while a call is in flight, except the header collapse
    // toggle — the user must always be able to fold the panel, even mid-refresh.
    element.querySelectorAll('button, input, textarea').forEach((el) => {
      if (el.classList.contains('card-toggle')) return;
      el.disabled = b;
    });
  }

  // Run a registry IPC call that returns { ok, registry, error }, render the
  // fresh registry on success, and report status.
  async function run(label, fn) {
    if (busy) return;
    setBusy(true);
    statusEl.textContent = `${label}…`;
    try {
      const res = await fn();
      if (!res.ok) {
        statusEl.textContent = `${label} failed: ${res.error}`;
        return false;
      }
      renderSections(res.registry);
      statusEl.textContent = `${label}: done.`;
      return true;
    } catch (err) {
      statusEl.textContent = `${label} failed: ${err.message}`;
      return false;
    } finally {
      setBusy(false);
    }
  }

  function buildAddSection() {
    const wrap = document.createElement('div');
    wrap.className = 'registry-add';
    const section = mkInput('section');
    const key = mkInput('key');
    const value = mkInput('value');
    const addBtn = btn('Add key', { primary: true });
    addBtn.addEventListener('click', async () => {
      const sectionName = section.value.trim();
      const k = key.value.trim();
      if (!sectionName || !k) {
        statusEl.textContent = 'Add key: section and key are required.';
        return;
      }
      const ok = await run('Add key', () =>
        api.registryAddField({ sectionName, key: k, value: value.value })
      );
      if (ok) { key.value = ''; value.value = ''; }
    });
    wrap.append(section, key, value, addBtn);
    return wrap;
  }

  // Paste a { "section": { "key": "value" } } JSON object (the same shape the
  // per-section "Copy JSON" produces) and write it all to the registry.
  function buildAddJson() {
    const wrap = document.createElement('div');
    wrap.className = 'registry-add-json';

    const ta = document.createElement('textarea');
    ta.className = 'input registry-json-input';
    ta.placeholder = '{ "section.name": { "key": "value", ... } }';
    ta.autocomplete = 'off';
    ta.spellcheck = false;
    ta.rows = 4;

    const addBtn = btn('Add JSON', { primary: true });
    addBtn.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) { statusEl.textContent = 'Add JSON: paste a JSON object first.'; return; }

      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        statusEl.textContent = `Add JSON: invalid JSON — ${err.message}`;
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        statusEl.textContent = 'Add JSON: expected an object of { "section": { "key": "value" } }.';
        return;
      }

      // Coerce into string-valued sections (the registry only stores strings).
      const sections = {};
      let keyCount = 0;
      for (const [secName, items] of Object.entries(data)) {
        if (!items || typeof items !== 'object' || Array.isArray(items)) {
          statusEl.textContent = `Add JSON: section "${secName}" must map to an object of key/value pairs.`;
          return;
        }
        const obj = {};
        for (const [k, v] of Object.entries(items)) {
          obj[k] = v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
          keyCount += 1;
        }
        sections[secName] = obj;
      }
      if (!keyCount) { statusEl.textContent = 'Add JSON: nothing to write (no keys).'; return; }

      const ok = await run('Add JSON', () => api.registryImport({ sections }));
      if (ok) ta.value = '';
    });

    wrap.append(ta, addBtn);
    return wrap;
  }

  function mkInput(placeholder, val = '') {
    const i = document.createElement('input');
    i.type = 'text';
    i.className = 'input';
    i.placeholder = placeholder;
    i.autocomplete = 'off';
    i.value = val;
    return i;
  }

  function renderSections(registry) {
    sectionsEl.innerHTML = '';
    const sections = (registry && registry.sections) || [];
    const total = sections.reduce((n, s) => n + s.items.length, 0);
    if (!total) {
      sectionsEl.innerHTML = '<div class="registry-empty">Registry is empty.</div>';
      return;
    }
    for (const section of sections) {
      if (!section.items.length) continue;
      const collapsed = collapsedSections.has(section.name);

      const wrap = document.createElement('div');
      wrap.className = 'registry-section';
      if (collapsed) wrap.classList.add('collapsed');

      const head = document.createElement('div');
      head.className = 'registry-section-head';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'registry-section-toggle';
      toggle.title = collapsed ? 'Expand' : 'Collapse';
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.innerHTML = '<span class="chevron" aria-hidden="true">▾</span>';
      // Section name is a standalone selectable span (not inside the button) so
      // it can be selected and copied with Ctrl+C.
      const name = document.createElement('span');
      name.className = 'registry-section-name';
      name.textContent = section.name || '(default)';
      const copyName = btn('Copy');
      copyName.classList.add('registry-section-copy');
      copyName.title = 'Copy section name';
      copyName.addEventListener('click', async () => {
        await api.copyToClipboard(section.name);
        statusEl.textContent = `Copied section name “${section.name}”.`;
      });

      const copyJson = btn('Copy JSON');
      copyJson.classList.add('registry-section-copy');
      copyJson.title = 'Copy full section as JSON';
      copyJson.addEventListener('click', async () => {
        const itemsObj = {};
        for (const it of section.items) itemsObj[it.key] = it.value;
        const json = JSON.stringify({ [section.name]: itemsObj }, null, 2);
        await api.copyToClipboard(json);
        statusEl.textContent = `Copied “${section.name}” as JSON (${section.items.length} key${section.items.length === 1 ? '' : 's'}).`;
      });
      const count = document.createElement('span');
      count.className = 'registry-section-count';
      count.textContent = `${section.items.length} key${section.items.length === 1 ? '' : 's'}`;
      toggle.addEventListener('click', () => {
        const nowCollapsed = wrap.classList.toggle('collapsed');
        toggle.title = nowCollapsed ? 'Expand' : 'Collapse';
        toggle.setAttribute('aria-expanded', String(!nowCollapsed));
        if (nowCollapsed) collapsedSections.add(section.name);
        else collapsedSections.delete(section.name);
      });

      const delSection = btn('Delete section');
      delSection.addEventListener('click', async () => {
        const ok = await confirmDialog(`Delete the entire "${section.name}" section and all its keys?`, {
          title: 'Delete section',
          confirmText: 'Delete',
          danger: true
        });
        if (!ok) return;
        run('Delete section', () => api.registryRemoveSection({ name: section.name }));
      });
      head.append(toggle, name, count, copyName, copyJson, delSection);
      wrap.appendChild(head);

      const table = document.createElement('div');
      table.className = 'registry-table';
      for (const item of section.items) {
        table.appendChild(buildRow(section.name, item));
      }
      wrap.appendChild(table);
      sectionsEl.appendChild(wrap);
    }
  }

  function buildRow(sectionName, item) {
    const row = document.createElement('div');
    row.className = 'registry-row';

    const keyInput = mkInput('key', item.key);
    const valueInput = mkInput('value', item.value);

    const saveBtn = btn('Save');
    saveBtn.addEventListener('click', () => {
      const newKey = keyInput.value.trim();
      if (!newKey) { statusEl.textContent = 'Save: key cannot be empty.'; return; }
      if (newKey === item.key && valueInput.value === item.value) {
        statusEl.textContent = 'Save: no changes.';
        return;
      }
      run('Save', () => api.registryEditField({
        sectionName, key: item.key, newKey, newValue: valueInput.value
      }));
    });

    const delBtn = btn('Delete');
    delBtn.addEventListener('click', () => {
      run('Delete', () => api.registryRemoveField({ sectionName, key: item.key }));
    });

    const copyBtn = btn('Copy');
    copyBtn.addEventListener('click', async () => {
      await api.copyToClipboard(item.value);
      statusEl.textContent = `Copied “${item.key}”.`;
    });

    row.append(keyInput, valueInput, saveBtn, copyBtn, delBtn);
    return row;
  }

  function refresh() {
    return run('Refresh', () => api.readRegistry());
  }

  refreshBtn.addEventListener('click', refresh);
  clearBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('Clear the entire device registry? This deletes all sections and keys and cannot be undone.', {
      title: 'Clear registry',
      confirmText: 'Clear all',
      danger: true
    });
    if (!ok) return;
    run('Clear all', () => api.clearDeviceRegistry());
  });

  // Load immediately if the panel starts expanded; expanding later also refreshes.
  if (!initialCollapsed) refresh();

  return element;
}
