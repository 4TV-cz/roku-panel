const os = require('os');
const dgram = require('dgram');
const http = require('http');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const ECP_PORT = 8060;

function localIPv4Interfaces() {
  const result = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) result.push({ name, address: a.address });
    }
  }
  return result;
}

function buildMsearch() {
  return Buffer.from([
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    'ST: roku:ecp',
    'MX: 3',
    '',
    ''
  ].join('\r\n'));
}

function parseHeaders(text) {
  const headers = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function fetchDeviceInfo(ip, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get({ host: ip, port: ECP_PORT, path: '/query/device-info', timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const pick = (tag) => (body.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`)) || [])[1];
        resolve({
          ip,
          model: pick('model-name'),
          modelNumber: pick('model-number'),
          name: pick('friendly-device-name'),
          serial: pick('serial-number'),
          software: pick('software-version'),
          developer: pick('developer-enabled')
        });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function discoverViaInterface(iface, deadline) {
  return new Promise((resolve) => {
    const found = new Map();
    const errors = [];
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    sock.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      if (!/^HTTP\/1\.[01]\s+200/i.test(text)) return;
      const h = parseHeaders(text);
      const blob = `${h.server || ''} ${h.usn || ''} ${h.st || ''}`;
      if (!/roku/i.test(blob)) return;
      found.set(rinfo.address, {
        ip: rinfo.address,
        server: h.server,
        usn: h.usn,
        st: h.st,
        location: h.location,
        iface: iface.name
      });
    });

    sock.on('error', (err) => { errors.push(err.code || err.message); try { sock.close(); } catch {} });

    // Node reports a failed multicast send through the send callback, not by
    // throwing. On macOS a Local Network privacy denial shows up here as
    // EHOSTUNREACH, which is the difference between "no Roku on the LAN" and
    // "the OS never let the packet out" — keep it so the UI can say which.
    const send = () => {
      try {
        const msg = buildMsearch();
        sock.send(msg, 0, msg.length, SSDP_PORT, SSDP_ADDR, (err) => {
          if (err) errors.push(err.code || err.message);
        });
      } catch (err) { errors.push(err.code || err.message); }
    };

    sock.bind(0, iface.address, () => {
      try {
        sock.setMulticastTTL(4);
        sock.setMulticastInterface(iface.address);
      } catch (err) { errors.push(err.code || err.message); }
      send();
      setTimeout(send, 500);
      setTimeout(send, 1500);
    });

    const remaining = Math.max(500, deadline - Date.now());
    setTimeout(() => {
      try { sock.close(); } catch {}
      resolve({ devices: Array.from(found.values()), errors });
    }, remaining);
  });
}

async function findRokuDevices({ timeoutMs = 5000 } = {}) {
  const interfaces = localIPv4Interfaces();
  if (interfaces.length === 0) throw new Error('No IPv4 network interfaces found.');

  const deadline = Date.now() + timeoutMs;
  const perIface = await Promise.all(interfaces.map((i) => discoverViaInterface(i, deadline)));

  const merged = new Map();
  perIface.flatMap((r) => r.devices).forEach((r) => { if (!merged.has(r.ip)) merged.set(r.ip, r); });
  const errors = [...new Set(perIface.flatMap((r) => r.errors))];

  const validated = await Promise.all(
    Array.from(merged.values()).map(async (r) => ({ ...r, ecp: await fetchDeviceInfo(r.ip) }))
  );

  return {
    interfaces,
    errors,
    devices: validated.filter((v) => v.ecp).length ? validated.filter((v) => v.ecp) : validated
  };
}

module.exports = { findRokuDevices };
