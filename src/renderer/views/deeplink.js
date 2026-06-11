import { api } from '../api.js';
import { createCard, btn } from '../components/card.js';

const CONFIG_KEY = 'deeplinkSets';
const LEGACY_KEYS = ['deeplinkParams', 'deeplinkParams2', 'deeplinkParams3'];
const DEFAULT_SEED = 2;

function createSet({ params, collapsed = false, lastUsed = null, onChange, onRemove }) {
  const sendInputBtn = btn('Send Input');
  const sendLaunchBtn = btn('Send Launch');
  const addBtn = btn('+ Add parameter', { className: 'deeplink-add' });

  const rowsEl = document.createElement('div');
  rowsEl.className = 'deeplink-fields';

  const rows = [];

  function makeRow(key = '', value = '') {
    const rowEl = document.createElement('div');
    rowEl.className = 'deeplink-row';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'input';
    keyInput.placeholder = 'name';
    keyInput.autocomplete = 'off';
    keyInput.value = key;

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'input';
    valueInput.placeholder = 'value';
    valueInput.autocomplete = 'off';
    valueInput.value = value;

    const removeBtn = btn('×', { className: 'deeplink-row-remove' });
    removeBtn.title = 'Remove parameter';

    const entry = { rowEl, keyInput, valueInput };

    removeBtn.addEventListener('click', () => {
      const idx = rows.indexOf(entry);
      if (idx === -1) return;
      rows.splice(idx, 1);
      rowEl.remove();
      onChange();
    });
    keyInput.addEventListener('input', onChange);
    valueInput.addEventListener('input', onChange);

    rowEl.appendChild(keyInput);
    rowEl.appendChild(valueInput);
    rowEl.appendChild(removeBtn);
    return entry;
  }

  function addRow(key, value) {
    const entry = makeRow(key, value);
    rows.push(entry);
    rowsEl.appendChild(entry.rowEl);
    return entry;
  }

  addBtn.addEventListener('click', () => {
    const entry = addRow();
    entry.keyInput.focus();
    onChange();
  });

  const seed = Array.isArray(params) && params.length ? params : new Array(DEFAULT_SEED).fill({});
  for (const item of seed) addRow(item.key ?? '', item.value ?? '');

  const fieldsCol = document.createElement('div');
  fieldsCol.className = 'deeplink-fields-col';
  fieldsCol.appendChild(rowsEl);
  fieldsCol.appendChild(addBtn);

  const actionsCol = document.createElement('div');
  actionsCol.className = 'deeplink-actions';
  actionsCol.appendChild(sendInputBtn);
  actionsCol.appendChild(sendLaunchBtn);

  const grid = document.createElement('div');
  grid.className = 'deeplink-body';
  grid.appendChild(fieldsCol);
  grid.appendChild(actionsCol);

  const statusEl = document.createElement('div');
  statusEl.className = 'status';

  const setBody = document.createElement('div');
  setBody.className = 'deeplink-set-content';
  setBody.appendChild(grid);
  setBody.appendChild(statusEl);

  // Header: collapse toggle (chevron + title) + remove-set button
  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';

  const titleEl = document.createElement('span');
  titleEl.className = 'deeplink-set-name';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'deeplink-set-toggle';
  toggleBtn.setAttribute('aria-expanded', String(!collapsed));
  toggleBtn.appendChild(chevron);
  toggleBtn.appendChild(titleEl);

  const removeSetBtn = btn('Remove', { className: 'deeplink-set-remove' });
  removeSetBtn.title = 'Remove this set';

  const header = document.createElement('div');
  header.className = 'deeplink-set-header';
  header.appendChild(toggleBtn);
  header.appendChild(removeSetBtn);

  const element = document.createElement('div');
  element.className = 'deeplink-set';
  if (collapsed) element.classList.add('collapsed');
  element.appendChild(header);
  element.appendChild(setBody);

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = element.classList.toggle('collapsed');
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    onChange();
  });

  removeSetBtn.addEventListener('click', () => onRemove());

  function readAllParams() {
    return rows.map((r) => ({ key: r.keyInput.value.trim(), value: r.valueInput.value }));
  }

  function readUsableParams() {
    return readAllParams().filter((p) => p.key !== '');
  }

  function setBusy(busy) {
    sendInputBtn.disabled = busy;
    sendLaunchBtn.disabled = busy;
  }

  let lastUsedBtn = lastUsed;
  function markLastUsed(which) {
    lastUsedBtn = which;
    sendInputBtn.classList.toggle('deeplink-last-used', which === 'input');
    sendLaunchBtn.classList.toggle('deeplink-last-used', which === 'launch');
  }
  markLastUsed(lastUsed);

  async function send(which, actionLabel, fn) {
    const params = readUsableParams();
    if (!params.length) {
      statusEl.textContent = `${actionLabel}: enter at least one (name, value) pair.`;
      return;
    }
    markLastUsed(which);
    onChange();
    setBusy(true);
    statusEl.textContent = `${actionLabel}…`;
    try {
      const res = await fn(params);
      statusEl.textContent = res.ok ? `${actionLabel}: ${res.message}` : `${actionLabel} failed: ${res.error}`;
    } catch (err) {
      statusEl.textContent = `${actionLabel} failed: ${err.message}`;
    } finally {
      setBusy(false);
    }
  }

  sendInputBtn.addEventListener('click', () =>
    send('input', 'Send Input', (params) => api.sendDeeplinkInput({ params }))
  );
  sendLaunchBtn.addEventListener('click', () =>
    send('launch', 'Send Launch', (params) => api.sendDeeplinkLaunch({ appId: 'dev', params }))
  );

  function setLabel(text) {
    titleEl.textContent = text;
  }

  function getState() {
    return { collapsed: element.classList.contains('collapsed'), lastUsed: lastUsedBtn, params: readAllParams() };
  }

  return { element, setLabel, getState };
}

