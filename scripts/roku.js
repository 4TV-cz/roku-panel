#!/usr/bin/env node
/*
 * roku.js — headless CLI for controlling the Roku device.
 *
 * Reuses the exact same modules the Electron panel uses (src/main/roku/*),
 * so it speaks the same ECP (port 8060) and sideload (port 80, HTTP Digest)
 * protocols. It reads host + credentials from config.json at the project root.
 *
 * Usage:
 *   node scripts/roku.js <command> [args]
 *
 * Run `node scripts/roku.js help` for the full command list.
 *
 * Host resolution order: --host <ip>  >  $ROKU_HOST  >  config.deviceHost
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'config.json');
// Same config.json as the panel. Record where it is so a packaged build whose
// baked path went stale (moved/renamed checkout) finds it again — see
// src/main/project-root.js.
require('../src/main/project-root').writePointer(PROJECT_ROOT);
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'screenshots');

const ecp = require('../src/main/roku/ecp');
const deeplinkMod = require('../src/main/roku/deeplink');
const { takeScreenshot } = require('../src/main/roku/screenshot');
const { reboot, checkForUpdate } = require('../src/main/roku/sequences');
const { findRokuDevices } = require('../src/main/roku/discover');
const { signIn, sendUsername, sendPassword } = require('../src/main/roku/signin');
const { deployZip, deployBuffer, deleteApp } = require('../src/main/roku/deploy');
const { zipFolder, hasManifest } = require('../src/main/roku/zip-folder');

// ---------------------------------------------------------------------------
// config + arg helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    fail(`Failed to parse config.json: ${err.message}`);
  }
}

function saveConfig(updates) {
  const cfg = { ...loadConfig(), ...updates };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return cfg;
}

// Pull --flag <value> pairs out of argv, return { flags, positionals }.
function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals };
}

function resolveHost(flags, cfg) {
  const host = flags.host || process.env.ROKU_HOST || cfg.deviceHost;
  if (!host) fail('No device host. Set config.deviceHost, pass --host <ip>, or run `roku.js discover --save`.');
  return host;
}

function resolveCreds(flags, cfg) {
  const creds = cfg.deviceCredentials || {};
  const username = flags.user || creds.username || 'rokudev';
  const password = flags.password || creds.password || '';
  return { username, password };
}

// Parse `key=value` positionals into the [{key,value}] shape the deeplink
// module expects. A bare `key` (no `=`) becomes an empty-valued param.
function parseParams(positionals) {
  return positionals.map((p) => {
    const idx = p.indexOf('=');
    if (idx === -1) return { key: p, value: '' };
    return { key: p.slice(0, idx), value: p.slice(idx + 1) };
  });
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function done(msg) {
  if (msg) console.log(`✓ ${msg}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

const commands = {
  async discover({ flags }) {
    const { devices } = await findRokuDevices({ timeoutMs: Number(flags.timeout) || 5000 });
    if (!devices.length) fail('No Roku devices found on the LAN.');
    for (const d of devices) {
      const info = d.ecp || {};
      console.log(`${d.ip}\t${info.name || '?'}\t${info.model || '?'}\tmodel#=${info.modelNumber || '?'}\tdev=${info.developer || '?'}`);
    }
    if (flags.save) {
      const ip = devices[0].ip;
      saveConfig({ deviceHost: ip });
      console.log(`✓ saved config.deviceHost = ${ip}`);
    }
  },

  async info({ flags, cfg }) {
    const host = resolveHost(flags, cfg);
    const data = await ecp.pingDevice(host);
    if (!data) fail(`Device ${host} is offline / unreachable on ECP (8060).`);
    console.log(`online   ${host}`);
    for (const [k, v] of Object.entries(data)) console.log(`${k.padEnd(13)} ${v ?? ''}`);
  },

  async ping(ctx) {
    const host = resolveHost(ctx.flags, ctx.cfg);
    const data = await ecp.pingDevice(host);
    if (!data) fail(`offline — ${host}`);
    done(`online — ${host} (${data.model || '?'}, ${data.software || '?'})`);
  },

  async key({ flags, cfg, positionals }) {
    const host = resolveHost(flags, cfg);
    if (!positionals.length) fail('Usage: roku.js key <KeyName>  (e.g. Home, Select, Up, Back)');
    await ecp.keypress(host, positionals[0]);
    done(`keypress ${positionals[0]}`);
  },

  async keys({ flags, cfg, positionals }) {
    const host = resolveHost(flags, cfg);
    if (!positionals.length) fail('Usage: roku.js keys <K1> <K2> ...  [--delay 200]');
    await ecp.sendSequence(host, positionals, { delayMs: Number(flags.delay) || 200 });
    done(`sent ${positionals.length} keys: ${positionals.join(' ')}`);
  },

  async text({ flags, cfg, positionals }) {
    const host = resolveHost(flags, cfg);
    const text = positionals.join(' ');
    if (!text) fail('Usage: roku.js text "the string to type"');
    await ecp.sendText(host, text, { charDelayMs: Number(flags.delay) || 50 });
    done(`typed "${text}"`);
  },

  async deeplink({ flags, cfg, positionals }) {
    const host = resolveHost(flags, cfg);
    const appId = flags.app || 'dev';
    const res = await deeplinkMod.launch(host, appId, parseParams(positionals));
    done(`POST ${res.path} → ${res.statusCode}`);
  },

  // alias for launching a specific channel id: roku.js launch <appId> [k=v...]
  async launch({ flags, cfg, positionals }) {
    const host = resolveHost(flags, cfg);
    const appId = positionals.shift() || 'dev';
    const res = await deeplinkMod.launch(host, appId, parseParams(positionals));
    done(`POST ${res.path} → ${res.statusCode}`);
  },

  async input({ flags, cfg, positionals }) {
    const host = resolveHost(flags, cfg);
    const res = await deeplinkMod.sendInput(host, parseParams(positionals));
    done(`POST ${res.path} → ${res.statusCode}`);
  },

  async screenshot({ flags, cfg }) {
    const host = resolveHost(flags, cfg);
    const { username, password } = resolveCreds(flags, cfg);
    if (!password) fail('device password not set (config.deviceCredentials.password or --password).');
    const outDir = flags.out || SCREENSHOT_DIR;
    const filepath = await takeScreenshot(host, { username, password, outDir });
    done(`saved ${filepath}`);
  },

  async screenshots() {
    if (!fs.existsSync(SCREENSHOT_DIR)) return console.log('(no screenshots dir yet)');
    const files = fs.readdirSync(SCREENSHOT_DIR)
      .filter((f) => /\.(jpg|jpeg|png|webm|mp4)$/i.test(f))
      .map((f) => ({ f, m: fs.statSync(path.join(SCREENSHOT_DIR, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (!files.length) return console.log('(none)');
    for (const { f } of files) console.log(path.join(SCREENSHOT_DIR, f));
  },

  async signin({ flags, cfg }) {
    const host = resolveHost(flags, cfg);
    const { username, password } = pickUser(flags, cfg);
    if (!username) fail('No user. Add one to config.users / config.selectedUser, or pass --user / --password.');
    await signIn(host, username, password || '');
    done(`signed in as ${username}`);
  },

  async username({ flags, cfg }) {
    const host = resolveHost(flags, cfg);
    const { username } = pickUser(flags, cfg);
    if (!username) fail('No username. Pass --user or set config.selectedUser.');
    await sendUsername(host, username);
    done(`sent username ${username}`);
  },

  async password({ flags, cfg }) {
    const host = resolveHost(flags, cfg);
    const { password } = pickUser(flags, cfg);
    await sendPassword(host, password || '');
    done('sent password');
  },

  async reboot({ flags, cfg }) {
    const host = resolveHost(flags, cfg);
    const info = await reboot(host);
    done(`reboot sequence sent (model ${info.modelNumber})`);
  },

  async 'check-update'({ flags, cfg }) {
    const host = resolveHost(flags, cfg);
    const info = await checkForUpdate(host);
    done(`check-for-update sequence sent (model ${info.modelNumber})`);
  },

  async deploy({ flags, cfg, positionals }) {
    const host = resolveHost(flags, cfg);
    const { username, password } = resolveCreds(flags, cfg);
    if (!password) fail('device password not set (config.deviceCredentials.password or --password).');
    const target = positionals[0];
    if (!target) fail('Usage: roku.js deploy <path-to.zip | path-to-folder>');
    if (!fs.existsSync(target)) fail(`Not found: ${target}`);

    let res;
    if (fs.statSync(target).isDirectory()) {
      if (!hasManifest(target)) fail(`Not a Roku project: no "manifest" in ${target}`);
      const bytes = zipFolder(target);
      res = await deployBuffer(host, bytes, path.basename(target) + '.zip', { username, password });
    } else {
      res = await deployZip(host, target, { username, password });
    }
    res.ok ? done(res.message) : fail(res.message);
  },

  async delete({ flags, cfg }) {
    const host = resolveHost(flags, cfg);
    const { username, password } = resolveCreds(flags, cfg);
    if (!password) fail('device password not set (config.deviceCredentials.password or --password).');
    const res = await deleteApp(host, { username, password });
    res.ok ? done(res.message) : fail(res.message);
  },

  help() {
    console.log(HELP);
  }
};

// selectedUser lookup from config.users, with --user / --password overrides.
function pickUser(flags, cfg) {
  const users = Array.isArray(cfg.users) ? cfg.users : [];
  const wanted = flags.user || cfg.selectedUser;
  const match = users.find((u) => u.username === wanted);
  return {
    username: flags.user || (match ? match.username : wanted) || '',
    password: flags.password !== undefined ? flags.password : (match ? match.password : '')
  };
}

const HELP = `roku.js — control the Roku device from the command line

Host:  --host <ip> | $ROKU_HOST | config.deviceHost
Auth:  --user <name> --password <pw> | config.deviceCredentials | config.users

Device:
  discover [--save] [--timeout 5000]   Find Roku devices on the LAN (--save writes deviceHost)
  info                                 Print device-info (model, software, resolution, …)
  ping                                 One-line online/offline check
  reboot                               Send the model-specific reboot key sequence
  check-update                         Send the model-specific check-for-update sequence

Remote / input:
  key <KeyName>                        One ECP keypress (Home, Select, Up, Down, Left, Right, Back, Play, …)
  keys <K1> <K2> ... [--delay 200]     A timed sequence of keypresses
  text "<string>" [--delay 50]         Type literal text (Lit_ keys)

Sign-in (uses config.users / selectedUser):
  signin [--user <email>] [--password <pw>]
  username                             Send just the username + Enter + Down
  password                             Send just the password + Enter + Down

Deeplink (dev channel unless --app <id>):
  deeplink <k=v> [k=v ...]             POST /launch  (cold/warm start with params)
  input    <k=v> [k=v ...]             POST /input   (message to a running channel)
  launch   <appId> [k=v ...]           Launch a specific channel id

Sideload (HTTP Digest on port 80, needs deviceCredentials.password):
  deploy <path.zip | folder>           Install a ZIP, or zip+install a project folder
  delete                               Remove the installed dev channel

Capture:
  screenshot [--out <dir>]             Capture a screenshot to screenshots/ (or --out)
  screenshots                          List saved screenshots/recordings

Examples:
  node scripts/roku.js discover --save
  node scripts/roku.js key Home
  node scripts/roku.js keys Home Up Up Select
  node scripts/roku.js text "hello world"
  node scripts/roku.js deeplink contentId=849108 mediaType=movie
  node scripts/roku.js input externalCommand=seek parameter=58
  node scripts/roku.js screenshot
  node scripts/roku.js deploy ../dce-roku/out/dce-roku.zip
`;

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

(async () => {
  const [, , cmdName, ...rest] = process.argv;
  if (!cmdName || cmdName === '--help' || cmdName === '-h') return commands.help();

  const cmd = commands[cmdName];
  if (!cmd) fail(`Unknown command "${cmdName}". Run \`roku.js help\`.`);

  const { flags, positionals } = parseArgs(rest);
  const cfg = loadConfig();
  try {
    await cmd({ flags, positionals, cfg });
  } catch (err) {
    fail(err.message || String(err));
  }
})();
