import { api } from '../api.js';
import { createCard, btn } from '../components/card.js';

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
