const tracker = require('../roku/tracker');
const { getDeviceHost } = require('../device');
const { getConfig } = require('../config');

const HOST_NOT_SET = 'device host not set — run discover or edit config.deviceHost';

function trackerPort() {
  const p = getConfig().trackerPort;
  return Number.isInteger(p) ? p : tracker.DEFAULT_TRACKER_PORT;
}

function register(ipcMain) {
  // Read-only RALE layout: full SceneGraph layer tree + currently focused node.
  ipcMain.handle('rale:readLayout', async (_evt, payload) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    const showOverlay = !!(payload && payload.showOverlay);
    try {
      const layout = await tracker.readLayout(host, trackerPort(), showOverlay);
      return { ok: true, ...layout };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Select a node by its index path and return its data.
  ipcMain.handle('rale:selectNode', async (_evt, payload) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    const path = Array.isArray(payload && payload.path) ? payload.path : [];
    try {
      const node = await tracker.selectNode(host, trackerPort(), path);
      return { ok: true, node };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Read a value's data by explicit RALE path segments (for lazily expanding
  // object-valued fields in the details panel).
  ipcMain.handle('rale:getNodeData', async (_evt, payload) => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: HOST_NOT_SET };
    const segments = Array.isArray(payload && payload.segments) ? payload.segments : [];
    try {
      const node = await tracker.getNodeDataAt(host, trackerPort(), segments);
      return { ok: true, node };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register };
