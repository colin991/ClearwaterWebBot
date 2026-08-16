const { app, BrowserWindow, globalShortcut, ipcMain, screen, session, shell, Tray, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn, execFile } = require('child_process');

const SITE = 'https://www.cwrpvc.lol';
const SESSION_PARTITION = 'persist:clearwater-phone';
const pkg = require('./package.json');

try {
  app.setName('Clearwater Phone');
} catch {}
if (process.platform === 'win32') {
  app.setAppUserModelId('com.clearwater.phone');
}

function phoneSession() {
  return session.fromPartition(SESSION_PARTITION);
}

async function sessionCookies() {
  const ses = phoneSession();
  const all = await ses.cookies.get({});
  const sessionNamed = all.filter((cookie) => isSessionCookieName(cookie.name) && cookie.value);
  if (sessionNamed.length) return sessionNamed;
  return all.filter((cookie) => {
    const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
    return Boolean(cookie.value)
      && (!domain || domain === 'cwrpvc.lol' || domain.endsWith('.cwrpvc.lol'));
  });
}

async function cookieHeaderForSite() {
  const cookies = await sessionCookies();
  return cookies
    .filter((cookie) => cookie.value && isSessionCookieName(cookie.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function isSessionCookieName(name) {
  return /(?:^|-)clearwater_session$/i.test(String(name || ''))
    || String(name || '') === 'clearwater_phone_session';
}

async function hasSiteSession() {
  const cookies = await sessionCookies();
  return cookies.some((cookie) => isSessionCookieName(cookie.name) && cookie.value);
}

let siteWin = null;

function nodeSiteRequest(url, method, payload, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;
    const raw = payload && method !== 'GET' && method !== 'HEAD' ? Buffer.from(payload) : null;
    const req = client.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers: {
        Host: parsed.host,
        ...headers,
        ...(raw ? { 'Content-Length': String(raw.length) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          location: res.headers.location,
          text: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Request timed out')));
    if (raw) req.write(raw);
    req.end();
  });
}

async function ensureSiteWindow() {
  if (siteWin && !siteWin.isDestroyed()) return siteWin;
  siteWin = new BrowserWindow({
    show: false,
    width: 420,
    height: 320,
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      session: phoneSession(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  siteWin.on('closed', () => { siteWin = null; });
  await siteWin.loadURL(SITE + '/phone-signed-in');
  return siteWin;
}

async function siteFetchViaSession(pathname, method, payload) {
  const target = pathname.startsWith('http') ? pathname : pathname;
  const page = await ensureSiteWindow();
  const script = `fetch(${JSON.stringify(target)},${JSON.stringify({
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload || undefined,
  })}).then(async (res) => {
    const text = await res.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text.slice(0, 180) }; }
    return { ok: res.ok, status: res.status, body };
  }).catch((err) => ({ ok: false, status: 0, body: { error: String(err && err.message ? err.message : err) } }))`;
  return page.webContents.executeJavaScript(script, true);
}

async function siteFetch(pathname, { method = 'GET', body } = {}) {
  const payload = body != null ? JSON.stringify(body) : null;
  const cookie = await cookieHeaderForSite();
  const headers = {
    Accept: 'application/json',
    Origin: SITE,
    Referer: SITE + '/phone-signed-in',
    'User-Agent': 'ClearwaterPhone/' + pkg.version,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(payload ? { 'Content-Type': 'application/json' } : {}),
  };

  try {
    const viaPage = await siteFetchViaSession(pathname.startsWith('http') ? pathname : pathname, method, payload);
    if (viaPage && typeof viaPage === 'object' && !String(viaPage.body?.error || '').includes('ERR_FAILED')) {
      return viaPage;
    }
  } catch {}

  try {
    let url = pathname.startsWith('http') ? pathname : SITE + pathname;
    let verb = method;
    let response = await nodeSiteRequest(url, verb, payload, headers);
    for (let hop = 0; hop < 5 && response.status >= 300 && response.status < 400 && response.location; hop += 1) {
      url = new URL(response.location, url).toString();
      if (response.status === 301 || response.status === 302 || response.status === 303) verb = 'GET';
      response = await nodeSiteRequest(url, verb, payload, headers);
    }
    let data = {};
    try {
      data = response.text ? JSON.parse(response.text) : {};
    } catch {
      data = { error: response.text.slice(0, 180) || 'Invalid response' };
    }
    return { ok: response.ok, status: response.status, body: data };
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err && err.message ? err.message : err) } };
  }
}

async function readAuthFromWindow(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return null;
  const href = browserWindow.webContents.getURL();
  if (!/^https:\/\/(www\.)?cwrpvc\.lol\//i.test(href)) return null;
  try {
    const result = await browserWindow.webContents.executeJavaScript(
      `fetch('/api/auth/me',{credentials:'include',headers:{Accept:'application/json'}}).then((r)=>r.json()).catch(()=>({authenticated:false}))`,
      true,
    );
    return result && typeof result === 'object' ? result : null;
  } catch {
    return null;
  }
}

let cachedAuth = { authenticated: false, siteAccess: false };

function notifyOverlayAuth(payload, { force = false } = {}) {
  const auth = payload && typeof payload === 'object' ? payload : { authenticated: false };
  if (auth.authenticated) cachedAuth = auth;
  else if (!force && cachedAuth.authenticated) return cachedAuth;
  else cachedAuth = auth;
  if (win && !win.isDestroyed()) win.webContents.send('phone-auth', cachedAuth);
  if (launcherWin && !launcherWin.isDestroyed()) launcherWin.webContents.send('phone-auth', cachedAuth);
  return cachedAuth;
}

async function readAuthState() {
  const fromLogin = await readAuthFromWindow(loginWin);
  if (fromLogin?.authenticated) return notifyOverlayAuth(fromLogin);
  const me = await siteFetch('/api/auth/me');
  if (me.body && me.body.authenticated) return notifyOverlayAuth(me.body);
  if (cachedAuth.authenticated) return cachedAuth;
  if (fromLogin && typeof fromLogin === 'object') return fromLogin;
  return me.body && typeof me.body === 'object' ? me.body : { authenticated: false, siteAccess: false };
}

let loginWin = null;

function closeLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) loginWin.close();
}

function loginLooksComplete(href) {
  try {
    const url = new URL(String(href || ''));
    if (!['cwrpvc.lol', 'www.cwrpvc.lol'].includes(url.hostname.toLowerCase())) return false;
    if (url.pathname === '/phone-signed-in' || url.pathname === '/phone-signed-in.html') return true;
    if (url.pathname === '/internet' || url.pathname.startsWith('/internet/')) return true;
    if (url.searchParams.get('login') === 'success') return true;
    return false;
  } catch {
    return false;
  }
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
      session: phoneSession(),
      preload: path.join(__dirname, 'preload-login.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loginWin.setAlwaysOnTop(true, 'screen-saver');
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  loginWin.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(String(url || ''));
      if (['http:', 'https:'].includes(parsed.protocol)) loginWin.loadURL(parsed.toString());
    } catch {}
    return { action: 'deny' };
  });
  loginWin.loadURL(SITE + '/signin?next=/phone-signed-in');

  let finishing = false;
  const finishIfSignedIn = async () => {
    if (finishing || !loginWin || loginWin.isDestroyed()) return;
    const href = loginWin.webContents.getURL();
    if (!loginLooksComplete(href) && !(await hasSiteSession())) return;
    finishing = true;
    let auth = { authenticated: false };
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      auth = await readAuthState();
      if (auth.authenticated) break;
    }
    if (auth.authenticated) {
      notifyOverlayAuth(auth);
      closeLoginWindow();
    } else finishing = false;
  };

  loginWin.webContents.on('did-navigate', finishIfSignedIn);
  loginWin.webContents.on('did-navigate-in-page', finishIfSignedIn);
  loginWin.webContents.on('did-redirect-navigation', finishIfSignedIn);
  loginWin.webContents.on('did-finish-load', finishIfSignedIn);
  loginWin.on('closed', () => {
    loginWin = null;
    if (launcherIsOpen()) {
      launcherWin.show();
      launcherWin.focus();
      launcherWin.setAlwaysOnTop(true, 'screen-saver');
    } else if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  });
  return loginWin;
}

