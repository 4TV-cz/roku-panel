const { launch, sendInput } = require('../roku/deeplink');
const { getDeviceHost } = require('../device');
const { saveConfig } = require('../config');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';

function rememberParams(params, rememberKey) {
  if (rememberKey && Array.isArray(params)) saveConfig({ [rememberKey]: params });
}

function register(ipcMain) {
  ipcMain.handle('deeplink:launch', async (_evt, { appId = 'dev', params, rememberKey } = {}) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    rememberParams(params, rememberKey);
    try {
      const res = await launch(host, appId, params);
      return { ok: true, message: `POST ${res.path} → ${res.statusCode}`, path: res.path };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('deeplink:input', async (_evt, { params, rememberKey } = {}) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    rememberParams(params, rememberKey);
    try {
      const res = await sendInput(host, params);
      return { ok: true, message: `POST ${res.path} → ${res.statusCode}`, path: res.path };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register };
