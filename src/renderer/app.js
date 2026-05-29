import { api, emit, $ } from './api.js';
import { createDeviceInfoView } from './views/device-info.js';
import { createScreenshotsView } from './views/screenshots.js';
import { createSendKeysView } from './views/send-keys.js';
import { createTelnetView } from './views/telnet.js';
import { createRemoteView } from './views/remote.js';
import { createCaptureView } from './views/capture.js';
import { createDeployView } from './views/deploy.js';
import { createStatusBar } from './views/status-bar.js';

const content = $('#content');
const sidebar = $('#sidebar');

// --- card reordering ---

function applySavedOrder(savedOrder) {
  if (!Array.isArray(savedOrder) || !savedOrder.length) return;
  const byId = {};
  const remaining = [];
  for (const child of [...content.children]) {
    byId[child.dataset.cardId] = child;
    remaining.push(child.dataset.cardId);
  }
  const ordered = [];
  for (const id of savedOrder) {
    if (byId[id]) {
      ordered.push(id);
      const i = remaining.indexOf(id);
      if (i >= 0) remaining.splice(i, 1);
    }
  }
  ordered.push(...remaining);
  for (const id of ordered) content.appendChild(byId[id]);
}

function currentOrder() {
  return [...content.children].map((c) => c.dataset.cardId).filter(Boolean);
}

function clearDropIndicators() {
  content.querySelectorAll('.drop-target-before, .drop-target-after').forEach((el) => {
    el.classList.remove('drop-target-before', 'drop-target-after');
  });
}

let draggedId = null;

content.addEventListener('dragstart', (e) => {
  if (e.target.closest('select, input, textarea, button, .telnet-console, .screenshot-thumb')) {
    e.preventDefault();
    return;
  }
  const card = e.target.closest('.card');
  if (!card || card.parentElement !== content) return;
  draggedId = card.dataset.cardId;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});

content.addEventListener('dragover', (e) => {
  if (!draggedId) return;
  const over = e.target.closest('.card');
  if (!over || over.parentElement !== content || over.dataset.cardId === draggedId) return;
  e.preventDefault();
  const rect = over.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  clearDropIndicators();
  over.classList.add(after ? 'drop-target-after' : 'drop-target-before');
});

content.addEventListener('drop', async (e) => {
  if (!draggedId) return;
  const over = e.target.closest('.card');
  if (!over || over.parentElement !== content || over.dataset.cardId === draggedId) {
    clearDropIndicators();
    return;
  }
  e.preventDefault();
  const dragged = content.querySelector(`[data-card-id="${draggedId}"]`);
  const rect = over.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  if (after) over.after(dragged);
  else over.before(dragged);
  clearDropIndicators();
  await api.setConfig({ cardOrder: currentOrder() });
});

content.addEventListener('dragend', () => {
  draggedId = null;
  clearDropIndicators();
  content.querySelectorAll('.card.dragging').forEach((el) => el.classList.remove('dragging'));
});

// --- persist card collapsed state ---

function currentCollapsedMap() {
  const state = {};
  document.querySelectorAll('.card[data-card-id]').forEach((c) => {
    state[c.dataset.cardId] = c.classList.contains('collapsed');
  });
  return state;
}

document.addEventListener('card:toggled', async () => {
  await api.setConfig({ cardCollapsed: currentCollapsedMap() });
});

// --- init ---

(async () => {
  const cfg = await api.getConfig();
  const collapsedMap = cfg.cardCollapsed || {};
  const c = (id) => !!collapsedMap[id];

  content.appendChild(createDeviceInfoView({ initialCollapsed: c('device-info') }));
  content.appendChild(createScreenshotsView({ initialCollapsed: c('screenshots') }));
  content.appendChild(createTelnetView({ initialCollapsed: c('telnet') }));
  content.appendChild(createSendKeysView({ initialCollapsed: c('send-keys') }));
  content.appendChild(createCaptureView({ initialCollapsed: c('capture') }));
  content.appendChild(createDeployView({ initialCollapsed: c('deploy') }));

  sidebar.appendChild(createRemoteView({ initialCollapsed: c('remote') }));

  createStatusBar($('#status-bar'));

  applySavedOrder(cfg.cardOrder);
  for (const child of content.children) child.setAttribute('draggable', 'true');

  refreshDeviceStatus();
  setInterval(refreshDeviceStatus, 5000);
})();

async function refreshDeviceStatus() {
  const result = await api.ping();
  emit('device:status', result);
}
