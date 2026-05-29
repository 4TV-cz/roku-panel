const { keypress } = require('../roku/ecp');
const { getDeviceHost } = require('../device');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';

function register(ipcMain) {
  ipcMain.handle('roku:keypress', async (_evt, key) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    if (!key) return { ok: false, error: 'key is required' };
    try {
      await keypress(host, key);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register };