const ALLOWED_HOSTS = new Set(['cwrpvc.lol', 'www.cwrpvc.lol', 'localhost', '127.0.0.1']);

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
    setupComplete: false,
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
      { label: 'Launch Phone', click: () => { void openPhoneUi(); } },
      { label: 'Hide overlay', click: () => { if (win) { win.hide(); visible = false; } } },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
    tray.on('click', () => { void openPhoneUi(); });
  } catch {}
}

function launcherIsOpen() {
  return Boolean(launcherWin && !launcherWin.isDestroyed());
}

function startWatchLoop() {
  if (watchTimer) return;
  watchTimer = setInterval(async () => {
    if (launcherIsOpen()) return;
    const settings = readHostSettings();
    if (!settings.setupComplete || !settings.launchOnApp) return;
    const running = await isProcessRunning(settings.watchProcess || 'RobloxPlayerBeta.exe');
    if (running && !robloxWasOpen) {
      robloxWasOpen = true;
      await createOverlayWindow({ closeLauncher: false });
      if (win && !win.isDestroyed()) {
        win.show();
        visible = true;
        win.setAlwaysOnTop(true, 'screen-saver');
      }
    }
    if (!running) robloxWasOpen = false;
  }, 4000);
}

let launcherMayClose = false;
let appIsQuitting = false;

