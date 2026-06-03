import { api } from '../api.js';
import { createCard, btn } from '../components/card.js';

const FIELD_COUNT = 4;
const PLACEHOLDERS = [
  ['contentId', 'value'],
  ['mediaType', 'value'],
  ['name', 'value'],
  ['name', 'value']
];

export function createDeeplinkView({ initialCollapsed = false } = {}) {
  const sendInputBtn = btn('Send Input');
  const sendLaunchBtn = btn('Send Launch', { primary: true });

  const fieldsEl = document.createElement('div');
  fieldsEl.className = 'deeplink-fields';

  const fields = [];
  for (let i = 0; i < FIELD_COUNT; i++) {
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'input';
    keyInput.placeholder = PLACEHOLDERS[i][0];
    keyInput.autocomplete = 'off';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'input';
    valueInput.placeholder = PLACEHOLDERS[i][1];
    valueInput.autocomplete = 'off';

    fieldsEl.appendChild(keyInput);
    fieldsEl.appendChild(valueInput);
    fields.push({ keyInput, valueInput });
  }

  const actionsCol = document.createElement('div');
  actionsCol.className = 'deeplink-actions';
  actionsCol.appendChild(sendInputBtn);
  actionsCol.appendChild(sendLaunchBtn);

  const grid = document.createElement('div');
  grid.className = 'deeplink-body';
  grid.appendChild(fieldsEl);
  grid.appendChild(actionsCol);

  const statusEl = document.createElement('div');
  statusEl.className = 'status';

  const body = document.createElement('div');
  body.appendChild(grid);
  body.appendChild(statusEl);

  const { element } = createCard({
    id: 'deeplink',
    title: 'Deeplink',
    initialCollapsed,
    actions: [],
    body
  });

  function readAllParams() {
    return fields.map((f) => ({ key: f.keyInput.value.trim(), value: f.valueInput.value }));
  }

  function readUsableParams() {
    return readAllParams().filter((p) => p.key !== '');
  }

  function fillFrom(list) {
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < FIELD_COUNT; i++) {
      fields[i].keyInput.value = arr[i]?.key ?? '';
      fields[i].valueInput.value = arr[i]?.value ?? '';
    }
  }

  function setBusy(busy) {
    sendInputBtn.disabled = busy;
    sendLaunchBtn.disabled = busy;
  }

  async function send(label, fn) {
    const params = readUsableParams();
    if (!params.length) {
      statusEl.textContent = `${label}: enter at least one (name, value) pair.`;
      return;
    }
    setBusy(true);
    statusEl.textContent = `${label}…`;
    try {
      const res = await fn(params);
      statusEl.textContent = res.ok ? `${label}: ${res.message}` : `${label} failed: ${res.error}`;
    } catch (err) {
      statusEl.textContent = `${label} failed: ${err.message}`;
    } finally {
      setBusy(false);
    }
  }

  sendInputBtn.addEventListener('click', () =>
    send('Send Input', (params) => api.sendDeeplinkInput({ params }))
  );
  sendLaunchBtn.addEventListener('click', () =>
    send('Send Launch', (params) => api.sendDeeplinkLaunch({ appId: 'dev', params }))
  );

  // Persist edits, debounced.
  let saveTimer = null;
  for (const f of fields) {
    for (const el of [f.keyInput, f.valueInput]) {
      el.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => api.setConfig({ deeplinkParams: readAllParams() }), 400);
      });
    }
  }

  (async () => {
    const cfg = await api.getConfig();
    fillFrom(cfg.deeplinkParams);
  })();

  return element;
}
