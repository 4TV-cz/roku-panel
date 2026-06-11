// Creates config.json with default values on first install.
// Never overwrites an existing config — runs as a postinstall step.
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'config.json');

const DEFAULT_CONFIG = {
  version: 1,
  deviceHost: '',
  deviceCredentials: {
    username: 'rokudev',
    password: ''
  }
};

if (fs.existsSync(configPath)) {
  console.log('[init-config] config.json already exists — leaving it untouched.');
} else {
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
  console.log('[init-config] created config.json with default values — set deviceCredentials.password to your Roku dev-mode password.');
}
