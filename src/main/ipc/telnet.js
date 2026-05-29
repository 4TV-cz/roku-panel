const net = require('net');
const { getDeviceHost } = require('../device');
const { broadcast } = require('../window');

const TELNET_PORT = 8085;
const CONNECT_TIMEOUT_MS = 3000;
const PROBE_TIMEOUT_MS = 1500;

let telnetSocket = null;

function close() {
  if (telnetSocket) {
    try { telnetSocket.destroy(); } catch {}
    telnetSocket = null;
  }
}

// Probe Roku's telnet port. Behavior:
//   - connect fails → unreachable
//   - connect succeeds and Roku sends "Console connection is already in use"
//     within PROBE_TIMEOUT_MS → in-use (another client has it)
//   - connect succeeds and stays silent → free
function probePort(host, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    let connected = false;
    let receivedRejection = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (!connected) {
        finish({ reachable: false, inUse: false, state: 'unreachable', error: 'connect timeout' });
      } else {
        finish(receivedRejection
          ? { reachable: true, inUse: true, state: 'in-use' }
          : { reachable: true, inUse: false, state: 'free' });
      }
    }, timeoutMs);

    sock.once('connect', () => { connected = true; });
    sock.on('data', (data) => {
      if (data.toString('utf8').includes('Console connection is already in use')) {
        receivedRejection = true;
        finish({ reachable: true, inUse: true, state: 'in-use' });
      }
    });
    sock.once('error', (err) => {
      finish({ reachable: connected, inUse: false, state: connected ? 'free' : 'unreachable', error: err.message });
    });
    sock.once('close', () => {
      if (done) return;
      finish(receivedRejection
        ? { reachable: true, inUse: true, state: 'in-use' }
        : { reachable: connected, inUse: false, state: connected ? 'free' : 'unreachable' });
    });

    sock.connect(TELNET_PORT, host);
  });
}

function register(ipcMain, app) {
  ipcMain.handle('telnet:check', async () => {
    const host = getDeviceHost();
    if (!host) return { ok: false, error: 'device host not set' };
    // If we already hold a healthy connection, the port is "in use by us"
    if (telnetSocket && telnetSocket.readyState === 'open') {
      return { ok: true, host, port: TELNET_PORT, reachable: true, inUse: true, byUs: true, state: 'in-use-by-us' };
    }
    const res = await probePort(host);
    return { ok: true, host, port: TELNET_PORT, ...res };
  });

  ipcMain.handle('telnet:open', () => {
    // Only reuse a truly-open connection. `destroyed === false` is not
    // enough — a socket stuck in 'opening' (Roku never answered, network
    // blip, etc.) reports !destroyed but is unusable until restart.
    if (telnetSocket && telnetSocket.readyState === 'open') {
      return { ok: true, alreadyOpen: true };
    }
    if (telnetSocket) {
      try { telnetSocket.destroy(); } catch {}
      telnetSocket = null;
    }

    const host = getDeviceHost();
    if (!host) return { ok: false, error: 'device host not set' };

    let rejected = false;
    let connected = false;
    const socket = new net.Socket();
    telnetSocket = socket;

    const connectTimer = setTimeout(() => {
      if (connected || socket.destroyed) return;
      try { socket.destroy(); } catch {}
      if (telnetSocket === socket) telnetSocket = null;
      broadcast('telnet:status', { status: 'error', message: `connect timeout after ${CONNECT_TIMEOUT_MS} ms` });
    }, CONNECT_TIMEOUT_MS);

    socket.connect(TELNET_PORT, host, () => {
      connected = true;
      clearTimeout(connectTimer);
      broadcast('telnet:status', { status: 'open', host });
    });
    socket.on('data', (data) => {
      const text = data.toString('utf8');
      if (text.includes('Console connection is already in use')) rejected = true;
      broadcast('telnet:data', text);
    });
    socket.on('close', () => {
      clearTimeout(connectTimer);
      if (telnetSocket === socket) telnetSocket = null;
      broadcast('telnet:status', { status: rejected ? 'rejected' : 'closed' });
    });
    socket.on('error', (err) => {
      clearTimeout(connectTimer);
      broadcast('telnet:status', { status: 'error', message: err.message });
    });

    return { ok: true, host };
  });

  ipcMain.handle('telnet:close', () => {
    close();
    return { ok: true };
  });

  app.on('before-quit', close);
}

module.exports = { register };
