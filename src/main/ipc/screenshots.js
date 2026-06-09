const { shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { takeScreenshot } = require('../roku/screenshot');
const { getDeviceHost, getDeviceCredentials } = require('../device');
const { SCREENSHOT_DIR } = require('../paths');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';

function register(ipcMain) {
  ipcMain.handle('roku:screenshot', async () => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    const { username, password } = getDeviceCredentials();
    if (!password) return { ok: false, error: 'device password not set (config.deviceCredentials.password)' };
    try {
      const filepath = await takeScreenshot(host, { username, password, outDir: SCREENSHOT_DIR });
      return { ok: true, filepath, filename: path.basename(filepath) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('screenshots:list', () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) return [];
    return fs.readdirSync(SCREENSHOT_DIR)
      .filter((f) => /\.(jpg|jpeg|png|webm|mp4)$/i.test(f))
      .map((filename) => {
        const stat = fs.statSync(path.join(SCREENSHOT_DIR, filename));
        const isVideo = /\.(webm|mp4)$/i.test(filename);
        return { filename, mtime: stat.mtimeMs, size: stat.size, kind: isVideo ? 'video' : 'image' };
      })
      .sort((a, b) => b.mtime - a.mtime);
  });

  ipcMain.handle('screenshots:open', (_evt, filename) => {
    const safe = path.basename(filename);
    const fullpath = path.join(SCREENSHOT_DIR, safe);
    if (!fs.existsSync(fullpath)) return { ok: false, error: 'File not found' };
    shell.openPath(fullpath);
    return { ok: true };
  });

  ipcMain.handle('capture:save', (_evt, bytes) => {
    if (!bytes || !bytes.byteLength) return { ok: false, error: 'empty payload' };
    const ts = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const filename = `capture-${ts.getFullYear()}-${p2(ts.getMonth() + 1)}-${p2(ts.getDate())}_${p2(ts.getHours())}-${p2(ts.getMinutes())}-${p2(ts.getSeconds())}.png`;
    const fullpath = path.join(SCREENSHOT_DIR, filename);
    try {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      fs.writeFileSync(fullpath, Buffer.from(bytes));
      return { ok: true, filepath: fullpath, filename };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('recording:save', (_evt, bytes, ext = 'webm') => {
    if (!bytes || !bytes.byteLength) return { ok: false, error: 'empty payload' };
    const safeExt = /^(webm|mp4)$/i.test(ext) ? ext.toLowerCase() : 'webm';
    const ts = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const filename = `recording-${ts.getFullYear()}-${p2(ts.getMonth() + 1)}-${p2(ts.getDate())}_${p2(ts.getHours())}-${p2(ts.getMinutes())}-${p2(ts.getSeconds())}.${safeExt}`;
    const fullpath = path.join(SCREENSHOT_DIR, filename);
    try {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      fs.writeFileSync(fullpath, Buffer.from(bytes));
      return { ok: true, filepath: fullpath, filename };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('screenshots:delete', (_evt, filename) => {
    const safe = path.basename(filename);
    const fullpath = path.join(SCREENSHOT_DIR, safe);
    if (!fs.existsSync(fullpath)) return { ok: false, error: 'File not found' };
    try {
      fs.unlinkSync(fullpath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register };
