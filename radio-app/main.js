'use strict';

const { app, BrowserWindow, ipcMain, screen, session, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}

// Global push-to-talk needs a low-level hook so it works while a game has focus.
let uIOhook = null;
let UiohookKey = {};
try {
  ({ uIOhook, UiohookKey } = require('uiohook-napi'));
} catch {
  uIOhook = null;
}

// Radio tones and incoming audio must play without a click first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const UPDATE_CHECK_MS = 10 * 60 * 1000;
// Bot host relay the radio signs in through (the bot's RADIO_PUBLIC_URL).
const DEFAULT_RELAY_URL = process.env.CLEARWATER_RADIO_URL || 'ws://216.173.77.2:8102/radio';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const WINDOW_WIDTH = 232;
const WINDOW_HEIGHT = 620;
const DEFAULT_SETTINGS = Object.freeze({
  key: '',
  micId: 'default',
  outputId: 'default',
  ptt: null,
  volume: 70,
  filter: true,
  deaf: false,
  bounds: null,
});

let win = null;
let settings = { ...DEFAULT_SETTINGS };
let capturingPtt = false;
let updateReady = false;
let pttDown = false;

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch {
    // Settings are a convenience; the radio still works without them.
  }
}

/* ---------- Discord sign-in ---------- */

let signInFlow = null;

function finishSignIn(result) {
  const flow = signInFlow;
  if (!flow) return;
  signInFlow = null;
  clearTimeout(flow.timer);
  try { flow.server.close(); } catch { /* ignore */ }
  flow.resolve(result);
}

const SIGN_IN_PAGE = (text) => `<!doctype html><meta charset="utf-8"><title>Clearwater Radio</title>
<body style="background:#050b14;color:#267bd7;font:16px Segoe UI,sans-serif;display:grid;place-items:center;height:90vh">
<div>${text}</div></body>`;

/**
 * Opens Discord sign-in in the browser and waits for the redirect on the loopback address.
 * The relay exchanges the returned code, so no secret lives in the app.
 */
function signIn(info) {
  finishSignIn({ error: 'SIGN-IN CANCELLED' });
  let redirect;
  try {
    redirect = new URL(String(info?.redirectUri || ''));
  } catch {
    return Promise.resolve({ error: 'BAD SIGN-IN SETUP ON BOT' });
  }
  const clientId = String(info?.clientId || '');
  if (!/^\d{15,22}$/.test(clientId) || redirect.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(redirect.hostname)) {
    return Promise.resolve({ error: 'BAD SIGN-IN SETUP ON BOT' });
  }
  const state = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url || '/', redirect.origin);
      if (url.pathname !== redirect.pathname) {
        response.writeHead(404).end();
        return;
      }
      const ok = url.searchParams.get('state') === state && url.searchParams.get('code');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(SIGN_IN_PAGE(ok ? 'Signed in. You can close this tab and go back to the radio.' : 'Sign-in was cancelled. Go back to the radio and try again.'));
      if (ok) finishSignIn({ code: url.searchParams.get('code') });
      else if (url.searchParams.has('error') || url.searchParams.has('code')) finishSignIn({ error: 'SIGN-IN CANCELLED' });
    });
    signInFlow = { server, resolve, timer: setTimeout(() => finishSignIn({ error: 'SIGN-IN TIMED OUT' }), SIGN_IN_TIMEOUT_MS) };
    server.on('error', () => finishSignIn({ error: 'SIGN-IN PORT BUSY' }));
    server.listen(Number(redirect.port) || 80, redirect.hostname === 'localhost' ? '127.0.0.1' : redirect.hostname, () => {
      const authorize = new URL('https://discord.com/oauth2/authorize');
      authorize.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirect.toString(),
        scope: 'identify',
        state,
        prompt: 'none',
      }).toString();
      shell.openExternal(authorize.toString()).catch(() => finishSignIn({ error: 'NO BROWSER' }));
    });
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const keyNames = new Map(Object.entries(UiohookKey || {}).map(([name, code]) => [code, name]));
const MOUSE_NAMES = { 2: 'RIGHT CLICK', 3: 'MIDDLE CLICK', 4: 'MOUSE 4', 5: 'MOUSE 5' };

function bindingLabel(binding) {
  if (!binding) return 'NONE';
  if (binding.kind === 'mouse') return MOUSE_NAMES[binding.code] || `MOUSE ${binding.code}`;
  return String(keyNames.get(binding.code) || `KEY ${binding.code}`).toUpperCase();
}

function finishCapture(binding) {
  capturingPtt = false;
  settings.ptt = { ...binding, label: bindingLabel(binding) };
  saveSettings();
  send('ptt:bound', settings.ptt);
}

function setPtt(down) {
  if (pttDown === down) return;
  pttDown = down;
  send('ptt', down);
}

function matches(kind, code) {
  return settings.ptt && settings.ptt.kind === kind && settings.ptt.code === code;
}

