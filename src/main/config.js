const fs = require('fs');

let cached = null;
let loadedFrom = null;

function loadConfig(configPath) {
  loadedFrom = configPath;
  if (!fs.existsSync(configPath)) {
    console.warn(`[config] ${configPath} not found, using empty config.`);
    cached = {};
    return cached;
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    cached = raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.error(`[config] Failed to parse ${configPath}: ${err.message}`);
    cached = {};
  }
  return cached;
}

function getConfig() {
  if (cached == null) throw new Error('config not loaded yet — call loadConfig() first');
  return cached;
}

function getConfigPath() {
  return loadedFrom;
}

function saveConfig(updates) {
  if (cached == null) throw new Error('config not loaded yet — call loadConfig() first');
  if (loadedFrom == null) throw new Error('config path unknown');
  cached = { ...cached, ...updates };
  fs.writeFileSync(loadedFrom, JSON.stringify(cached, null, 2) + '\n', 'utf8');
  return cached;
}

module.exports = { loadConfig, getConfig, getConfigPath, saveConfig };
