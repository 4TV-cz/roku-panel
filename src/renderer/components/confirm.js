import { btn } from './card.js';

// Themed replacement for window.confirm(). Returns a Promise<boolean>.
export function confirmDialog(message, {
  title = 'Confirm',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('h3');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;

    const msgEl = document.createElement('div');
    msgEl.className = 'modal-message';
    msgEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = btn(cancelText);
    const confirmBtn = btn(confirmText, { primary: true });
    if (danger) confirmBtn.classList.add('danger');
    actions.append(cancelBtn, confirmBtn);

    dialog.append(titleEl, msgEl, actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    confirmBtn.focus();

    function close(result) {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    }

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(false); });
    document.addEventListener('keydown', onKey);
  });
}
