// Client for the RALE TrackerTask socket protocol.
//
// The TrackerTask is a BrightScript Task embedded in the running channel. It
// listens for an ECP /input request carrying `rale` + `port`, then opens a TCP
// socket server on that port. We connect and exchange framed JSON commands:
//
//   request:  [start]{"command","args","uuid"}[end]
//   response: [start][uuid:<len>]<uuid>{json}[end]
//
// Registry commands (getRegistrySections, addRegistryField, editRegistryField,
// removeRegistryField, removeRegistrySection, clearRegistry) run inside the
// channel via roRegistrySection, so no device keying is required.
const http = require('http');
const net = require('net');

const ECP_PORT = 8060;

// The TrackerTask listens on the port we hand it via ECP /input. We use a fixed
// port (not random) for two reasons: (1) when RALE desktop is also running it
// keeps the Task bound to its port and our random-port inputs are never picked
// up; (2) a stable port is predictable to debug. 54321 is RALE's conventional
// default. Override via config `trackerPort`.
const DEFAULT_TRACKER_PORT = 54321;

let uuidCounter = 0;
function nextUuid() {
  uuidCounter += 1;
  return `roku-panel-${uuidCounter}-${Math.floor(Math.random() * 1e6)}`;
}

function ecpInput(host, port, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port: ECP_PORT, method: 'POST', path: `/input?rale=1&port=${port}`, timeout: timeoutMs },
      (res) => {
        res.resume();
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`ECP /input returned ${res.statusCode}`));
        });
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('ECP /input timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// The Task needs a moment after the ECP input to start listening; retry connect.
function connectWithRetry(host, port, { attempts = 20, delayMs = 150 } = {}) {
  return new Promise((resolve, reject) => {
    let lastErr = null;
    const tryOnce = (n) => {
      const sock = net.connect({ host, port });
      sock.once('connect', () => resolve(sock));
      sock.once('error', (err) => {
        lastErr = err;
        sock.destroy();
        if (n <= 0) reject(new Error(`could not connect to TrackerTask on ${host}:${port} — is the channel running with the TrackerTask? (${lastErr.message})`));
        else setTimeout(() => tryOnce(n - 1), delayMs);
      });
    };
    tryOnce(attempts);
  });
}

function frameRequest(command, args) {
  return '[start]' + JSON.stringify({ command, args: args || {}, uuid: nextUuid() }) + '[end]';
}

// Pull the first complete [start]...[end] frame's JSON payload out of `buf`.
// Returns { json, rest } or null if no complete frame yet.
function takeFrame(buf) {
  const start = buf.indexOf('[start]');
  if (start < 0) return null;
  const end = buf.indexOf('[end]', start);
  if (end < 0) return null;
  let body = buf.slice(start + '[start]'.length, end);
  const m = body.match(/^\[uuid:(\d+)\]/);
  if (m) {
    const idLen = parseInt(m[1], 10);
    body = body.slice(m[0].length + idLen);
  }
  return { json: body, rest: buf.slice(end + '[end]'.length) };
}

function sendCommand(sock, state, command, args, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for response to "${command}"`));
    }, timeoutMs);

    function onData(chunk) {
      state.buf += chunk.toString('utf8');
      const frame = takeFrame(state.buf);
      if (!frame) return;
      state.buf = frame.rest;
      cleanup();
      let parsed;
      try {
        parsed = JSON.parse(frame.json);
      } catch (err) {
        reject(new Error(`bad response to "${command}": ${err.message}`));
        return;
      }
      if (parsed && parsed.error) {
        reject(new Error(parsed.error.message || `"${command}" failed`));
        return;
      }
      resolve(parsed);
    }
    function onError(err) { cleanup(); reject(err); }
    function cleanup() {
      clearTimeout(timer);
      sock.off('data', onData);
      sock.off('error', onError);
    }

    sock.on('data', onData);
    sock.on('error', onError);
    sock.write(frameRequest(command, args));
  });
}

// Open one TrackerTask session, run a list of commands in order, return results.
// commands: [{ command, args }]. Resolves to an array of parsed responses.
async function runTrackerCommands(host, commands, port = DEFAULT_TRACKER_PORT) {
  await ecpInput(host, port);
  const sock = await connectWithRetry(host, port);
  const state = { buf: '' };
  const results = [];
  try {
    for (const c of commands) {
      results.push(await sendCommand(sock, state, c.command, c.args));
    }
  } finally {
    sock.end();
    sock.destroy();
  }
  return results;
}

// Normalize getRegistrySections output { Section: { key: value } } into the
// shape the renderer expects: { sections: [{ name, items: [{ key, value }] }] }.
function normalizeSections(raw) {
  const sections = [];
  const obj = raw && typeof raw === 'object' ? raw : {};
  for (const name of Object.keys(obj).sort()) {
    const itemsObj = obj[name] || {};
    const items = Object.keys(itemsObj)
      .sort()
      .map((key) => ({ key, value: String(itemsObj[key] ?? '') }));
    sections.push({ name, items });
  }
  return { sections };
}

async function readRegistry(host, port) {
  const [raw] = await runTrackerCommands(host, [{ command: 'getRegistrySections', args: {} }], port);
  return normalizeSections(raw);
}

// Run a mutating command, then re-read in the same session so the renderer gets
// fresh data in one round trip.
async function mutateAndRead(host, command, args, port) {
  const [, raw] = await runTrackerCommands(host, [
    { command, args },
    { command: 'getRegistrySections', args: {} }
  ], port);
  return normalizeSections(raw);
}

// Bulk-import sections from a { sectionName: { key: value } } object. Writes each
// section (addRegistrySection writes all its keys), then re-reads, all in one
// session. Values must already be strings (registry only stores strings).
async function importSections(host, sections, port) {
  const commands = Object.keys(sections).map((name) => ({
    command: 'addRegistrySection',
    args: { name, section: sections[name] }
  }));
  commands.push({ command: 'getRegistrySections', args: {} });
  const results = await runTrackerCommands(host, commands, port);
  return normalizeSections(results[results.length - 1]);
}

module.exports = {
  DEFAULT_TRACKER_PORT,
  readRegistry,
  addRegistryField: (host, sectionName, key, value, port) =>
    mutateAndRead(host, 'addRegistryField', { sectionName, key, value }, port),
  editRegistryField: (host, sectionName, key, newKey, newValue, port) =>
    mutateAndRead(host, 'editRegistryField', { sectionName, key, newKey, newValue }, port),
  removeRegistryField: (host, sectionName, key, port) =>
    mutateAndRead(host, 'removeRegistryField', { sectionName, key }, port),
  removeRegistrySection: (host, name, port) =>
    mutateAndRead(host, 'removeRegistrySection', { name }, port),
  clearRegistry: (host, port) => mutateAndRead(host, 'clearRegistry', {}, port),
  importSections: (host, sections, port) => importSections(host, sections, port)
};
