const { app, BrowserWindow, globalShortcut, ipcMain, screen, session, net, shell, Tray, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn, execFile } = require('child_process');

const SITE = 'https://cwrpvc.lol';
const SESSION_PARTITION = 'persist:clearwater-phone';

function phoneSession() {
  return session.fromPartition(SESSION_PARTITION);
}

async function cookieHeaderForSite() {
  const cookies = await phoneSession().cookies.get({ url: SITE });
  return cookies
    .filter((cookie) => cookie.value)
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join('; ');
}

async function hasSiteSession() {
  const cookies = await phoneSession().cookies.get({ url: SITE });
  return cookies.some((cookie) => /clearwater_session/i.test(cookie.name) && cookie.value);
}

async function siteFetch(pathname, { method = 'GET', body } = {}) {
  const url = pathname.startsWith('http') ? pathname : SITE + pathname;
  const payload = body != null ? JSON.stringify(body) : null;
  const cookie = await cookieHeaderForSite();
  const response = await net.fetch(url, {
    method,
    session: phoneSession(),
    useSessionCookies: true,
    headers: {
      Accept: 'application/json',
      Origin: SITE,
      Referer: SITE + '/internet',
      'User-Agent': 'ClearwaterPhone/' + pkg.version,
      ...(cookie ? { Cookie: cookie } : {}),
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

function notifyOverlayAuth(payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('phone-auth', payload || { authenticated: false });
  }
}

async function readAuthState() {
  if (!(await hasSiteSession())) return { authenticated: false, siteAccess: false };
  const me = await siteFetch('/api/auth/me');
  return me.body && typeof me.body === 'object' ? me.body : { authenticated: false, siteAccess: false };
}

let loginWin = null;

function closeLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) loginWin.close();
}

function openLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.show();
    loginWin.focus();
    return loginWin;
  }
  loginWin = new BrowserWindow({
    width: 520,
    height: 760,
    title: 'Sign in to Clearwater',
    autoHideMenuBar: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    icon: iconPath(),
    webPreferences: {
      partition: SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loginWin.setAlwaysOnTop(true, 'screen-saver');
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  loginWin.loadURL(SITE + '/signin?next=/internet');

  const finishIfSignedIn = async () => {
    if (!(await hasSiteSession())) return;
    const auth = await readAuthState();
    notifyOverlayAuth(auth);
    if (auth.authenticated) closeLoginWindow();
  };

  loginWin.webContents.on('did-navigate', finishIfSignedIn);
  loginWin.webContents.on('did-navigate-in-page', finishIfSignedIn);
  loginWin.webContents.on('did-redirect-navigation', finishIfSignedIn);
  loginWin.webContents.on('did-finish-load', finishIfSignedIn);
  loginWin.on('closed', () => {
    loginWin = null;
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver');
    void readAuthState().then(notifyOverlayAuth);
  });
  return loginWin;
}

const ALLOWED_HOSTS = new Set(['cwrpvc.lol', 'www.cwrpvc.lol', 'localhost', '127.0.0.1']);
const pkg = require('./package.json');

let win = null;
let launcherWin = null;
let tray = null;
let visible = true;
let watchTimer = null;
let robloxWasOpen = false;

function settingsPath() {
  return path.join(app.getPath('userData'), 'phone-host-settings.json');
}

function defaultHostSettings() {
  return {
    startWithWindows: false,
    launchOnApp: true,
    watchProcess: 'RobloxPlayerBeta.exe',
  };
}

function readHostSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultHostSettings(), ...parsed };
  } catch {
    return defaultHostSettings();
  }
}

function writeHostSettings(next) {
  const value = { ...defaultHostSettings(), ...next };
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(value));
  applyLoginItem(value);
  return value;
}

function applyLoginItem(settings) {
  try {
    app.setLoginItemSettings({
      openAtLogin: settings.startWithWindows === true,
      path: process.execPath,
      args: ['--watch'],
    });
  } catch {}
}

function argvHas(flag) {
  return process.argv.includes(flag);
}

function iconPath() {
  return path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function isProcessRunning(imageName) {
  const name = String(imageName || '').replace(/[^\w.-]/g, '');
  if (!name || !/\.exe$/i.test(name)) return Promise.resolve(false);
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH'], { windowsHide: true }, (err, stdout) => {
      const out = String(stdout || '');
      resolve(!err && out.toLowerCase().includes(name.toLowerCase()) && !/no tasks/i.test(out));
    });
  });
}

