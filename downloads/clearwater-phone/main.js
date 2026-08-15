const { app, BrowserWindow, globalShortcut, ipcMain, screen, session, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

const SITE = 'https://cwrpvc.lol';
const SESSION_PARTITION = 'persist:clearwater-phone';

function phoneSession() {
  return session.fromPartition(SESSION_PARTITION);
}

async function hasSiteSession() {
  const cookies = await phoneSession().cookies.get({ url: SITE });
  return cookies.some((cookie) => cookie.name.includes('clearwater_session') && cookie.value);
}

async function siteFetch(pathname, { method = 'GET', body } = {}) {
  const url = pathname.startsWith('http') ? pathname : SITE + pathname;
  const payload = body != null ? JSON.stringify(body) : null;
  const response = await net.fetch(url, {
    method,
    session: phoneSession(),
    headers: {
      Accept: 'application/json',
      Origin: SITE,
      Referer: SITE + '/internet',
      'User-Agent': 'ClearwaterPhone/' + pkg.version,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload || undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 180) || 'Invalid response' };
  }
  return { ok: response.ok, status: response.status, body: data };
}

let loginWin = null;

function openLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.focus();
    return loginWin;
  }
  loginWin = new BrowserWindow({
    width: 480,
    height: 720,
    title: 'Sign in to Clearwater',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      partition: SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loginWin.loadURL(SITE + '/signin?next=/internet');
  const finishIfSignedIn = async () => {
    if (await hasSiteSession()) {
      if (loginWin && !loginWin.isDestroyed()) loginWin.close();
    }
  };
  loginWin.webContents.on('did-navigate', finishIfSignedIn);
  loginWin.webContents.on('did-navigate-in-page', finishIfSignedIn);
  loginWin.on('closed', () => {
    loginWin = null;
  });
  return loginWin;
}

const ALLOWED_HOSTS = new Set(['cwrpvc.lol', 'www.cwrpvc.lol', 'localhost', '127.0.0.1']);
const pkg = require('./package.json');

let win = null;
let visible = true;

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
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.platform === 'linux') {
    try {
      win.setIcon(path.join(__dirname, 'build', 'icon.png'));
    } catch {}
  }

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

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'ClearwaterPhone/' + pkg.version } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('Download failed (HTTP ' + res.statusCode + ')'));
        res.resume();
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      const file = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total && onProgress) onProgress(received / total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
      file.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(10 * 60 * 1000, () => {
      req.destroy(new Error('Download timed out'));
    });
  });
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

  ipcMain.handle('phone-get-version', () => ({
    version: pkg.version,
    name: pkg.productName || pkg.name
  }));

  ipcMain.handle('phone-session', async () => {
    const signedIn = await hasSiteSession();
    if (!signedIn) return { authenticated: false };
    const me = await siteFetch('/api/auth/me');
    return me.body || { authenticated: false };
  });

  ipcMain.handle('phone-login', async () => {
    openLoginWindow();
    return { ok: true };
  });

  ipcMain.handle('phone-logout', async () => {
    try {
      await siteFetch('/api/auth/logout', { method: 'POST', body: {} });
    } catch {}
    const cookies = await phoneSession().cookies.get({ url: SITE });
    await Promise.all(cookies.map((cookie) => phoneSession().cookies.remove(SITE, cookie.name).catch(() => {})));
    return { ok: true };
  });

  ipcMain.handle('phone-api', async (_e, payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    const action = String(body.action || '');
    const allowed = new Set([
      'wallet', 'wallet-transfer', 'wallet-transfer-respond',
      'messages', 'conversation', 'message-send',
      'findmy', 'findmy-share', 'erlc-phone-map', 'erlc-location',
    ]);
    if (!allowed.has(action)) return { ok: false, status: 400, body: { error: 'Unsupported phone action' } };
    return siteFetch('/api/internet', { method: 'POST', body });
  });

  ipcMain.handle('phone-install-update', async (event, href) => {
    try {
      const url = new URL(String(href || ''));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { ok: false, error: 'Invalid update URL' };
      }
      if (!ALLOWED_HOSTS.has(url.hostname)) {
        return { ok: false, error: 'Update host not allowed' };
      }

      const dest = path.join(app.getPath('downloads'), 'ClearwaterPhone.exe');
      const partial = dest + '.part';
      try {
        fs.unlinkSync(partial);
      } catch {}

      await downloadFile(url.toString(), partial, (ratio) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('phone-update-progress', Math.round(ratio * 100));
        }
      });

      try {
        fs.unlinkSync(dest);
      } catch {}
      fs.renameSync(partial, dest);

      const child = spawn(dest, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();

      setTimeout(() => app.quit(), 600);
      return { ok: true, path: dest };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
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
