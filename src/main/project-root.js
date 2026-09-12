const fs = require('fs');
const os = require('os');
const path = require('path');

// Everything the panel persists — config.json above all — lives in the project
// checkout, so dev runs, the packaged app and scripts/roku.js all share one
// config. Dev and the CLI run *from* the checkout and know it firsthand; the
// packaged app only has the build-time $PWD baked into its package.json, which
// goes stale the moment the folder is renamed or moved. So the two that know
// leave a pointer here, and the packaged app follows it.
//
// The directory is computed rather than taken from Electron's
// app.getPath('userData'): scripts/roku.js has no Electron to ask, and both
// sides have to land on the same file for the pointer to mean anything.
function userDataDir() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'roku-panel');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'roku-panel');
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'roku-panel');
}

const POINTER_FILE = path.join(userDataDir(), 'project-root.json');

function readPointer() {
  try {
    const { projectRoot } = JSON.parse(fs.readFileSync(POINTER_FILE, 'utf8'));
    return projectRoot || null;
  } catch {
    return null; // missing or corrupt — the caller falls through to its next candidate
  }
}

// Best effort: an unwritable home directory must not stop the panel starting.
function writePointer(projectRoot) {
  if (readPointer() === projectRoot) return;
  try {
    fs.mkdirSync(path.dirname(POINTER_FILE), { recursive: true });
    fs.writeFileSync(POINTER_FILE, JSON.stringify({ projectRoot }, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.warn(`[project-root] could not record ${projectRoot} in ${POINTER_FILE}: ${err.message}`);
  }
}

module.exports = { POINTER_FILE, userDataDir, readPointer, writePointer };
