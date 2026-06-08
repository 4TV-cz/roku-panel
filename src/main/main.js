const { app, BrowserWindow, ipcMain, session, clipboard } = require('electron');
const { CONFIG_FILE } = require('./paths');
const { loadConfig } = require('./config');
const { registerScheme, handleProtocol } = require('./screenshot-protocol');
const { createMainWindow } = require('./window');

loadConfig(CONFIG_FILE);
registerScheme();

require('./ipc/config').register(ipcMain);
require('./ipc/device').register(ipcMain);
require('./ipc/screenshots').register(ipcMain);
require('./ipc/telnet').register(ipcMain, app);
require('./ipc/send-keys').register(ipcMain);
require('./ipc/remote').register(ipcMain);
require('./ipc/deploy').register(ipcMain);
require('./ipc/deeplink').register(ipcMain);
require('./ipc/registry').register(ipcMain);
require('./ipc/rale').register(ipcMain);

ipcMain.handle('clipboard:writeText', (_e, text) => {
  clipboard.writeText(String(text ?? ''));
  return { ok: true };
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  handleProtocol();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
