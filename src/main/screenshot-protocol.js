const { protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const { getMediaDirs } = require('./paths');

function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'screenshot', privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ]);
}

function handleProtocol() {
  protocol.handle('screenshot', (req) => {
    const { pathname } = new URL(req.url);
    const filename = path.basename(decodeURIComponent(pathname));
    if (!filename || !/\.(jpg|jpeg|png|webm|mp4)$/i.test(filename)) {
      return new Response('Not found', { status: 404 });
    }
    for (const dir of getMediaDirs()) {
      const fullpath = path.join(dir, filename);
      if (fs.existsSync(fullpath)) return net.fetch(pathToFileURL(fullpath).toString());
    }
    return new Response('Not found', { status: 404 });
  });
}

module.exports = { registerScheme, handleProtocol };
