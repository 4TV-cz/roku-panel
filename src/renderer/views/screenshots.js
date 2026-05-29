import { api, on } from '../api.js';
import { createCard, btn } from '../components/card.js';

export function createScreenshotsView({ initialCollapsed = false } = {}) {
  const screenshotBtn = btn('Screenshot', { primary: true });

  const { element } = createCard({
    id: 'screenshots',
    title: 'Screenshots',
    initialCollapsed,
    actions: [screenshotBtn],
    body: `
      <div class="status js-status"></div>
      <ul class="screenshot-list"></ul>
    `
  });

  const statusEl = element.querySelector('.js-status');
  const listEl = element.querySelector('.screenshot-list');

  function render(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = '<li class="empty">No screenshots yet — click Screenshot to capture.</li>';
      return;
    }
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'screenshot-thumb';
      li.dataset.filename = it.filename;
      li.title = it.filename;
      const url = `screenshot://localhost/${encodeURIComponent(it.filename)}?t=${it.mtime}`;
      const media =
        it.kind === 'video'
          ? `<video src="${url}" preload="metadata" muted playsinline></video>
             <span class="kind-badge">REC</span>`
          : `<img src="${url}" alt="" />`;
      li.innerHTML = `
        ${media}
        <button class="delete-btn" type="button" aria-label="Delete" title="Delete">×</button>
        <span class="name"></span>
      `;
      const img = li.querySelector('img');
      if (img) img.alt = it.filename;
      li.querySelector('.name').textContent = it.filename;
      listEl.appendChild(li);
    }
  }

  async function load() {
    const items = await api.listScreenshots();
    render(items);
  }

  screenshotBtn.addEventListener('click', async () => {
    screenshotBtn.disabled = true;
    statusEl.textContent = 'Capturing screenshot…';
    try {
      const res = await api.screenshot();
      statusEl.textContent = res.ok ? `Saved ${res.filename}` : `Screenshot failed: ${res.error}`;
      if (res.ok) await load();
    } finally {
      screenshotBtn.disabled = false;
    }
  });

  listEl.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.delete-btn');
    if (delBtn) {
      e.stopPropagation();
      const thumb = delBtn.closest('.screenshot-thumb');
      const filename = thumb.dataset.filename;
      const res = await api.deleteScreenshot(filename);
      if (res.ok) {
        statusEl.textContent = `Deleted ${filename}`;
        await load();
      } else {
        statusEl.textContent = `Delete failed: ${res.error}`;
      }
      return;
    }
    const thumb = e.target.closest('.screenshot-thumb');
    if (!thumb) return;
    api.openScreenshot(thumb.dataset.filename);
  });

  on('screenshots:changed', load);

  load();

  return element;
}
