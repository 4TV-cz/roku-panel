const { dialog, shell, BrowserWindow } = require('electron');
const fs = require('fs');
const { getConfig } = require('../config');
const { getScreenshotDir, getRecordingDir, DEFAULT_SCREENSHOT_DIR } = require('../paths');

function register(ipcMain) {
  // Snapshot of the folder configuration for the settings dialog: the raw
  // user-set values (blank when unset), the effective resolved paths, and the
  // bundled defaults used when a field is blank.
  ipcMain.handle('settings:getFolders', () => {
    const cfg = getConfig();
    return {
      screenshotDir: cfg.screenshotDir || '',
      recordingDir: cfg.recordingDir || '',
      resolvedScreenshotDir: getScreenshotDir(),
      resolvedRecordingDir: getRecordingDir(),
      defaultDir: DEFAULT_SCREENSHOT_DIR
    };
  });

  ipcMain.handle('settings:pickDirectory', async (evt, currentPath) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const defaultPath = currentPath && fs.existsSync(currentPath) ? currentPath : undefined;
    const result = await dialog.showOpenDialog(win, {
      title: 'Select folder',
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle('settings:revealFolder', (_evt, dirPath) => {
    if (!dirPath || !fs.existsSync(dirPath)) return { ok: false, error: 'Folder not found' };
    shell.openPath(dirPath);
    return { ok: true };
  });
}

module.exports = { register };
