import { api, emit } from '../api.js';
import { btn } from './card.js';

// Centered settings dialog. Currently exposes the screenshot & recording output
// folders; written as a Promise so callers can await its close if needed.
export function openSettingsDialog() {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'modal settings-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('h3');
    titleEl.className = 'modal-title';
    titleEl.textContent = 'Settings';

    const form = document.createElement('div');
    form.className = 'settings-form';

    // Build a labelled folder row: text input + Browse + Reset, with a hint
    // line showing the effective folder used when the field is left blank.
    function folderRow({ label, defaultPath }) {
      const row = document.createElement('div');
      row.className = 'settings-row';

      const labelEl = document.createElement('label');
      labelEl.className = 'settings-label';
      labelEl.textContent = label;

      const inputGroup = document.createElement('div');
      inputGroup.className = 'settings-input-group';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input settings-path';
      input.placeholder = defaultPath;
      input.spellcheck = false;

      const browseBtn = btn('Browse…');
      const resetBtn = btn('Reset');

      inputGroup.append(input, browseBtn, resetBtn);

      const hint = document.createElement('div');
      hint.className = 'settings-hint';

      function updateHint() {
        hint.textContent = input.value.trim()
          ? ''
          : `Default: ${defaultPath}`;
      }
      updateHint();
      input.addEventListener('input', updateHint);

      browseBtn.addEventListener('click', async () => {
        const res = await api.pickDirectory(input.value.trim() || defaultPath);
        if (res && res.ok) {
          input.value = res.path;
          updateHint();
        }
      });

      resetBtn.addEventListener('click', () => {
        input.value = '';
        updateHint();
        input.focus();
      });

      row.append(labelEl, inputGroup, hint);
      return { row, input };
    }

    // Build a labelled dropdown row from a list of { value, label } options.
    function selectRow({ label, options, hint: hintText }) {
      const row = document.createElement('div');
      row.className = 'settings-row';

      const labelEl = document.createElement('label');
      labelEl.className = 'settings-label';
      labelEl.textContent = label;

      const select = document.createElement('select');
      select.className = 'select settings-select';
      for (const opt of options) {
        const o = document.createElement('option');
        o.value = String(opt.value);
        o.textContent = opt.label;
        select.appendChild(o);
      }

      row.append(labelEl, select);

      if (hintText) {
        const hint = document.createElement('div');
        hint.className = 'settings-hint';
        hint.textContent = hintText;
        row.appendChild(hint);
      }
      return { row, select };
    }

    const note = document.createElement('div');
    note.className = 'modal-message';
    note.textContent = 'Choose where captured screenshots and recordings are saved, and the recording resolution and format. Leave a folder blank to use the default.';

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = btn('Cancel');
    const saveBtn = btn('Save', { primary: true });
    actions.append(cancelBtn, saveBtn);

    dialog.append(titleEl, note, form, actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let screenshotInput = null;
    let recordingInput = null;
    let resolutionSelect = null;
    let formatSelect = null;

    function close(result) {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
    }

    cancelBtn.addEventListener('click', () => close(false));
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(false); });
    document.addEventListener('keydown', onKey);

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      await api.setConfig({
        screenshotDir: screenshotInput.value.trim(),
        recordingDir: recordingInput.value.trim(),
        recordingResolution: Number(resolutionSelect.value),
        recordingFormat: formatSelect.value
      });
      // Folders changed — refresh the screenshots list against the new paths.
      emit('screenshots:changed');
      // Recording prefs changed — let the capture view re-read them.
      emit('config:changed');
      close(true);
    });

    // Populate from current settings.
    (async () => {
      const s = await api.getFolderSettings();
      const screenshots = folderRow({ label: 'Screenshots folder', defaultPath: s.defaultDir });
      const recordings = folderRow({ label: 'Recordings folder', defaultPath: s.defaultDir });
      screenshots.input.value = s.screenshotDir || '';
      recordings.input.value = s.recordingDir || '';
      screenshotInput = screenshots.input;
      recordingInput = recordings.input;

      const cfg = await api.getConfig();
      const resolution = selectRow({
        label: 'Recording resolution',
        options: [
          { value: 720, label: '720p (1280×720)' },
          { value: 1080, label: '1080p (1920×1080)' }
        ]
      });
      const format = selectRow({
        label: 'Recording format',
        options: [
          { value: 'webm', label: 'WebM' },
          { value: 'mp4', label: 'MP4' }
        ]
      });
      resolution.select.value = String(cfg.recordingResolution || 1080);
      format.select.value = cfg.recordingFormat || 'webm';
      resolutionSelect = resolution.select;
      formatSelect = format.select;

      form.append(screenshots.row, recordings.row, resolution.row, format.row);
      // Re-run hint after setting values.
      screenshots.input.dispatchEvent(new Event('input'));
      recordings.input.dispatchEvent(new Event('input'));
      screenshots.input.focus();
    })();
  });
}
