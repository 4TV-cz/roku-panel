const { shell } = require('electron');
const { findRokuDevices } = require('../roku/discover');
const { pingDevice } = require('../roku/ecp');
const { getDeviceHost, setDeviceHost } = require('../device');
const { openDeviceBrowser } = require('../window');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';

function register(ipcMain) {
  ipcMain.handle('roku:getHost', () => getDeviceHost());

  ipcMain.handle('roku:discover', async () => {
    try {
      const { interfaces, devices, errors } = await findRokuDevices({ timeoutMs: 5000 });
      return { ok: true, interfaces, devices, errors };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('roku:setHost', (_evt, ip) => {
    try {
      setDeviceHost(ip);
      return { ok: true, host: ip };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('roku:ping', async () => {
    const host = getDeviceHost();
    if (!host) return { online: false, host: null, info: null };
    const info = await pingDevice(host);
    return { online: !!info, host, info };
  });

  ipcMain.handle('roku:openInBrowser', async () => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    openDeviceBrowser(host);
    return { ok: true };
  });
}

module.exports = { register };
