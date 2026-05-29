const { signIn, sendUsername, sendPassword } = require('../roku/signin');
const { sendText } = require('../roku/ecp');
const { getDeviceHost } = require('../device');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';

function withHost(fn) {
  return async (...args) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    try {
      await fn(host, ...args);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };
}

function register(ipcMain) {
  ipcMain.handle('roku:signIn', (_evt, { username, password }) => {
    if (!username) return Promise.resolve({ ok: false, error: 'username is required' });
    return withHost((host) => signIn(host, username, password || ''))();
  });

  ipcMain.handle('roku:sendUsername', (_evt, { username }) => {
    if (!username) return Promise.resolve({ ok: false, error: 'username is required' });
    return withHost((host) => sendUsername(host, username))();
  });

  ipcMain.handle('roku:sendPassword', (_evt, { password }) => {
    return withHost((host) => sendPassword(host, password || ''))();
  });

  ipcMain.handle('roku:sendText', (_evt, text) => {
    if (typeof text !== 'string' || !text.length) {
      return Promise.resolve({ ok: false, error: 'text is required' });
    }
    return withHost((host) => sendText(host, text))();
  });
}

module.exports = { register };
