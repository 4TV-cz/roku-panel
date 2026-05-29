const http = require('http');
const { sendSequence } = require('./ecp');

const ECP_PORT = 8060;

function fetchModelNumber(host, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port: ECP_PORT, path: '/query/device-info', timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`device-info returned ${res.statusCode}`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const m = body.match(/<model-number>([^<]+)<\/model-number>/);
        if (!m) return reject(new Error('model-number not found in device-info'));
        resolve(m[1]);
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('device-info timeout')); });
    req.on('error', reject);
  });
}

function rebootKeysForModel(modelNumber) {
  const n = parseInt(String(modelNumber).substring(0, 4), 10);
  if (!Number.isFinite(n)) throw new Error(`Cannot parse model number "${modelNumber}"`);
  if (n >= 4000) {
    return ['Home', 'Home', 'Up', 'Right', 'Up', 'Right', 'Up', 'Up', 'Right', 'Down', 'Select', 'Select'];
  }
  if (n >= 3800) {
    return ['Home', 'Home', 'Up', 'Select', 'Up', 'Select', 'Down', 'Down', 'Down', 'Down', 'Down', 'Down', 'Down', 'Select', 'Down', 'Select', 'Select'];
  }
  throw new Error(`Unknown reboot sequence for model ${modelNumber}`);
}

function checkForUpdateKeysForModel(modelNumber) {
  const n = parseInt(String(modelNumber).substring(0, 4), 10);
  if (!Number.isFinite(n)) throw new Error(`Cannot parse model number "${modelNumber}"`);
  if (n >= 4000) {
    return ['Home', 'Up', 'Right', 'Up', 'Right', 'Up', 'Up', 'Up', 'Select', 'Select'];
  }
  throw new Error(`Unknown check-for-update sequence for model ${modelNumber}`);
}

async function reboot(host) {
  const modelNumber = await fetchModelNumber(host);
  const keys = rebootKeysForModel(modelNumber);
  await sendSequence(host, keys, { delayMs: 800 });
  return { modelNumber, keys };
}

async function checkForUpdate(host) {
  const modelNumber = await fetchModelNumber(host);
  const keys = checkForUpdateKeysForModel(modelNumber);
  await sendSequence(host, keys, { delayMs: 800 });
  return { modelNumber, keys };
}

module.exports = { reboot, checkForUpdate };
