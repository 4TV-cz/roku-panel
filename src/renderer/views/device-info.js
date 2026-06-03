import { api, on } from '../api.js';
import { createCard, btn } from '../components/card.js';

export function createDeviceInfoView({ initialCollapsed = false } = {}) {
  const discoverBtn = btn('Get Roku IP', { primary: true });
  const openBrowserBtn = btn('Open in browser');

  const { element } = createCard({
    id: 'device-info',
    title: 'Device information',
    initialCollapsed,
    actions: [discoverBtn, openBrowserBtn],
    body: `
      <dl class="device-info" hidden>
        <div class="device-info-row">
          <dt>Model</dt>
          <dd class="device-model">—</dd>
        </div>
        <div class="device-info-row">
          <dt>Version</dt>
          <dd class="device-version">—</dd>
        </div>
      </dl>
      <div class="status js-status"></div>
      <ul class="device-list"></ul>
    `
  });

  const statusEl = element.querySelector('.js-status');
  const deviceList = element.querySelector('.device-list');
  const deviceInfoEl = element.querySelector('.device-info');
  const deviceModelEl = element.querySelector('.device-model');
  const deviceVersionEl = element.querySelector('.device-version');

  function renderDevices(devices) {
    deviceList.innerHTML = '';
    if (!devices.length) {
      deviceList.innerHTML = '<li class="empty">No Roku devices found.</li>';
      return;
    }
    for (const d of devices) {
      const li = document.createElement('li');
      li.className = 'device-row';
      li.dataset.ip = d.ip;
      const name = d.ecp?.name || '(no name)';
      const model = d.ecp?.model || d.ecp?.modelNumber || '';
      const software = d.ecp?.software ? `sw ${d.ecp.software}` : '';
      const iface = d.iface ? `via ${d.iface}` : '';
      const meta = [model, software, iface].filter(Boolean).join(' · ');
      li.innerHTML = `
        <div class="device-main">
          <code class="ip">${d.ip}</code>
          <span class="name"></span>
        </div>
        <div class="device-meta"></div>
        <button class="btn use-btn" data-ip="${d.ip}">Use</button>
      `;
      li.querySelector('.name').textContent = name;
      li.querySelector('.device-meta').textContent = meta;
      deviceList.appendChild(li);
    }
  }

  async function setHost(ip) {
    const res = await api.setHost(ip);
    if (!res.ok) {
      statusEl.textContent = `Error saving host: ${res.error}`;
      return;
    }
    statusEl.textContent = `Selected ${res.host}`;
  }

  async function discover() {
    discoverBtn.disabled = true;
    statusEl.textContent = 'Scanning LAN for Roku devices…';
    deviceList.innerHTML = '';
    try {
      const res = await api.discover();
      if (!res.ok) {
        statusEl.textContent = `Error: ${res.error}`;
        return;
      }
      statusEl.textContent = `Found ${res.devices.length} device(s).`;
      renderDevices(res.devices);
      if (res.devices.length > 0) {
        const current = await api.getHost();
        const hasCurrent = current && res.devices.some((d) => d.ip === current);
        if (!hasCurrent) await setHost(res.devices[0].ip);
      }
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    } finally {
      discoverBtn.disabled = false;
    }
  }

  discoverBtn.addEventListener('click', discover);

  openBrowserBtn.addEventListener('click', async () => {
    const res = await api.openInBrowser();
    if (!res.ok) statusEl.textContent = `Error: ${res.error}`;
  });

  deviceList.addEventListener('click', (e) => {
    const useBtn = e.target.closest('.use-btn');
    if (!useBtn) return;
    setHost(useBtn.dataset.ip);
  });

  on('device:status', ({ host, online, info }) => {
    element.querySelectorAll('.device-row').forEach((row) => {
      row.classList.toggle('selected', row.dataset.ip === host);
    });
    if (online && info) {
      const modelLabel = [info.model, info.modelNumber && `(${info.modelNumber})`].filter(Boolean).join(' ') || '—';
      const versionLabel = [info.software, info.build].filter(Boolean).join('.') || '—';
      deviceModelEl.textContent = modelLabel;
      deviceVersionEl.textContent = versionLabel;
      deviceInfoEl.hidden = false;
    } else {
      deviceInfoEl.hidden = true;
    }
  });

  return element;
}
