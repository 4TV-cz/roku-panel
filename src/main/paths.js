const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { getConfig } = require('./config');
const { readPointer, writePointer, userDataDir } = require('./project-root');

const BUNDLE_ROOT = path.join(__dirname, '..', '..');

function bakedProjectRoot() {
  // electron-builder writes the build-time $PWD here (see the build script).
  try {
    return require(path.join(BUNDLE_ROOT, 'package.json')).projectRoot || null;
  } catch {
    return null;
  }
}

// Dev and the packaged app must read and write the SAME config.json, which
// lives in the project checkout. In a dev run __dirname is already inside it.
// In a packaged build __dirname points into the app bundle, where config.json
// and screenshots/ would be wiped on every rebuild, so the checkout has to be
// located some other way — and the build-time path alone is not enough, since
// renaming or moving the checkout leaves it pointing at nothing (the ENOENT
// crash this replaces). Candidates, best first:
//
//   1. ROKU_PANEL_HOME  — explicit override, for running against another checkout
//   2. the pointer file — refreshed by every dev run and every CLI call, so the
//      packaged app re-syncs as soon as either one runs from the new location
//   3. the baked path   — correct until the checkout moves
//   4. userData         — last resort, so a stale build starts with fresh
//                         settings instead of crashing
function resolveProjectRoot() {
  if (!app.isPackaged) {
    writePointer(BUNDLE_ROOT); // teach the packaged app where this checkout is
    return BUNDLE_ROOT;
  }

  const candidates = [
    ['ROKU_PANEL_HOME', process.env.ROKU_PANEL_HOME],
    ['pointer file', readPointer()],
    ['build-time projectRoot', bakedProjectRoot()]
  ];
  for (const [source, dir] of candidates) {
    if (dir && fs.existsSync(dir)) {
      if (source !== 'build-time projectRoot') console.log(`[paths] project root from ${source}: ${dir}`);
      return dir;
    }
  }

  const fallback = userDataDir();
  console.warn(`[paths] no project checkout found (baked: ${bakedProjectRoot() || 'unset'}) — falling back to ${fallback}`);
  return fallback;
}

const PROJECT_ROOT = resolveProjectRoot();
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'screenshots');

// User-overridable output folders. When config.screenshotDir / config.recordingDir
// are unset (or blank) we fall back to the bundled default folder, which keeps
// the original behaviour where everything lands in <project>/screenshots.
function resolveDir(value) {
  return value && String(value).trim() ? String(value).trim() : SCREENSHOT_DIR;
}

function getScreenshotDir() {
  return resolveDir(getConfig().screenshotDir);
}

function getRecordingDir() {
  return resolveDir(getConfig().recordingDir);
}

// All distinct folders that may hold captured media, screenshots first. Used by
// the listing/protocol/open/delete code paths so a custom recordings folder is
// still discoverable.
function getMediaDirs() {
  const dirs = [getScreenshotDir(), getRecordingDir()];
  return [...new Set(dirs)];
}

module.exports = {
  PROJECT_ROOT,
  CONFIG_FILE: path.join(PROJECT_ROOT, 'config.json'),
  SCREENSHOT_DIR,
  DEFAULT_SCREENSHOT_DIR: SCREENSHOT_DIR,
  ICON_PATH: path.join(BUNDLE_ROOT, 'assets', 'icon.png'),
  getScreenshotDir,
  getRecordingDir,
  getMediaDirs
};
