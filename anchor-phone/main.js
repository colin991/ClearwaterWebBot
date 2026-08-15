const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } = require('electron');
const path = require('path');

let win = null;
let visible = true;

const ALLOWED_HOSTS = new Set(['cwrpvc.lol', 'www.cwrpvc.lol', 'localhost', '127.0.0.1']);

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const phoneW = 390;
  const phoneH = 800;

  win = new BrowserWindow({
    width: phoneW,
    height: phoneH,
    x: sw - phoneW - 28,
    y: Math.max(24, Math.floor((sh - phoneH) / 2)),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.on('closed', () => {
    win = null;
  });
}

function toggleOverlay() {
  if (!win) return;
  visible = !visible;
  if (visible) {
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
  } else {
    win.hide();
  }
  if (win && !win.isDestroyed()) {
    win.webContents.send('overlay-visibility', visible);
  }
}

app.whenReady().then(() => {
  createWindow();

  const ok = globalShortcut.register('F8', toggleOverlay);
  if (!ok) {
    globalShortcut.register('Alt+A', toggleOverlay);
  }

  ipcMain.on('phone-minimize', () => {
    if (win) win.hide();
    visible = false;
  });

  ipcMain.on('phone-close', () => {
    app.quit();
  });

  ipcMain.on('phone-drag', (_e, { dx, dy }) => {
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });

  ipcMain.handle('phone-open-url', async (_e, href) => {
    try {
      const url = new URL(String(href || ''));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
      if (!ALLOWED_HOSTS.has(url.hostname)) return false;
      await shell.openExternal(url.toString());
      return true;
    } catch {
      return false;
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
