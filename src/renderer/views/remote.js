import { api } from '../api.js';
import { createCard } from '../components/card.js';

const BUTTONS = [
  { key: 'PowerOff',      label: 'Power',   left: 41, top: 3.5,  width: 17, height: 5 },
  { key: 'Back',          label: 'Back',    left: 16, top: 11,   width: 30, height: 4.5 },
  { key: 'Home',          label: 'Home',    left: 53, top: 11,   width: 30, height: 4.5 },
  { key: 'Up',            label: 'Up',      left: 38, top: 19.5, width: 24, height: 5 },
  { key: 'Left',          label: 'Left',    left: 16, top: 26,   width: 18, height: 6 },
  { key: 'Select',        label: 'OK',      left: 38, top: 26,   width: 24, height: 6 },
  { key: 'Right',         label: 'Right',   left: 66, top: 26,   width: 18, height: 6 },
  { key: 'Down',          label: 'Down',    left: 38, top: 33,   width: 24, height: 5 },
  { key: 'InstantReplay', label: 'Replay',  left: 14, top: 40.5, width: 18, height: 4.5 },
  { key: 'Search',        label: 'Voice',   left: 41, top: 40.5, width: 18, height: 4.5 },
  { key: 'Info',          label: 'Options', left: 67, top: 40.5, width: 18, height: 4.5 },
  { key: 'Rev',           label: 'Rev',     left: 11, top: 47.5, width: 22, height: 5 },
  { key: 'Play',          label: 'Play',    left: 39, top: 47.5, width: 22, height: 5 },
  { key: 'Fwd',           label: 'Fwd',     left: 67, top: 47.5, width: 22, height: 5 }
];

export function createRemoteView({ initialCollapsed = false } = {}) {
  const remote = document.createElement('div');
  remote.className = 'remote';

  for (const b of BUTTONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remote-btn';
    btn.title = `${b.label} (${b.key})`;
    btn.dataset.key = b.key;
    btn.style.left = `${b.left}%`;
    btn.style.top = `${b.top}%`;
    btn.style.width = `${b.width}%`;
    btn.style.height = `${b.height}%`;
    remote.appendChild(btn);
  }

  remote.addEventListener('click', async (e) => {
    const target = e.target.closest('.remote-btn');
    if (!target) return;
    target.classList.add('pressed');
    setTimeout(() => target.classList.remove('pressed'), 150);
    const res = await api.keypress(target.dataset.key);
    if (!res.ok) console.error('keypress error:', res.error);
  });

  const { element } = createCard({
    id: 'remote',
    title: 'Remote',
    initialCollapsed,
    actions: [],
    body: remote
  });
  element.classList.add('remote-card');
  return element;
}
