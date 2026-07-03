const { shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { takeScreenshot } = require('../roku/screenshot');
const { getDeviceHost, getDeviceCredentials } = require('../device');
const { getScreenshotDir, getRecordingDir, getMediaDirs } = require('../paths');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';

// Find the full path of a captured file by searching every media folder
// (screenshots + recordings). Filenames are timestamped and prefixed, so a
// clash across folders is effectively impossible.
function resolveMediaPath(filename) {
  const safe = path.basename(filename);
  for (const dir of getMediaDirs()) {
    const fullpath = path.join(dir, safe);
    if (fs.existsSync(fullpath)) return fullpath;
  }
  return null;
}

function register(ipcMain) {
  ipcMain.handle('roku:screenshot', async () => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    const { username, password } = getDeviceCredentials();
    if (!password) return { ok: false, error: 'device password not set (config.deviceCredentials.password)' };
    try {
      const filepath = await takeScreenshot(host, { username, password, outDir: getScreenshotDir() });
      return { ok: true, filepath, filename: path.basename(filepath) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('screenshots:list', () => {
    const seen = new Set();
    const items = [];
    for (const dir of getMediaDirs()) {
      if (!fs.existsSync(dir)) continue;
      for (const filename of fs.readdirSync(dir)) {
        if (!/\.(jpg|jpeg|png|webm|mp4)$/i.test(filename)) continue;
        if (seen.has(filename)) continue;
        seen.add(filename);
        const stat = fs.statSync(path.join(dir, filename));
        const isVideo = /\.(webm|mp4)$/i.test(filename);
        items.push({ filename, mtime: stat.mtimeMs, size: stat.size, kind: isVideo ? 'video' : 'image' });
      }
    }
    return items.sort((a, b) => b.mtime - a.mtime);
  });

  ipcMain.handle('screenshots:open', (_evt, filename) => {
    const fullpath = resolveMediaPath(filename);
    if (!fullpath) return { ok: false, error: 'File not found' };
    shell.openPath(fullpath);
    return { ok: true };
  });

  ipcMain.handle('capture:save', (_evt, bytes) => {
    if (!bytes || !bytes.byteLength) return { ok: false, error: 'empty payload' };
    const dir = getScreenshotDir();
    const ts = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const filename = `capture-${ts.getFullYear()}-${p2(ts.getMonth() + 1)}-${p2(ts.getDate())}_${p2(ts.getHours())}-${p2(ts.getMinutes())}-${p2(ts.getSeconds())}.png`;
    const fullpath = path.join(dir, filename);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullpath, Buffer.from(bytes));
      return { ok: true, filepath: fullpath, filename };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('recording:save', (_evt, bytes, ext = 'webm') => {
    if (!bytes || !bytes.byteLength) return { ok: false, error: 'empty payload' };
    const dir = getRecordingDir();
    const safeExt = /^(webm|mp4)$/i.test(ext) ? ext.toLowerCase() : 'webm';
    const ts = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const filename = `recording-${ts.getFullYear()}-${p2(ts.getMonth() + 1)}-${p2(ts.getDate())}_${p2(ts.getHours())}-${p2(ts.getMinutes())}-${p2(ts.getSeconds())}.${safeExt}`;
    const fullpath = path.join(dir, filename);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullpath, Buffer.from(bytes));
      return { ok: true, filepath: fullpath, filename };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('screenshots:delete', async (_evt, filename) => {
    const fullpath = resolveMediaPath(filename);
    if (!fullpath) return { ok: false, error: 'File not found' };
    // On Windows a just-released video handle can linger briefly, so retry a
    // few times on EBUSY/EPERM before giving up.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.unlinkSync(fullpath);
        return { ok: true };
      } catch (err) {
        if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < 4) {
          await sleep(150);
          continue;
        }
        return { ok: false, error: err.message };
      }
    }
    return { ok: false, error: 'unknown error' };
  });
}

module.exports = { register };
