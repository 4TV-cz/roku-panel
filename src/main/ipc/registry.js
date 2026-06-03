const tracker = require('../roku/tracker');
const { getDeviceHost } = require('../device');
const { getConfig } = require('../config');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';

function trackerPort() {
  const p = getConfig().trackerPort;
  return Number.isInteger(p) ? p : tracker.DEFAULT_TRACKER_PORT;
}

function withHost(fn) {
  return async (...args) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    try {
      const registry = await fn(host, ...args, trackerPort());
      return { ok: true, registry };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };
}

function register(ipcMain) {
  const read = withHost((host, port) => tracker.readRegistry(host, port));
  const addField = withHost((host, { sectionName, key, value }, port) =>
    tracker.addRegistryField(host, sectionName, key, value, port));
  const editField = withHost((host, { sectionName, key, newKey, newValue }, port) =>
    tracker.editRegistryField(host, sectionName, key, newKey, newValue, port));
  const removeField = withHost((host, { sectionName, key }, port) =>
    tracker.removeRegistryField(host, sectionName, key, port));
  const removeSection = withHost((host, { name }, port) =>
    tracker.removeRegistrySection(host, name, port));
  const clear = withHost((host, port) => tracker.clearRegistry(host, port));
  const importJson = withHost((host, { sections }, port) =>
    tracker.importSections(host, sections, port));

  ipcMain.handle('registry:read', (_evt) => read());
  ipcMain.handle('registry:import', (_evt, payload) => importJson(payload));
  ipcMain.handle('registry:addField', (_evt, payload) => addField(payload));
  ipcMain.handle('registry:editField', (_evt, payload) => editField(payload));
  ipcMain.handle('registry:removeField', (_evt, payload) => removeField(payload));
  ipcMain.handle('registry:removeSection', (_evt, payload) => removeSection(payload));
  ipcMain.handle('registry:clear', (_evt) => clear());
}

module.exports = { register };