function migrateLegacy(cfg) {
  const sets = [];
  for (const key of LEGACY_KEYS) {
    const params = cfg[key];
    if (Array.isArray(params) && params.length) sets.push({ params });
  }
  return sets;
}

export function createDeeplinkView({ initialCollapsed = false } = {}) {
  const sets = [];

  const setsEl = document.createElement('div');
  setsEl.className = 'deeplink-sets';

  const addSetBtn = btn('+ Add set', { className: 'deeplink-add-set' });

  const body = document.createElement('div');
  body.className = 'deeplink-body-wrap';
  body.appendChild(setsEl);
  body.appendChild(addSetBtn);

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      api.setConfig({ [CONFIG_KEY]: sets.map((s) => s.getState()) });
    }, 400);
  }

  function renumber() {
    sets.forEach((s, i) => s.setLabel(`Set ${i + 1}`));
  }

  function removeSet(entry) {
    const idx = sets.indexOf(entry);
    if (idx === -1) return;
    sets.splice(idx, 1);
    entry.element.remove();
    renumber();
    scheduleSave();
  }

  function addSet({ params, collapsed = false, lastUsed = null } = {}, { focus = false } = {}) {
    const entry = createSet({
      params,
      collapsed,
      lastUsed,
      onChange: scheduleSave,
      onRemove: () => removeSet(entry)
    });
    sets.push(entry);
    setsEl.appendChild(entry.element);
    renumber();
    if (focus) entry.element.scrollIntoView({ block: 'nearest' });
    return entry;
  }

  addSetBtn.addEventListener('click', () => {
    addSet({}, { focus: true });
    scheduleSave();
  });

  const { element } = createCard({
    id: 'deeplink',
    title: 'Deeplink',
    initialCollapsed,
    actions: [],
    body
  });

  (async () => {
    const cfg = await api.getConfig();
    let stored = Array.isArray(cfg[CONFIG_KEY]) ? cfg[CONFIG_KEY] : migrateLegacy(cfg);
    if (!stored.length) stored = [{}, {}];
    for (const s of stored) addSet({ params: s.params, collapsed: !!s.collapsed, lastUsed: s.lastUsed });
  })();

  return element;
}
