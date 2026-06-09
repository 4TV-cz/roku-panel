const http = require('http');

const ECP_PORT = 8060;

function postKey(host, key, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host,
        port: ECP_PORT,
        method: 'POST',
        path: `/keypress/${key}`,
        timeout: timeoutMs
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`ECP /keypress/${key} returned ${res.statusCode}`));
        });
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout on /keypress/${key}`)); });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function keypress(host, key) {
  await postKey(host, key);
}

async function sendSequence(host, keys, { delayMs = 200 } = {}) {
  for (const k of keys) {
    await postKey(host, k);
    if (delayMs) await sleep(delayMs);
  }
}

async function sendText(host, text, { charDelayMs = 50 } = {}) {
  for (const ch of String(text)) {
    await postKey(host, `Lit_${encodeURIComponent(ch)}`);
    if (charDelayMs) await sleep(charDelayMs);
  }
}

function pingDevice(host, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host, port: ECP_PORT, path: '/query/device-info', timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const pick = (tag) => (body.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`)) || [])[1];
        resolve({
          name: pick('friendly-device-name'),
          model: pick('friendly-model-name') || pick('model-name'),
          modelNumber: pick('model-number'),
          software: pick('software-version'),
          build: pick('software-build'),
          serial: pick('serial-number'),
          developer: pick('developer-enabled'),
          // UI render resolution: "720p" / "1080p" (Roku renders SceneGraph at
          // one of these; 4K is a video-output capability, not a UI resolution).
          uiResolution: pick('ui-resolution')
        });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

module.exports = { keypress, sendSequence, sendText, pingDevice };
