const http = require('http');
const crypto = require('crypto');

const SIDELOAD_PORT = 80;

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

function parseDigestChallenge(header) {
  const params = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let m;
  while ((m = re.exec(header))) {
    params[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return params;
}

function buildDigestHeader(challenge, { username, password, method, uri }) {
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const qop = challenge.qop ? challenge.qop.split(',')[0].trim() : null;
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`
  ];
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  return 'Digest ' + parts.join(', ');
}

function rawRequest(host, opts, body, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port: SIDELOAD_PORT, timeout: timeoutMs, agent: false, ...opts }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function harvestChallenge(host, uri) {
  const probe = await rawRequest(host, { method: 'GET', path: uri, headers: { Connection: 'close' } }, null, { timeoutMs: 15000 });
  if (probe.statusCode !== 401) {
    throw new Error(`Expected 401 challenge from ${uri}, got ${probe.statusCode}`);
  }
  const wwwAuth = probe.headers['www-authenticate'];
  if (!wwwAuth || !wwwAuth.toLowerCase().startsWith('digest ')) {
    throw new Error('Server did not issue a Digest challenge');
  }
  return parseDigestChallenge(wwwAuth.slice(7));
}

function authedRequest(host, { method, uri, body, contentType }, creds, challenge, opts) {
  const authHeader = buildDigestHeader(challenge, { ...creds, method, uri });
  const headers = {
    Authorization: authHeader,
    Connection: 'close',
    ...(body ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) } : {})
  };
  return rawRequest(host, { method, path: uri, headers }, body, opts);
}

module.exports = { rawRequest, harvestChallenge, authedRequest, SIDELOAD_PORT };
