export function createCard({ id, title, actions = [], body, onToggle, initialCollapsed = false }) {
  const section = document.createElement('section');
  section.className = 'card';
  if (id) section.dataset.cardId = id;
  if (initialCollapsed) section.classList.add('collapsed');
  section.innerHTML = `
    <header class="card-header">
      <button class="card-toggle" type="button" aria-expanded="true">
        <span class="chevron" aria-hidden="true">▾</span>
        <h2></h2>
      </button>
      <div class="card-actions"></div>
    </header>
    <div class="card-body"></div>
  `;
  section.querySelector('h2').textContent = title;

  const actionsEl = section.querySelector('.card-actions');
  for (const node of actions) actionsEl.appendChild(node);

  const bodyEl = section.querySelector('.card-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  const toggle = section.querySelector('.card-toggle');
  if (initialCollapsed) toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', (e) => {
    const collapsed = section.classList.toggle('collapsed');
    e.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    section.dispatchEvent(new CustomEvent('card:toggled', { bubbles: true, detail: { id, collapsed } }));
    if (onToggle) onToggle(collapsed);
  });

  return { element: section, body: bodyEl, actions: actionsEl };
}

export function btn(text, { primary = false, className = '' } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = ['btn', primary ? 'primary' : '', className].filter(Boolean).join(' ');
  b.textContent = text;
  return b;
}

export function chip(text = '', className = '') {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}
