const path = require('path');
const { getConfig } = require('./config');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

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
  ICON_PATH: path.join(PROJECT_ROOT, 'assets', 'icon.png'),
  getScreenshotDir,
  getRecordingDir,
  getMediaDirs
};
