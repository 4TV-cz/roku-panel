const http = require('http');

const ECP_PORT = 8060;

function postEcp(host, path, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host,
        port: ECP_PORT,
        method: 'POST',
        path,
        headers: { 'cache-control': 'no-cache' },
        timeout: timeoutMs
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode });
          } else {
            reject(new Error(`ECP ${path} returned ${res.statusCode}`));
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout on ${path}`)); });
    req.on('error', reject);
    req.end();
  });
}

function buildQuery(params) {
  const usable = (params || []).filter((p) => p && p.key);
  if (!usable.length) return '';
  return '?' + usable
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? '')}`)
    .join('&');
}

async function launch(host, appId, params) {
  const path = `/launch/${encodeURIComponent(appId || 'dev')}${buildQuery(params)}`;
  const res = await postEcp(host, path);
  return { path, statusCode: res.statusCode };
}

async function sendInput(host, params) {
  const path = `/input${buildQuery(params)}`;
  const res = await postEcp(host, path);
  return { path, statusCode: res.statusCode };
}

module.exports = { launch, sendInput };
