const fs = require('fs');
const path = require('path');
const { harvestChallenge, authedRequest } = require('./digest');

function buildScreenshotMultipart() {
  const boundary = '----rokuPanelScreenshot' + Date.now();
  const body = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="mysubmit"',
      '',
      'Screenshot',
      `--${boundary}`,
      'Content-Disposition: form-data; name="archive"; filename=""',
      'Content-Type: application/octet-stream',
      '',
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n'),
    'utf8'
  );
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function timestampStamp() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`;
}

async function takeScreenshot(host, { username = 'rokudev', password, outDir }) {
  if (!password) throw new Error('device password not set in config.deviceCredentials.password');
  if (!outDir) throw new Error('outDir required');

  const creds = { username, password };
  const { body, contentType } = buildScreenshotMultipart();

  const challenge = await harvestChallenge(host, '/plugin_inspect');

  const trigger = await authedRequest(
    host,
    { method: 'POST', uri: '/plugin_inspect', body, contentType },
    creds,
    challenge,
    { timeoutMs: 15000 }
  );
  if (trigger.statusCode !== 200) {
    throw new Error(`Screenshot request failed (HTTP ${trigger.statusCode})`);
  }

  const html = trigger.body.toString('utf8');
  const match = html.match(/pkgs\/dev\.(jpg|png)/i);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  const downloadUri = `/pkgs/dev.${ext}`;

  let download = await authedRequest(host, { method: 'GET', uri: downloadUri }, creds, challenge, { timeoutMs: 15000 });
  if (download.statusCode === 401) {
    const freshChallenge = await harvestChallenge(host, downloadUri);
    download = await authedRequest(host, { method: 'GET', uri: downloadUri }, creds, freshChallenge, { timeoutMs: 15000 });
  }
  if (download.statusCode !== 200 || download.body.length === 0) {
    throw new Error(`Screenshot download failed (HTTP ${download.statusCode})`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const filepath = path.join(outDir, `roku-${timestampStamp()}.${ext}`);
  fs.writeFileSync(filepath, download.body);
  return filepath;
}

module.exports = { takeScreenshot };
