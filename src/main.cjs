const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

let mainWindow;
let pendingFile = null;
const supportedExtensions = /\.(glb|stl|fbx|3dm|stp|step|igs|iges|obj|ply|dae|3ds|3mf|amf|pdf|svg|png|jpe?g|webp|bmp|gif|tiff?|cdr|cmx)$/i;
const isSupportedFile = (value) => typeof value === 'string' && supportedExtensions.test(value);
const takeFileArg = (argv) => argv.find((value) => isSupportedFile(value) && !value.startsWith('--'));

if (process.platform === 'win32' && process.argv.length > 1) pendingFile = takeFileArg(process.argv);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    const file = takeFileArg(argv);
    if (file) sendFile(file);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    ipcMain.handle('dialog:open-model', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open a file', properties: ['openFile'],
        filters: [
          { name: 'All supported files', extensions: ['glb', 'stl', 'fbx', '3dm', 'stp', 'step', 'igs', 'iges', 'obj', 'ply', 'dae', '3ds', '3mf', 'amf', 'pdf', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'cdr', 'cmx'] },
          { name: '3D models', extensions: ['glb', 'stl', 'fbx', '3dm', 'stp', 'step', 'igs', 'iges', 'obj', 'ply', 'dae', '3ds', '3mf', 'amf'] },
          { name: '2D documents and images', extensions: ['pdf', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'cdr', 'cmx'] }
        ]
      });
      return result.canceled ? null : result.filePaths[0];
    });
    ipcMain.handle('file:read-model', async (_event, filePath) => {
      if (!isSupportedFile(filePath)) throw new Error('This file format is not supported.');
      const data = await fs.readFile(filePath);
      return { name: path.basename(filePath), data: new Uint8Array(data) };
    });
    ipcMain.handle('file:convert-cdr', async (_event, filePath) => {
      if (typeof filePath !== 'string' || !/\.(cdr|cmx)$/i.test(filePath)) throw new Error('Choose a CDR or CMX drawing.');
      const converterPath = app.isPackaged
        ? path.join(process.resourcesPath, 'cdr-tools', 'tracedraw-cli.exe')
        : path.join(__dirname, 'vendor', 'tracedraw', 'tracedraw-cli.exe');
      const outputPath = path.join(os.tmpdir(), `${randomUUID()}.svg`);
      try {
        await execFileAsync(converterPath, ['convert', filePath, outputPath], {
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 16 * 1024 * 1024
        });
        const data = await fs.readFile(outputPath);
        return { name: path.basename(filePath), data: new Uint8Array(data) };
      } catch (error) {
        throw new Error(error.stderr?.trim() || error.message || 'This CDR drawing could not be converted.');
      } finally {
        await fs.rm(outputPath, { force: true });
      }
    });
    mainWindow = new BrowserWindow({
      width: 1280, height: 840, minWidth: 800, minHeight: 560,
      backgroundColor: '#10131a', title: 'MAZEN Viewer',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.webContents.once('did-finish-load', () => {
      if (pendingFile) { sendFile(pendingFile); pendingFile = null; }
    });
    mainWindow.on('page-title-updated', (event) => event.preventDefault());
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

function sendFile(file) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('file:open-path', file);
  else pendingFile = file;
}
