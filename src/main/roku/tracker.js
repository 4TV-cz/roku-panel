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
      // RALE commands implemented as a Sub return no value; the device then
      // sends an empty JSON payload (FormatJson(invalid) === ""). Treat that as
      // a successful, value-less response rather than a parse error.
      const json = (frame.json || '').trim();
      if (json === '') { resolve(null); return; }
      let parsed;
      try {
        parsed = JSON.parse(json);
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

// --- RALE layout (read-only) -------------------------------------------------

// Flatten a getNodeTree node ({ item, childList }) into a lean renderer shape.
// RALE's own helper nodes carry isExposed=true; drop them defensively (with
// `init` skipped they shouldn't exist, but the desktop RALE app may inject them
// into the same running channel).
function normalizeNode(n) {
  if (!n || typeof n !== 'object') return null;
  const item = n.item || {};
  // BrightScript AAs are case-insensitive; the device may emit `childList` or
  // `childlist` depending on which key case was written first. Accept either.
  const childrenRaw = Array.isArray(n.childList)
    ? n.childList
    : Array.isArray(n.childlist)
      ? n.childlist
      : [];
  const children = [];
  for (const c of childrenRaw) {
    if (!c || (c.item && c.item.isExposed)) continue;
    const norm = normalizeNode(c);
    if (norm) children.push(norm);
  }
  return {
    subtype: String(item.subtype || item.type || 'Node'),
    id: item.id != null && item.id !== '' ? String(item.id) : '',
    // Real child index within the parent (stable even when siblings are pruned),
    // so the focused-node path can be matched against it.
    index: typeof item.index === 'number' ? item.index : null,
    childCount: typeof item.childrenCount === 'number' ? item.childrenCount : children.length,
    children
  };
}

function normalizeTree(raw) {
  if (!raw || raw.error) return null;
  return normalizeNode(raw);
}

// selectFocusedNode returns { path: [{child:N},...], node: getNodeData(...) }.
function normalizeFocused(raw) {
  if (!raw || raw.error) return null;
  const node = raw.node || {};
  const item = node.item || {};
  const layout = node.layout || {};
  const br = layout.boundingRect;

  const path = Array.isArray(raw.path)
    ? raw.path
        .map((seg) => (seg && typeof seg === 'object' && typeof seg.child === 'number' ? seg.child : null))
        .filter((v) => v !== null)
    : [];

  const fields = [];
  const fl = node.fieldlist || {};
  for (const key of Object.keys(fl)) {
    const fi = (fl[key] && fl[key].item) || {};
    const type = String(fi.fieldType || fi.type || '');
    let value;
    if (fi.value === '{object}') {
      // RALE reports a single "{object}" for node/array/assocarray values, which
      // would otherwise hide them entirely (a RowList is almost all object
      // fields). Show a type-based placeholder so the field is still listed.
      if (fi.subtype) value = `<${fi.subtype}>`;
      else if (/array/i.test(type)) value = '[ … ]';
      else value = '{ … }';
    } else {
      value = String(fi.value ?? '');
    }
    fields.push({ key, value, type });
  }
  fields.sort((a, b) => a.key.localeCompare(b.key));

  return {
    subtype: String(item.subtype || item.type || 'Node'),
    id: item.id != null && item.id !== '' ? String(item.id) : '',
    path,
    boundingRect: br && typeof br === 'object'
      ? { x: br.x, y: br.y, width: br.width, height: br.height }
      : null,
    fields
  };
}

// Read the full SceneGraph layer tree plus the currently focused node, all in one
// TrackerTask session.
//
// When `showOverlay` is false (default), nothing is drawn on the TV:
//   - `selectNode {path:[]}` primes m.currentNode so `selectFocusedNode` won't
//     dereference an uninitialized field.
//   - `hideSelectorView` forces m.showSelectorView=false, so `selectFocusedNode`
//     won't (re)attach RALE's red box even if `init` was run in a prior call.
//
// When `showOverlay` is true, RALE's selector overlay is drawn around the focused
// node:
//   - `init` creates the selector view (and primes m.currentNode).
//   - `showSelectorView` ensures m.showSelectorView=true (init only sets it the
//     first time the view is created).
//   - `selectFocusedNode` then attaches the box to the focused node.
async function readLayout(host, port, showOverlay = false) {
  const prelude = showOverlay
    ? [
        // logVerbosity must be a number: init does `if args.logVerbosity >= 0`,
        // which throws on Invalid. -1 means "don't change RALE's log verbosity".
        { command: 'init', args: { logVerbosity: -1 } },
        { command: 'showSelectorView', args: {} }
      ]
    : [
        { command: 'selectNode', args: { path: [] } },
        { command: 'hideSelectorView', args: {} }
      ];

  const commands = [
    ...prelude,
    { command: 'getNodeTree', args: { path: [], maxLevel: 50 } },
    { command: 'selectFocusedNode', args: {} }
  ];

  const results = await runTrackerCommands(host, commands, port);
  const treeRaw = results[results.length - 2];
  const focusedRaw = results[results.length - 1];
  return { tree: normalizeTree(treeRaw), focused: normalizeFocused(focusedRaw) };
}

// Select a node by its index path (array of child indices from the root) and
// return its data. `selectNode` returns the same { path, node } shape as
// `selectFocusedNode`, and on the device it moves RALE's selector overlay to the
// node when "Show on device" is enabled (a no-op otherwise).
async function selectNode(host, port, path) {
  const pathArg = (Array.isArray(path) ? path : []).map((i) => ({ child: i }));
  const [raw] = await runTrackerCommands(host, [
    { command: 'selectNode', args: { path: pathArg } }
  ], port);
  return normalizeFocused(raw);
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
  readLayout,
  selectNode,
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
