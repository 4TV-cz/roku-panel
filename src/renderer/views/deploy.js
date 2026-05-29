import { api } from '../api.js';
import { createCard, btn } from '../components/card.js';

export function createDeployView({ initialCollapsed = false } = {}) {
  const selectBtn = btn('Select ZIP', { primary: true });
  const folderBtn = btn('Select folder');
  const deleteBtn = btn('Delete installed app');

  const recentSelect = document.createElement('select');
  recentSelect.className = 'select grow';
  recentSelect.title = 'Recent deploy targets';

  const deployBtn = btn('Deploy');

  const row = document.createElement('div');
  row.className = 'card-row';
  row.appendChild(recentSelect);
  row.appendChild(deployBtn);

  const statusEl = document.createElement('div');
  statusEl.className = 'status';
  statusEl.textContent = 'Pick a .zip or a folder to sideload to the Roku.';

  const body = document.createElement('div');
  body.appendChild(row);
  body.appendChild(statusEl);

  const { element } = createCard({
    id: 'deploy',
    title: 'Deploy app',
    initialCollapsed,
    actions: [deleteBtn, folderBtn, selectBtn],
    body
  });

  function syncDeployBtn() {
    deployBtn.disabled = !recentSelect.value;
  }

  function labelFor(item) {
    return item.kind === 'folder' ? `${item.path}  [folder]` : item.path;
  }

  function renderRecent(list, { keepSelected = false } = {}) {
    const previous = keepSelected ? recentSelect.value : '';
    recentSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = list.length ? '(select a recent target)' : '(no recent targets)';
    recentSelect.appendChild(placeholder);
    for (const item of list) {
      const opt = document.createElement('option');
      const key = `${item.kind}:${item.path}`;
      opt.value = key;
      opt.dataset.kind = item.kind;
      opt.dataset.path = item.path;
      opt.textContent = labelFor(item);
      opt.title = item.path;
      recentSelect.appendChild(opt);
    }
    if (previous && [...recentSelect.options].some((o) => o.value === previous)) {
      recentSelect.value = previous;
    } else if (list.length) {
      recentSelect.value = `${list[0].kind}:${list[0].path}`;
    }
    recentSelect.disabled = list.length === 0;
    syncDeployBtn();
  }

  async function refreshRecent() {
    const list = await api.listRecentDeployTargets();
    renderRecent(list);
  }

  function setBusy(busy) {
    selectBtn.disabled = busy;
    folderBtn.disabled = busy;
    deleteBtn.disabled = busy;
    deployBtn.disabled = busy;
    recentSelect.disabled = busy;
  }

  async function deployZipPath(filepath) {
    const filename = filepath.split(/[\\/]/).pop();
    setBusy(true);
    statusEl.textContent = `Deploying ${filename}…`;
    try {
      const res = await api.deployZip(filepath);
      statusEl.textContent = res.ok
        ? `Deployed ${res.filename}: ${res.message}`
        : `Deploy failed: ${res.error}`;
      if (Array.isArray(res.recent)) renderRecent(res.recent, { keepSelected: true });
      else await refreshRecent();
    } finally {
      setBusy(false);
      syncDeployBtn();
    }
  }

  async function deployFolderPath(folderpath) {
    const folderName = folderpath.split(/[\\/]/).pop();
    setBusy(true);
    statusEl.textContent = `Zipping ${folderName} and deploying…`;
    try {
      const res = await api.deployFolder(folderpath);
      statusEl.textContent = res.ok
        ? `Deployed ${res.message}`
        : `Deploy failed: ${res.error}`;
      if (Array.isArray(res.recent)) renderRecent(res.recent, { keepSelected: true });
      else await refreshRecent();
    } finally {
      setBusy(false);
      syncDeployBtn();
    }
  }

  selectBtn.addEventListener('click', async () => {
    const pick = await api.pickZip();
    if (!pick.ok) {
      if (!pick.canceled) statusEl.textContent = `Error: ${pick.error || 'could not pick file'}`;
      return;
    }
    await deployZipPath(pick.filepath);
  });

  folderBtn.addEventListener('click', async () => {
    const pick = await api.pickFolder();
    if (!pick.ok) {
      if (!pick.canceled) statusEl.textContent = `Error: ${pick.error || 'could not pick folder'}`;
      return;
    }
    if (!pick.hasManifest) {
      statusEl.textContent = `Error: "${pick.folder}" has no "manifest" file at its root.`;
      return;
    }
    await deployFolderPath(pick.folderpath);
  });

  recentSelect.addEventListener('change', syncDeployBtn);

  deployBtn.addEventListener('click', async () => {
    const opt = recentSelect.selectedOptions[0];
    if (!opt || !opt.dataset.path) return;
    if (opt.dataset.kind === 'folder') await deployFolderPath(opt.dataset.path);
    else await deployZipPath(opt.dataset.path);
  });

  deleteBtn.addEventListener('click', async () => {
    setBusy(true);
    statusEl.textContent = 'Deleting installed app…';
    try {
      const res = await api.deleteApp();
      statusEl.textContent = res.ok
        ? `Deleted: ${res.message}`
        : `Delete failed: ${res.error}`;
    } finally {
      setBusy(false);
      syncDeployBtn();
    }
  });

  refreshRecent();

  return element;
}
