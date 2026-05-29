const fs = require('fs');
const path = require('path');
const { harvestChallenge, authedRequest } = require('./digest');

function buildInstallMultipart(fileBytes, filename) {
  const boundary = '----rokuPanelDeploy' + Date.now();
  const head = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="mysubmit"',
      '',
      'Install',
      `--${boundary}`,
      `Content-Disposition: form-data; name="archive"; filename="${filename}"`,
      'Content-Type: application/zip',
      '',
      ''
    ].join('\r\n'),
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, fileBytes, tail]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function buildDeleteMultipart() {
  const boundary = '----rokuPanelDelete' + Date.now();
  const body = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="mysubmit"',
      '',
      'Delete',
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

function parseRokuResult(html) {
  const errMatch = html.match(/<font[^>]*color\s*=\s*"?red"?[^>]*>\s*([^<]+?)\s*</i);
  if (errMatch && !/success|succeeded/i.test(errMatch[1])) {
    return { ok: false, message: errMatch[1].trim() };
  }
  const okMatch = html.match(/Install\s+Success|Delete\s+Succeeded|Channel\s+Deleted|Identical\s+to\s+package\s+previously\s+installed|Application\s+Received/i);
  if (okMatch) return { ok: true, message: okMatch[0].replace(/\s+/g, ' ') };
  return { ok: true, message: 'Request accepted' };
}

async function postPluginInstall(host, body, contentType, creds, timeoutMs) {
  const challenge = await harvestChallenge(host, '/plugin_install');
  const res = await authedRequest(
    host,
    { method: 'POST', uri: '/plugin_install', body, contentType },
    creds,
    challenge,
    { timeoutMs }
  );
  if (res.statusCode !== 200) {
    throw new Error(`Request failed (HTTP ${res.statusCode})`);
  }
  return parseRokuResult(res.body.toString('utf8'));
}

async function deployZip(host, zipPath, { username = 'rokudev', password } = {}) {
  if (!password) throw new Error('device password not set in config.deviceCredentials.password');
  if (!zipPath) throw new Error('zipPath required');
  if (!fs.existsSync(zipPath)) throw new Error(`ZIP not found: ${zipPath}`);
  if (!/\.zip$/i.test(zipPath)) throw new Error('File must be a .zip');

  const fileBytes = fs.readFileSync(zipPath);
  const { body, contentType } = buildInstallMultipart(fileBytes, path.basename(zipPath));
  return postPluginInstall(host, body, contentType, { username, password }, 60000);
}

async function deployBuffer(host, bytes, filename, { username = 'rokudev', password } = {}) {
  if (!password) throw new Error('device password not set in config.deviceCredentials.password');
  if (!bytes || !bytes.length) throw new Error('empty payload');
  const { body, contentType } = buildInstallMultipart(bytes, filename || 'app.zip');
  return postPluginInstall(host, body, contentType, { username, password }, 60000);
}

async function deleteApp(host, { username = 'rokudev', password } = {}) {
  if (!password) throw new Error('device password not set in config.deviceCredentials.password');
  const { body, contentType } = buildDeleteMultipart();
  return postPluginInstall(host, body, contentType, { username, password }, 15000);
}

module.exports = { deployZip, deployBuffer, deleteApp };
