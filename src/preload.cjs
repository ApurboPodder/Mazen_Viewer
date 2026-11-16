const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('glbApp', {
  openDialog: () => ipcRenderer.invoke('dialog:open-model'),
  readModel: (filePath) => ipcRenderer.invoke('file:read-model', filePath),
  convertCdr: (filePath) => ipcRenderer.invoke('file:convert-cdr', filePath),
  pathForDroppedFile: (file) => webUtils.getPathForFile(file),
  previewReady: (ok) => ipcRenderer.send('preview:ready', Boolean(ok)),
  onOpenPath: (callback) => ipcRenderer.on('file:open-path', (_event, filePath) => callback(filePath))
});