function maybeCloseLauncher() {
  launcherMayClose = true;
  if (launcherWin && !launcherWin.isDestroyed()) launcherWin.close();
}

async function createOverlayWindow({ closeLauncher = true } = {}) {
  if (win && !win.isDestroyed()) {
    win.show();
    visible = true;
    win.setAlwaysOnTop(true, 'screen-saver');
    if (closeLauncher) maybeCloseLauncher();
    return win;
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const phoneW = 390;
  const phoneH = 760;

  win = new BrowserWindow({
    width: phoneW,
    height: phoneH,
    x: sw - phoneW - 28,
    y: Math.max(24, Math.floor((sh - phoneH) / 2)),
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
    autoHideMenuBar: true,
    title: 'Clearwater Phone',
    backgroundColor: '#121820',
    icon: iconPath(),
    webPreferences: {
      partition: SESSION_PARTITION,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  if (process.platform === 'linux') {
    try { win.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch {}
  }

  win.setTitle('Clearwater Phone');
  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const overlayPage = path.join(__dirname, 'src', 'index.html');
  win.loadFile(overlayPage);
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    if (win && !win.isDestroyed()) {
      win.loadURL(`data:text/html,<body style="background:#121820;color:#f4f8ff;font-family:sans-serif;padding:24px"><h1>Clearwater Phone</h1><p>${String(desc || code)}</p></body>`);
    }
  });
  visible = true;

  win.on('closed', () => {
    win = null;
  });

  if (closeLauncher) maybeCloseLauncher();
  return win;
}

function createLauncherWindow() {
  if (launcherWin && !launcherWin.isDestroyed()) {
    launcherWin.focus();
    return launcherWin;
  }
  launcherMayClose = false;
  launcherWin = new BrowserWindow({
    width: 560,
    height: 780,
    frame: false,
    fullscreen: false,
    maximizable: false,
    alwaysOnTop: true,
    backgroundColor: '#02060c',
    autoHideMenuBar: true,
    title: 'Clearwater Phone',
    icon: iconPath(),
    webPreferences: {
      partition: SESSION_PARTITION,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  launcherWin.setMenuBarVisibility(false);
  launcherWin.setTitle('Clearwater Phone');
  launcherWin.center();
  launcherWin.loadFile(path.join(__dirname, 'src', 'launcher.html'));
  launcherWin.setAlwaysOnTop(true, 'screen-saver');
  launcherWin.on('close', (event) => {
    if (launcherMayClose) return;
    event.preventDefault();
    if (launcherWin && !launcherWin.isDestroyed()) {
      launcherWin.show();
      launcherWin.center();
      launcherWin.focus();
      launcherWin.setAlwaysOnTop(true, 'screen-saver');
    }
  });
  launcherWin.on('closed', () => {
    launcherWin = null;
    if (appIsQuitting) return;
    if (win && !win.isDestroyed()) startWatchLoop();
    else if (!readHostSettings().setupComplete) createLauncherWindow();
    else if (!win && !readHostSettings().launchOnApp && !argvHas('--watch')) {
      app.quit();
    }
  });
  return launcherWin;
}

function openPhoneUi() {
  if (launcherIsOpen()) {
    launcherWin.show();
    launcherWin.focus();
    return launcherWin;
  }
  if (!readHostSettings().setupComplete) {
    createLauncherWindow();
    return launcherWin;
  }
  return createOverlayWindow({ closeLauncher: false });
}

function createWindow() {
  return openPhoneUi();
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

  ipcMain.on('phone-login-auth', (_e, payload) => {
    const auth = payload && typeof payload === 'object' ? payload : { authenticated: false };
    if (!auth.authenticated) return;
    notifyOverlayAuth(auth);
    closeLoginWindow();
  });

  phoneSession().cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (!isSessionCookieName(cookie?.name)) return;
    if (removed) return;
    void readAuthState();
  });

  app.on('before-quit', () => {
    appIsQuitting = true;
    launcherMayClose = true;
  });

  if (argvHas('--overlay')) {
    startWatchLoop();
    void createOverlayWindow({ closeLauncher: false });
  } else if (argvHas('--watch') && readHostSettings().setupComplete) {
    startWatchLoop();
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
    launcherMayClose = true;
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
    cachedAuth = { authenticated: false, siteAccess: false };
    try {
      await siteFetch('/api/auth/logout', { method: 'POST', body: {} });
    } catch {}
    const cookies = await phoneSession().cookies.get({ url: SITE });
    await Promise.all(cookies.map((cookie) => phoneSession().cookies.remove(SITE, cookie.name).catch(() => {})));
    notifyOverlayAuth({ authenticated: false, siteAccess: false }, { force: true });
    return { ok: true };
  });

  ipcMain.handle('phone-launch-overlay', async () => {
    writeHostSettings({ ...readHostSettings(), setupComplete: true });
    await createOverlayWindow({ closeLauncher: true });
    return { ok: true };
  });

  ipcMain.handle('phone-host-settings', async () => readHostSettings());

  ipcMain.handle('phone-host-settings-save', async (_e, patch) => {
    const current = readHostSettings();
    const next = { ...current };
    if (typeof patch?.setupComplete === 'boolean') next.setupComplete = patch.setupComplete;
    if (typeof patch?.startWithWindows === 'boolean') next.startWithWindows = patch.startWithWindows;
    if (typeof patch?.launchOnApp === 'boolean') next.launchOnApp = patch.launchOnApp;
    if (typeof patch?.watchProcess === 'string') {
      const name = patch.watchProcess.replace(/[^\w.-]/g, '');
      next.watchProcess = name || 'RobloxPlayerBeta.exe';
      if (!/\.exe$/i.test(next.watchProcess)) next.watchProcess += '.exe';
    }
    return writeHostSettings(next);
  });

  ipcMain.handle('phone-check-update', async () => siteFetch('/downloads/clearwater-phone-version.json'));

  ipcMain.handle('phone-feed', async () => {
    try {
      return await siteFetch('/api/internet');
    } catch (err) {
      return { ok: false, status: 0, body: { error: String(err && err.message ? err.message : err) } };
    }
  });

  ipcMain.handle('phone-api', async (_e, payload) => {
    try {
      const body = payload && typeof payload === 'object' ? payload : {};
      const action = String(body.action || '');
      const allowed = new Set([
        'wallet', 'wallet-transfer', 'wallet-transfer-respond',
        'messages', 'conversation', 'message-send',
        'findmy', 'findmy-share', 'erlc-phone-map', 'erlc-location', 'liberty-roads-get',
        'post', 'post-interaction',
      ]);
      if (!allowed.has(action)) return { ok: false, status: 400, body: { error: 'Unsupported phone action' } };
      return await siteFetch('/api/internet', { method: 'POST', body });
    } catch (err) {
      return { ok: false, status: 0, body: { error: String(err && err.message ? err.message : err) } };
    }
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
