const { protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const { SCREENSHOT_DIR } = require('./paths');

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
    const fullpath = path.join(SCREENSHOT_DIR, filename);
    if (!fs.existsSync(fullpath)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(fullpath).toString());
  });
}

module.exports = { registerScheme, handleProtocol };
