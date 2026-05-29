const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

module.exports = {
  PROJECT_ROOT,
  CONFIG_FILE: path.join(PROJECT_ROOT, 'config.json'),
  SCREENSHOT_DIR: path.join(PROJECT_ROOT, 'screenshots'),
  ICON_PATH: path.join(PROJECT_ROOT, 'assets', 'icon.png')
};
