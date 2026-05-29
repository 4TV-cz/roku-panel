const { getConfig, saveConfig } = require('../config');

function register(ipcMain) {
  ipcMain.handle('config:get', () => getConfig());

  ipcMain.handle('config:set', (_evt, updates) => {
    try {
      return { ok: true, config: saveConfig(updates) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register };
