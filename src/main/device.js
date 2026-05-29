const { getConfig, saveConfig } = require('./config');

function getDeviceHost() {
  return getConfig().deviceHost || null;
}

function setDeviceHost(ip) {
  saveConfig({ deviceHost: ip });
}

function getDeviceCredentials() {
  const cfg = getConfig();
  const creds = cfg.deviceCredentials || {};
  return { username: creds.username || 'rokudev', password: creds.password || '' };
}

module.exports = { getDeviceHost, setDeviceHost, getDeviceCredentials };