function ensureTray() {
  if (tray) return;
  try {
    const image = nativeImage.createFromPath(iconPath());
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    tray.setToolTip('Clearwater Phone');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Launch Phone', click: () => { void createOverlayWindow(); } },
      { label: 'Hide overlay', click: () => { if (win) { win.hide(); visible = false; } } },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
    tray.on('click', () => { void createOverlayWindow(); });
  } catch {}
}

function startWatchLoop() {
  if (watchTimer) return;
  watchTimer = setInterval(async () => {
    const settings = readHostSettings();
    if (!settings.launchOnApp) return;
    const running = await isProcessRunning(settings.watchProcess || 'RobloxPlayerBeta.exe');
    if (running && !robloxWasOpen) {
      robloxWasOpen = true;
      await createOverlayWindow();
      if (win && !win.isDestroyed()) {
        win.show();
        visible = true;
        win.setAlwaysOnTop(true, 'screen-saver');
      }
    }
    if (!running) robloxWasOpen = false;
  }, 4000);
}

async function createOverlayWindow() {
  if (win && !win.isDestroyed()) {
    win.show();
    visible = true;
    win.setAlwaysOnTop(true, 'screen-saver');
    if (launcherWin && !launcherWin.isDestroyed()) launcherWin.close();
    return win;
  }

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
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.platform === 'linux') {
    try { win.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch {}
  }

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  visible = true;

  win.on('closed', () => {
    win = null;
  });

  if (launcherWin && !launcherWin.isDestroyed()) launcherWin.close();
  return win;
}

function createLauncherWindow() {
  if (launcherWin && !launcherWin.isDestroyed()) {
    launcherWin.focus();
    return launcherWin;
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  launcherWin = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    fullscreen: true,
    frame: false,
    backgroundColor: '#02060c',
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  launcherWin.loadFile(path.join(__dirname, 'src', 'launcher.html'));
  launcherWin.on('closed', () => {
    launcherWin = null;
    if (!win && !readHostSettings().launchOnApp && !argvHas('--watch')) {
      app.quit();
    }
  });
  return launcherWin;
}

function createWindow() {
  return createOverlayWindow();
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
  applyLoginItem(readHostSettings());
  ensureTray();
  startWatchLoop();

  phoneSession().cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || !cookie?.name || !/clearwater_session/i.test(cookie.name)) return;
    void readAuthState().then((auth) => {
      notifyOverlayAuth(auth);
      if (auth.authenticated) closeLoginWindow();
    });
  });

  if (argvHas('--watch') || argvHas('--overlay')) {
    if (argvHas('--overlay')) void createOverlayWindow();
  } else {
    createLauncherWindow();
  }

  const ok = globalShortcut.register('F8', toggleOverlay);
  if (!ok) {
    globalShortcut.register('Alt+A', toggleOverlay);
  }

  ipcMain.on('phone-minimize', () => {
    if (win) win.hide();
    visible = false;
  });

  ipcMain.on('phone-close', () => {
    if (win && !win.isDestroyed()) win.hide();
    visible = false;
    if (!readHostSettings().launchOnApp && !readHostSettings().startWithWindows) {
      app.quit();
    }
  });

  ipcMain.on('phone-quit', () => {
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

  ipcMain.handle('phone-session', async () => readAuthState());

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

  ipcMain.handle('phone-launch-overlay', async () => {
    await createOverlayWindow();
    return { ok: true };
  });

  ipcMain.handle('phone-host-settings', async () => readHostSettings());

  ipcMain.handle('phone-host-settings-save', async (_e, patch) => {
    const current = readHostSettings();
    const next = { ...current };
    if (typeof patch?.startWithWindows === 'boolean') next.startWithWindows = patch.startWithWindows;
    if (typeof patch?.launchOnApp === 'boolean') next.launchOnApp = patch.launchOnApp;
    if (typeof patch?.watchProcess === 'string') {
      const name = patch.watchProcess.replace(/[^\w.-]/g, '');
      next.watchProcess = name || 'RobloxPlayerBeta.exe';
      if (!/\.exe$/i.test(next.watchProcess)) next.watchProcess += '.exe';
    }
    return writeHostSettings(next);
  });

  ipcMain.handle('phone-feed', async () => siteFetch('/api/internet'));

  ipcMain.handle('phone-api', async (_e, payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    const action = String(body.action || '');
    const allowed = new Set([
      'wallet', 'wallet-transfer', 'wallet-transfer-respond',
      'messages', 'conversation', 'message-send',
      'findmy', 'findmy-share', 'erlc-phone-map', 'erlc-location',
      'post', 'post-interaction',
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
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (readHostSettings().launchOnApp || readHostSettings().startWithWindows) return;
  if (process.platform !== 'darwin') app.quit();
});
