const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EXCLUDED_NAMES = new Set([
  '.git', '.svn', '.hg', 'node_modules', '.vscode', '.idea',
  '.DS_Store', 'Thumbs.db', 'desktop.ini', '.brsdoc', 'out', 'dist', 'build'
]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 0x1F) << 11)
             | ((d.getMinutes() & 0x3F) << 5)
             | (Math.floor(d.getSeconds() / 2) & 0x1F);
  const yr = Math.max(0, d.getFullYear() - 1980);
  const date = ((yr & 0x7F) << 9)
             | (((d.getMonth() + 1) & 0x0F) << 5)
             | (d.getDate() & 0x1F);
  return { time, date };
}

function walkFiles(root) {
  const out = [];
  function walk(dir, rel) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (EXCLUDED_NAMES.has(e.name)) continue;
      const full = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, relPath);
      else if (e.isFile()) out.push({ full, rel: relPath });
    }
  }
  walk(root, '');
  return out;
}

function hasManifest(folderPath) {
  return fs.existsSync(path.join(folderPath, 'manifest'));
}

// Returns a Buffer containing a deflate-compressed ZIP of folderPath's contents
// (manifest lands at the ZIP root, matching Roku sideload expectations).
function zipFolder(folderPath) {
  if (!fs.existsSync(folderPath)) throw new Error(`Folder not found: ${folderPath}`);
  if (!fs.statSync(folderPath).isDirectory()) throw new Error(`Not a directory: ${folderPath}`);

  const files = walkFiles(folderPath);
  if (!files.length) throw new Error(`No files found in ${folderPath}`);

  const { time, date } = dosDateTime();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const f of files) {
    const content = fs.readFileSync(f.full);
    const nameBuf = Buffer.from(f.rel, 'utf8');
    const crc = crc32(content);

    // Use store for empty files; deflate otherwise. Fall back to store if
    // deflate would somehow inflate the size (rare but spec-compliant).
    let method = 0;
    let payload = content;
    if (content.length > 0) {
      const deflated = zlib.deflateRawSync(content, { level: 9 });
      if (deflated.length < content.length) {
        method = 8;
        payload = deflated;
      }
    }

    // bit 11 of the GP flag = filename in UTF-8
    const flags = 0x0800;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localChunks.push(localHeader, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);  // version made by
    central.writeUInt16LE(20, 6);  // version needed
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);  // extra
    central.writeUInt16LE(0, 32);  // comment
    central.writeUInt16LE(0, 34);  // disk
    central.writeUInt16LE(0, 36);  // internal attrs
    central.writeUInt32LE(0, 38);  // external attrs
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuf);

    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralStart = offset;
  const centralSize = centralChunks.reduce((s, b) => s + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

module.exports = { zipFolder, hasManifest, walkFiles };
