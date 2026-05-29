const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const { ICON_PATH } = require('./paths');
const { getDeviceCredentials } = require('./device');
const { getConfig, saveConfig } = require('./config');

const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 760;

function boundsFitAnyDisplay(bounds) {
  return screen.getAllDisplays().some((d) => {
    const w = d.workArea;
    return bounds.x >= w.x - 8 &&
           bounds.y >= w.y - 8 &&
           bounds.x + bounds.width <= w.x + w.width + 16 &&
           bounds.y + bounds.height <= w.y + w.height + 16;
  });
}

function loadSavedBounds() {
  const saved = getConfig().windowBounds;
  if (!saved) return null;
  const { x, y, width, height } = saved;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (typeof x === 'number' && typeof y === 'number' && !boundsFitAnyDisplay({ x, y, width, height })) {
    return { width, height }; // forget x/y if off-screen
  }
  return saved;
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.rokupanel.app');
}

function createMainWindow() {
  const saved = loadSavedBounds() || {};
  const win = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width || DEFAULT_WIDTH,
    height: saved.height || DEFAULT_HEIGHT,
    title: 'Roku dev panel',
    backgroundColor: '#1e1e1e',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (saved.isMaximized) win.maximize();

  let saveTimer = null;
  function persistBounds() {
    if (win.isDestroyed()) return;
    const isMaximized = win.isMaximized();
    const bounds = win.getNormalBounds();
    saveConfig({ windowBounds: { ...bounds, isMaximized } });
  }
  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistBounds, 400);
  }

  win.on('resize', schedulePersist);
  win.on('move', schedulePersist);
  win.on('maximize', persistBounds);
  win.on('unmaximize', persistBounds);
  win.on('close', () => {
    clearTimeout(saveTimer);
    persistBounds();
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

let deviceBrowserWindow = null;

function openDeviceBrowser(host) {
  const { username, password } = getDeviceCredentials();
  const url = `http://${host}`;

  if (deviceBrowserWindow && !deviceBrowserWindow.isDestroyed()) {
    deviceBrowserWindow.loadURL(url);
    deviceBrowserWindow.focus();
    return;
  }

  deviceBrowserWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: `Roku — ${host}`,
    icon: ICON_PATH,
    autoHideMenuBar: true
  });

  deviceBrowserWindow.webContents.on('login', (event, _request, _authInfo, callback) => {
    event.preventDefault();
    callback(username, password);
  });

  deviceBrowserWindow.on('closed', () => { deviceBrowserWindow = null; });
  deviceBrowserWindow.loadURL(url);
}

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  });
}

module.exports = { createMainWindow, openDeviceBrowser, broadcast };
