import { api, on } from '../api.js';
import { createCard, btn } from '../components/card.js';

const MACROS_KEY = 'keyMacros';
const MACRO_DELAY_MS = 500;

export function createSendKeysView({ initialCollapsed = false } = {}) {
  const rebootBtn = btn('Reboot');
  const checkUpdateBtn = btn('Check for update');

  const userSelect = document.createElement('select');
  userSelect.className = 'select';

  const usernameInput = document.createElement('input');
  usernameInput.type = 'text';
  usernameInput.className = 'input';
  usernameInput.placeholder = 'username / email';
  usernameInput.autocomplete = 'off';

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.className = 'input';
  passwordInput.placeholder = 'password';
  passwordInput.autocomplete = 'off';

  const saveBtn = btn('Save');
  const removeBtn = btn('Remove');
  const sendUserBtn = btn('Send username');
  const sendPassBtn = btn('Send password');
  const signinBtn = btn('Sign in', { primary: true });

  function row(...children) {
    const r = document.createElement('div');
    r.className = 'card-row';
    for (const c of children) r.appendChild(c);
    return r;
  }

  const body = document.createElement('div');
  body.appendChild(row(rebootBtn, checkUpdateBtn));
  body.appendChild(row(userSelect, saveBtn, removeBtn, signinBtn));
  body.appendChild(row(usernameInput, sendUserBtn));
  body.appendChild(row(passwordInput, sendPassBtn));

  const sendTextForm = document.createElement('form');
  sendTextForm.className = 'add-form send-text-form';
  sendTextForm.innerHTML = `
    <input class="input js-send-text" type="text" placeholder="custom text to send" autocomplete="off" />
    <button type="submit" class="btn primary">Send text</button>
  `;
  body.appendChild(sendTextForm);

  // --- macros: record remote key presses, replay them as one sequence ---
  const recordBtn = btn('● Record');
  recordBtn.title = 'Record every key pressed on the Remote into a macro';

  const recordHint = document.createElement('span');
  recordHint.className = 'macro-hint';
  recordHint.textContent = 'Click Record, use the Remote, then Stop to save the sequence as a macro.';

  const macrosEl = document.createElement('div');
  macrosEl.className = 'macros';

  body.appendChild(row(recordBtn, recordHint));
  body.appendChild(macrosEl);

  const statusEl = document.createElement('div');
  statusEl.className = 'status';
  body.appendChild(statusEl);

  const { element } = createCard({
    id: 'send-keys',
    title: 'Send keys',
    initialCollapsed,
    actions: [],
    body
  });

  const sendTextInput = sendTextForm.querySelector('.js-send-text');

  let users = [];
  let macros = [];
  let recordedKeys = null;
  let stopListening = null;

  function macroLabel(macro) {
    return macro.name.trim() || 'Untitled macro';
  }

  function macroSummary(keys) {
    const MAX = 12;
    const shown = keys.slice(0, MAX).join(' → ');
    return keys.length > MAX
      ? `${shown} → … (${keys.length} keys)`
      : `${shown} (${keys.length} keys)`;
  }

  function saveMacros() {
    return api.setConfig({ [MACROS_KEY]: macros });
  }

  let macroSaveTimer = null;
  function scheduleMacroSave() {
    clearTimeout(macroSaveTimer);
    macroSaveTimer = setTimeout(saveMacros, 400);
  }

  function nextMacroName() {
    const taken = new Set(macros.map((m) => m.name));
    let i = macros.length + 1;
    while (taken.has(`Macro ${i}`)) i += 1;
    return `Macro ${i}`;
  }

  function makeMacroRow(macro) {
    const rowEl = document.createElement('div');
    rowEl.className = 'macro-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input macro-name';
    nameInput.placeholder = 'macro name';
    nameInput.autocomplete = 'off';
    nameInput.value = macro.name;
    nameInput.addEventListener('input', () => {
      macro.name = nameInput.value;
      scheduleMacroSave();
    });

    const keysEl = document.createElement('span');
    keysEl.className = 'macro-keys';
    keysEl.textContent = macroSummary(macro.keys);
    keysEl.title = macro.keys.join(', ');

    const sendBtn = btn('Send macro', { primary: true, className: 'macro-send' });
    sendBtn.addEventListener('click', async () => {
      const label = macroLabel(macro);
      sendBtn.disabled = true;
      statusEl.textContent = `Sending "${label}" (${macro.keys.length} keys)…`;
      try {
        const res = await api.sendKeys(macro.keys, { delayMs: MACRO_DELAY_MS });
        statusEl.textContent = res.ok
          ? `Macro "${label}" sent (${macro.keys.length} keys).`
          : `Error: ${res.error}`;
      } finally {
        sendBtn.disabled = false;
      }
    });

    const removeBtn = btn('×', { className: 'macro-remove' });
    removeBtn.title = 'Remove this macro';
    removeBtn.addEventListener('click', async () => {
      const label = macroLabel(macro);
      macros = macros.filter((m) => m !== macro);
      await saveMacros();
      renderMacros();
      statusEl.textContent = `Removed "${label}".`;
    });

    rowEl.appendChild(nameInput);
    rowEl.appendChild(keysEl);
    rowEl.appendChild(sendBtn);
    rowEl.appendChild(removeBtn);
    return rowEl;
  }

  function renderMacros() {
    macrosEl.innerHTML = '';
    if (!macros.length) {
      const empty = document.createElement('div');
      empty.className = 'macro-empty';
      empty.textContent = 'No macros recorded yet.';
      macrosEl.appendChild(empty);
      return;
    }
    for (const macro of macros) macrosEl.appendChild(makeMacroRow(macro));
  }

  function startRecording() {
    recordedKeys = [];
    recordBtn.classList.add('recording');
    recordBtn.textContent = '■ Stop recording (0)';
    stopListening = on('remote:keypress', ({ key }) => {
      recordedKeys.push(key);
      recordBtn.textContent = `■ Stop recording (${recordedKeys.length})`;
      statusEl.textContent = `Recording: ${recordedKeys.join(' → ')}`;
    });
    statusEl.textContent = 'Recording — press buttons on the Remote, then click Stop.';
  }

  function stopRecording() {
    const keys = recordedKeys || [];
    recordedKeys = null;
    if (stopListening) {
      stopListening();
      stopListening = null;
    }
    recordBtn.classList.remove('recording');
    recordBtn.textContent = '● Record';
    if (!keys.length) {
      statusEl.textContent = 'Recording stopped — no keys captured, nothing saved.';
      return;
    }
    const macro = { name: nextMacroName(), keys };
    macros.push(macro);
    saveMacros();
    renderMacros();
    statusEl.textContent = `Saved "${macro.name}" (${keys.length} keys).`;
  }

  recordBtn.addEventListener('click', () => {
    if (recordedKeys) stopRecording();
    else startRecording();
  });

  function loadUserIntoInputs(username) {
    const user = users.find((u) => u.username === username);
    usernameInput.value = user?.username || '';
    passwordInput.value = user?.password || '';
  }

  function renderUsers(selected) {
    userSelect.innerHTML = '';
    const newOpt = document.createElement('option');
    newOpt.value = '';
    newOpt.textContent = users.length ? '(new user)' : '(no users — fill in and click Save)';
    userSelect.appendChild(newOpt);
    for (const u of users) {
      const opt = document.createElement('option');
      opt.value = u.username;
      opt.textContent = u.username;
      if (u.username === selected) opt.selected = true;
      userSelect.appendChild(opt);
    }
    removeBtn.disabled = !selected;
  }

  async function load() {
    const cfg = await api.getConfig();
    users = Array.isArray(cfg.users) ? cfg.users : [];
    const selected = cfg.selectedUser ?? null;
    renderUsers(selected);
    loadUserIntoInputs(selected);
    macros = (Array.isArray(cfg[MACROS_KEY]) ? cfg[MACROS_KEY] : [])
      .filter((m) => m && Array.isArray(m.keys) && m.keys.length)
      .map((m, i) => ({ name: typeof m.name === 'string' ? m.name : `Macro ${i + 1}`, keys: m.keys }));
    renderMacros();
  }

  async function persist(selected) {
    const res = await api.setConfig({ users, selectedUser: selected ?? null });
    if (!res.ok) statusEl.textContent = `Error saving config: ${res.error}`;
  }

  function currentCreds() {
    return { username: usernameInput.value.trim(), password: passwordInput.value };
  }

  async function runAction(button, label, fn) {
    const { username, password } = currentCreds();
    if (!username && label !== 'Password') return;
    button.disabled = true;
    statusEl.textContent = `${label} for ${username || '(no user)'}…`;
    try {
      const res = await fn({ username, password });
      statusEl.textContent = res.ok ? `${label} sent.` : `Error: ${res.error}`;
    } finally {
      button.disabled = false;
    }
  }

  userSelect.addEventListener('change', () => {
    const sel = userSelect.value || null;
    loadUserIntoInputs(sel);
    persist(sel);
    removeBtn.disabled = !sel;
  });

  saveBtn.addEventListener('click', async () => {
    const { username, password } = currentCreds();
    if (!username) {
      statusEl.textContent = 'Enter a username before saving.';
      return;
    }
    const existing = users.findIndex((u) => u.username === username);
    if (existing >= 0) users[existing] = { username, password };
    else users.push({ username, password });
    await persist(username);
    renderUsers(username);
    statusEl.textContent = `Saved ${username}.`;
  });

  removeBtn.addEventListener('click', async () => {
    const sel = userSelect.value;
    if (!sel) return;
    users = users.filter((u) => u.username !== sel);
    const nextSel = users[0]?.username ?? null;
    await persist(nextSel);
    renderUsers(nextSel);
    loadUserIntoInputs(nextSel);
    statusEl.textContent = `Removed ${sel}.`;
  });

  signinBtn.addEventListener('click', () =>
    runAction(signinBtn, 'Sign in', (c) => api.signIn(c))
  );
  sendUserBtn.addEventListener('click', () =>
    runAction(sendUserBtn, 'Username', (c) => api.sendUsername({ username: c.username }))
  );
  sendPassBtn.addEventListener('click', () =>
    runAction(sendPassBtn, 'Password', (c) => api.sendPassword({ password: c.password }))
  );

  rebootBtn.addEventListener('click', async () => {
    rebootBtn.disabled = true;
    statusEl.textContent = 'Rebooting device…';
    try {
      const res = await api.reboot();
      statusEl.textContent = res.ok
        ? `Reboot sequence sent (model ${res.modelNumber}, ${res.keys.length} keys).`
        : `Reboot failed: ${res.error}`;
    } finally {
      rebootBtn.disabled = false;
    }
  });

  checkUpdateBtn.addEventListener('click', async () => {
    checkUpdateBtn.disabled = true;
    statusEl.textContent = 'Sending check-for-update sequence…';
    try {
      const res = await api.checkForUpdate();
      statusEl.textContent = res.ok
        ? `Check-for-update sent (model ${res.modelNumber}, ${res.keys.length} keys).`
        : `Check for update failed: ${res.error}`;
    } finally {
      checkUpdateBtn.disabled = false;
    }
  });

  sendTextForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = sendTextInput.value;
    if (!text) return;
    const submitBtn = sendTextForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    statusEl.textContent = `Sending "${text}"…`;
    try {
      const res = await api.sendText(text);
      statusEl.textContent = res.ok ? `Sent "${text}".` : `Error: ${res.error}`;
    } finally {
      submitBtn.disabled = false;
    }
  });

  load();

  return element;
}
