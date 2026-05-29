import { on } from '../api.js';

export function createStatusBar(container) {
  container.classList.add('status-bar');
  container.innerHTML = `
    <span class="device-status offline">
      <span class="dot"></span>
      <span class="label">Offline</span>
    </span>
  `;

  const wrapper = container.querySelector('.device-status');
  const label = container.querySelector('.label');

  on('device:status', ({ host, online }) => {
    wrapper.classList.toggle('online', online);
    wrapper.classList.toggle('offline', !online);
    label.textContent = online ? host : 'Offline';
  });
}