function startHook() {
  if (!uIOhook) return;
  uIOhook.on('keydown', (event) => {
    if (capturingPtt) {
      if (event.keycode === UiohookKey.Escape) {
        capturingPtt = false;
        send('ptt:bound', settings.ptt);
        return;
      }
      finishCapture({ kind: 'key', code: event.keycode });
      return;
    }
    if (matches('key', event.keycode)) setPtt(true);
  });
  uIOhook.on('keyup', (event) => {
    if (matches('key', event.keycode)) setPtt(false);
  });
  uIOhook.on('mousedown', (event) => {
    // Left click stays free for clicking the radio itself.
    if (capturingPtt && event.button !== 1) {
      finishCapture({ kind: 'mouse', code: event.button });
      return;
    }
    if (matches('mouse', event.button)) setPtt(true);
  });
  uIOhook.on('mouseup', (event) => {
    if (matches('mouse', event.button)) setPtt(false);
  });
  try {
    uIOhook.start();
  } catch {
    uIOhook = null;
  }
}

function defaultBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - WINDOW_WIDTH - 24,
    y: area.y + Math.max(0, area.height - WINDOW_HEIGHT - 24),
  };
}

function visibleBounds(saved) {
  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return defaultBounds();
  const onScreen = screen.getAllDisplays().some(({ workArea: area }) => saved.x + 40 > area.x
    && saved.x < area.x + area.width - 40
    && saved.y + 40 > area.y
    && saved.y < area.y + area.height - 40);
  return onScreen ? saved : defaultBounds();
}

function keepOnTop() {
  if (!win || win.isDestroyed()) return;
  // 'screen-saver' sits above borderless/windowed-fullscreen games.
  win.setAlwaysOnTop(true, 'screen-saver');
}

function createWindow() {
  const { x, y } = visibleBounds(settings.bounds);
  win = new BrowserWindow({
    x,
    y,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    title: 'Clearwater Radio',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  keepOnTop();
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on('blur', keepOnTop);
  win.on('moved', () => {
    const [wx, wy] = win.getPosition();
    settings.bounds = { x: wx, y: wy };
    saveSettings();
  });
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function updateLog(level, args) {
  try {
    const line = `${new Date().toISOString()} ${level} ${args.map((part) => (part instanceof Error ? part.stack || part.message : String(part))).join(' ')}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'update.log'), line);
  } catch {
    // Logging must never break updates.
  }
}

function checkForUpdates() {
  if (!autoUpdater || !app.isPackaged) return Promise.resolve();
  return autoUpdater.checkForUpdates().catch((error) => updateLog('error', [error]));
}

function setupUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  // %APPDATA%\Clearwater Radio\update.log explains any update that does not apply.
  autoUpdater.logger = {
    info: (...args) => updateLog('info', args),
    warn: (...args) => updateLog('warn', args),
    error: (...args) => updateLog('error', args),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Installer names never change between versions, so a blockmap diff would compare against itself.
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.on('checking-for-update', () => send('update', { state: 'checking' }));
  autoUpdater.on('update-not-available', () => send('update', { state: 'current' }));
  autoUpdater.on('update-available', (info) => send('update', { state: 'downloading', version: info?.version, percent: 0 }));
  autoUpdater.on('download-progress', (progress) => send('update', { state: 'downloading', percent: Math.round(progress?.percent || 0) }));
  autoUpdater.on('error', (error) => send('update', { state: 'error', message: String(error?.message || error).slice(0, 120) }));
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    send('update', { state: 'installing', version: info?.version });
    // Outdated radios update themselves: install silently and reopen.
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 4000);
  });
  setTimeout(checkForUpdates, 3000);
  setInterval(checkForUpdates, UPDATE_CHECK_MS);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    keepOnTop();
    // Opening the radio again also looks for a new version.
    void checkForUpdates();
  });

  app.whenReady().then(() => {
    loadSettings();
    const allowed = new Set(['media', 'speaker-selection']);
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));

    ipcMain.handle('settings:get', () => ({ ...settings, hook: Boolean(uIOhook), relayUrl: DEFAULT_RELAY_URL }));
    ipcMain.handle('settings:set', (_event, patch) => {
      const allowedKeys = ['key', 'micId', 'outputId', 'volume', 'filter', 'deaf', 'ptt'];
      for (const key of allowedKeys) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, key)) settings[key] = patch[key];
      }
      saveSettings();
      return { ...settings, hook: Boolean(uIOhook), relayUrl: DEFAULT_RELAY_URL };
    });
    ipcMain.handle('ptt:capture', (_event, active) => {
      capturingPtt = Boolean(active) && Boolean(uIOhook);
      return capturingPtt;
    });
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.handle('auth:signin', (_event, info) => signIn(info));
    ipcMain.handle('auth:cancel', () => finishSignIn({ error: 'SIGN-IN CANCELLED' }));
    ipcMain.handle('update:check', async () => {
      if (!autoUpdater || !app.isPackaged) return { state: 'dev' };
      void checkForUpdates();
      return { state: 'checking' };
    });
    // QUIT always ends the process (so the next launch checks for updates), installing a waiting update first.
    ipcMain.on('app:quit', () => {
      saveSettings();
      if (updateReady) {
        autoUpdater.quitAndInstall(true, true);
        return;
      }
      app.exit(0);
    });

    createWindow();
    startHook();
    setupUpdates();
  });

  // The global key hook is released when the process exits; stopping it on quit can hang on Windows.
  app.on('window-all-closed', () => app.quit());
}
