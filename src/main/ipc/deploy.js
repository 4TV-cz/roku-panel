const { dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { deployZip, deployBuffer, deleteApp } = require('../roku/deploy');
const { zipFolder, hasManifest } = require('../roku/zip-folder');
const { getDeviceHost, getDeviceCredentials } = require('../device');
const { getConfig, saveConfig } = require('../config');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';
const MAX_RECENT = 10;

function getRecentZips() {
  const list = getConfig().recentZips;
  return Array.isArray(list) ? list : [];
}

function getRecentFolders() {
  const list = getConfig().recentFolders;
  return Array.isArray(list) ? list : [];
}

function rememberRecentZip(filepath) {
  const next = [filepath, ...getRecentZips().filter((p) => p !== filepath)].slice(0, MAX_RECENT);
  saveConfig({ recentZips: next });
  return mergedRecent();
}

function rememberRecentFolder(folderpath) {
  const next = [folderpath, ...getRecentFolders().filter((p) => p !== folderpath)].slice(0, MAX_RECENT);
  saveConfig({ recentFolders: next });
  return mergedRecent();
}

// Folders first (the recommended fast path), then ZIPs. Each list keeps its
// own most-recent-first order.
function mergedRecent() {
  return [
    ...getRecentFolders().map((p) => ({ path: p, kind: 'folder' })),
    ...getRecentZips().map((p) => ({ path: p, kind: 'zip' }))
  ];
}

function register(ipcMain) {
  ipcMain.handle('deploy:recent', () => mergedRecent());

  ipcMain.handle('deploy:pickZip', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const lastDir = getConfig().lastDeployDir || undefined;
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Roku app ZIP',
      defaultPath: lastDir,
      filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const filepath = result.filePaths[0];
    saveConfig({ lastDeployDir: path.dirname(filepath) });
    return { ok: true, filepath, filename: path.basename(filepath) };
  });

  ipcMain.handle('deploy:pickFolder', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const lastDir = getConfig().lastDeployFolderDir || undefined;
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Roku app folder (must contain "manifest")',
      defaultPath: lastDir,
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const folderpath = result.filePaths[0];
    saveConfig({ lastDeployFolderDir: path.dirname(folderpath) });
    return {
      ok: true,
      folderpath,
      folder: path.basename(folderpath),
      hasManifest: hasManifest(folderpath)
    };
  });

  ipcMain.handle('deploy:delete', async () => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    const { username, password } = getDeviceCredentials();
    if (!password) return { ok: false, error: 'device password not set (config.deviceCredentials.password)' };
    try {
      const res = await deleteApp(host, { username, password });
      return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.message };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('deploy:zip', async (_evt, zipPath) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    const { username, password } = getDeviceCredentials();
    if (!password) return { ok: false, error: 'device password not set (config.deviceCredentials.password)' };
    const recent = rememberRecentZip(zipPath);
    try {
      const res = await deployZip(host, zipPath, { username, password });
      return res.ok
        ? { ok: true, message: res.message, filename: path.basename(zipPath), recent }
        : { ok: false, error: res.message, recent };
    } catch (err) {
      return { ok: false, error: err.message, recent };
    }
  });

  ipcMain.handle('deploy:folder', async (_evt, folderPath) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    const { username, password } = getDeviceCredentials();
    if (!password) return { ok: false, error: 'device password not set (config.deviceCredentials.password)' };
    if (!folderPath) return { ok: false, error: 'folderPath required' };
    if (!fs.existsSync(folderPath)) return { ok: false, error: `Folder not found: ${folderPath}` };
    if (!hasManifest(folderPath)) {
      return { ok: false, error: `Not a Roku project: no "manifest" file in ${folderPath}` };
    }
    const recent = rememberRecentFolder(folderPath);
    try {
      const t0 = Date.now();
      const bytes = zipFolder(folderPath);
      const zippedMs = Date.now() - t0;
      const filename = path.basename(folderPath) + '.zip';
      const res = await deployBuffer(host, bytes, filename, { username, password });
      const sizeKb = (bytes.length / 1024).toFixed(1);
      const detail = `${filename} (${sizeKb} KB, zipped in ${zippedMs} ms)`;
      return res.ok
        ? { ok: true, message: `${res.message} — ${detail}`, filename, recent }
        : { ok: false, error: `${res.message} — ${detail}`, recent };
    } catch (err) {
      return { ok: false, error: err.message, recent };
    }
  });
}

module.exports = { register };
