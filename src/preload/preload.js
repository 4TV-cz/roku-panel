const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rokuPanel', {
  version: '0.1.0',
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (updates) => ipcRenderer.invoke('config:set', updates),
  getHost: () => ipcRenderer.invoke('roku:getHost'),
  ping: () => ipcRenderer.invoke('roku:ping'),
  discover: () => ipcRenderer.invoke('roku:discover'),
  setHost: (ip) => ipcRenderer.invoke('roku:setHost', ip),
  signIn: (creds) => ipcRenderer.invoke('roku:signIn', creds),
  sendUsername: (creds) => ipcRenderer.invoke('roku:sendUsername', creds),
  sendPassword: (creds) => ipcRenderer.invoke('roku:sendPassword', creds),
  sendText: (text) => ipcRenderer.invoke('roku:sendText', text),
  keypress: (key) => ipcRenderer.invoke('roku:keypress', key),
  reboot: () => ipcRenderer.invoke('roku:reboot'),
  checkForUpdate: () => ipcRenderer.invoke('roku:checkForUpdate'),
  openInBrowser: () => ipcRenderer.invoke('roku:openInBrowser'),
  openTelnet: () => ipcRenderer.invoke('telnet:open'),
  closeTelnet: () => ipcRenderer.invoke('telnet:close'),
  checkTelnet: () => ipcRenderer.invoke('telnet:check'),
  getTelnetStatus: () => ipcRenderer.invoke('telnet:status'),
  onTelnetData: (cb) => {
    const handler = (_e, chunk) => cb(chunk);
    ipcRenderer.on('telnet:data', handler);
    return () => ipcRenderer.removeListener('telnet:data', handler);
  },
  onTelnetStatus: (cb) => {
    const handler = (_e, evt) => cb(evt);
    ipcRenderer.on('telnet:status', handler);
    return () => ipcRenderer.removeListener('telnet:status', handler);
  },
  screenshot: () => ipcRenderer.invoke('roku:screenshot'),
  saveCaptureImage: (bytes) => ipcRenderer.invoke('capture:save', bytes),
  saveRecording: (bytes, ext) => ipcRenderer.invoke('recording:save', bytes, ext),
  listScreenshots: () => ipcRenderer.invoke('screenshots:list'),
  openScreenshot: (filename) => ipcRenderer.invoke('screenshots:open', filename),
  deleteScreenshot: (filename) => ipcRenderer.invoke('screenshots:delete', filename),
  pickZip: () => ipcRenderer.invoke('deploy:pickZip'),
  pickFolder: () => ipcRenderer.invoke('deploy:pickFolder'),
  deployZip: (filepath) => ipcRenderer.invoke('deploy:zip', filepath),
  deployFolder: (folderpath) => ipcRenderer.invoke('deploy:folder', folderpath),
  deleteApp: () => ipcRenderer.invoke('deploy:delete'),
  listRecentDeployTargets: () => ipcRenderer.invoke('deploy:recent'),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  sendDeeplinkLaunch: (payload) => ipcRenderer.invoke('deeplink:launch', payload),
  sendDeeplinkInput: (payload) => ipcRenderer.invoke('deeplink:input', payload),
  readRegistry: () => ipcRenderer.invoke('registry:read'),
  registryAddField: (payload) => ipcRenderer.invoke('registry:addField', payload),
  registryEditField: (payload) => ipcRenderer.invoke('registry:editField', payload),
  registryRemoveField: (payload) => ipcRenderer.invoke('registry:removeField', payload),
  registryRemoveSection: (payload) => ipcRenderer.invoke('registry:removeSection', payload),
  registryImport: (payload) => ipcRenderer.invoke('registry:import', payload),
  clearDeviceRegistry: () => ipcRenderer.invoke('registry:clear')
});
