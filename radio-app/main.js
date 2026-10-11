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
  // Extra hotkeys: talk on your scan channel, replay the last 30 seconds, next channel.
  scanPtt: null,
  replayKey: null,
  chanKey: null,
  syncAt: 0,
  tutorialDone: false,
  volume: 70,
  listenFx: 'radio',
  size: 100,
  scan: [],
  channel: 'main',
  deaf: false,
  bounds: null,
});

let win = null;
let settings = { ...DEFAULT_SETTINGS };
// Which hotkey is being set ('ptt', 'scanPtt', 'replayKey', 'chanKey'), or '' when none.
let capturing = '';
let updateReady = false;
const BINDS = ['ptt', 'scanPtt', 'replayKey', 'chanKey'];
const bindDown = new Set();
let popup = null;

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const crashPath = () => path.join(app.getPath('userData'), 'crashes.json');

/* ---------- crash reporter ---------- */

// Errors in the app itself are saved here and handed to the radio screen, which sends them to the
// staff panel on its next sign-in.
function readCrashes() {
  try {
    const saved = JSON.parse(fs.readFileSync(crashPath(), 'utf8'));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function recordCrash(error, where) {
  try {
    const crash = {
      message: String(error?.message || error || 'Unknown error').slice(0, 300),
      stack: String(error?.stack || '').slice(0, 2000),
      where,
      version: app.getVersion(),
      platform: `${process.platform} ${process.arch}`,
      at: Date.now(),
    };
    fs.mkdirSync(path.dirname(crashPath()), { recursive: true });
    fs.writeFileSync(crashPath(), JSON.stringify([...readCrashes(), crash].slice(-5)));
  } catch {
    // Never let the crash reporter itself take the app down.
  }
}

process.on('uncaughtException', (error) => recordCrash(error, 'app'));
process.on('unhandledRejection', (error) => recordCrash(error, 'app-promise'));

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

// The bound hotkey reaches the radio: PTT keeps its own channel; the others share 'bind'.
function boundEvent(which, binding) {
  if (which === 'ptt') send('ptt:bound', binding);
  else send('bind:bound', { which, binding });
}

function finishCapture(binding) {
  const which = capturing;
  capturing = '';
  // Backspace clears an extra hotkey; the talk key can't be cleared.
  settings[which] = binding ? { ...binding, label: bindingLabel(binding) } : (which === 'ptt' ? settings.ptt : null);
  saveSettings();
  boundEvent(which, settings[which]);
}

function setBind(which, down) {
  if (bindDown.has(which) === down) return;
  if (down) bindDown.add(which);
  else bindDown.delete(which);
  if (which === 'ptt') send('ptt', down);
  else send('bind', { which, down });
}

function onInput(kind, code, down) {
  for (const which of BINDS) {
    const binding = settings[which];
    if (binding && binding.kind === kind && binding.code === code) setBind(which, down);
  }
}

function startHook() {
  if (!uIOhook) return;
  uIOhook.on('keydown', (event) => {
    if (capturing) {
      if (event.keycode === UiohookKey.Escape) {
        const which = capturing;
        capturing = '';
        boundEvent(which, settings[which]);
        return;
      }
      finishCapture(event.keycode === UiohookKey.Backspace && capturing !== 'ptt' ? null : { kind: 'key', code: event.keycode });
      return;
    }
    onInput('key', event.keycode, true);
  });
  uIOhook.on('keyup', (event) => onInput('key', event.keycode, false));
  uIOhook.on('mousedown', (event) => {
    // Left click stays free for clicking the radio itself.
    if (capturing && event.button !== 1) {
      finishCapture({ kind: 'mouse', code: event.button });
      return;
    }
    onInput('mouse', event.button, true);
  });
  uIOhook.on('mouseup', (event) => onInput('mouse', event.button, false));
  try {
    uIOhook.start();
  } catch {
    uIOhook = null;
  }
}

// SIZE setting: the whole radio is drawn at 60-130% of full size (the dial on the radio).
function sizeFactor() {
  const size = Number(settings.size);
  if (!Number.isFinite(size) || size <= 0) return 1;
  return Math.max(60, Math.min(130, Math.round(size / 5) * 5)) / 100;
}

function windowSize() {
  const factor = sizeFactor();
  return { width: Math.round(WINDOW_WIDTH * factor), height: Math.round(WINDOW_HEIGHT * factor) };
}

function defaultBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const { width, height } = windowSize();
  return {
    x: area.x + area.width - width - 24,
    y: area.y + Math.max(0, area.height - height - 24),
  };
}

// Resize around the bottom-right corner, where the radio usually sits.
function applySize() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = windowSize();
  const [x, y] = win.getPosition();
  const [oldWidth, oldHeight] = win.getSize();
  if (oldWidth !== width || oldHeight !== height) {
    // A bigger radio grows up and left, but never off the top or left of its screen.
    const area = screen.getDisplayMatching({ x, y, width: oldWidth, height: oldHeight }).workArea;
    const left = Math.max(area.x, x + oldWidth - width);
    const top = Math.max(area.y, y + oldHeight - height);
    win.setResizable(true);
    win.setBounds({ x: left, y: top, width, height });
    win.setResizable(false);
  }
  win.webContents.setZoomFactor(sizeFactor());
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
  const { width, height } = windowSize();
  win = new BrowserWindow({
    x,
    y,
    width,
    height,
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
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  keepOnTop();
  // The radio screen crashed: note it for the staff panel and bring it back.
  win.webContents.on('render-process-gone', (_event, details) => {
    recordCrash(new Error(`Radio screen stopped (${details?.reason || 'unknown'}, exit ${details?.exitCode ?? '?'})`), 'screen');
    if (details?.reason !== 'clean-exit' && win && !win.isDestroyed()) setTimeout(() => win?.webContents?.reload(), 1000);
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on('blur', keepOnTop);
  win.on('moved', () => {
    const [wx, wy] = win.getPosition();
    settings.bounds = { x: wx, y: wy };
    saveSettings();
  });
  win.on('closed', () => { win = null; });
  // Back on screen: the talk pop-up is not needed.
  win.on('restore', () => showTalkPopup(''));
  win.on('show', () => showTalkPopup(''));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('did-finish-load', () => win?.webContents.setZoomFactor(sizeFactor()));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Who is talking, in a small always-on-top pop-up while the radio window is minimized or hidden.
const POPUP_HTML = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:700 13px Segoe UI,sans-serif}
#p{box-sizing:border-box;height:100%;display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:10px;
background:rgba(6,14,26,.92);color:#e9f1fb;border:1px solid #267bd7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#p b{color:#36c25a}#p i{width:9px;height:9px;border-radius:50%;background:#36c25a;box-shadow:0 0 6px #36c25a;flex:none}
</style><div id="p"><i></i><span id="t"></span></div>`;

function radioHidden() {
  return !win || win.isDestroyed() || win.isMinimized() || !win.isVisible();
}

function showTalkPopup(text) {
  if (!text || !radioHidden()) {
    if (popup && !popup.isDestroyed()) popup.hide();
    return;
  }
  if (!popup || popup.isDestroyed()) {
    const area = screen.getPrimaryDisplay().workArea;
    popup = new BrowserWindow({
      x: area.x + area.width - 284,
      y: area.y + area.height - 64,
      width: 260,
      height: 40,
      frame: false,
      transparent: true,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    popup.setAlwaysOnTop(true, 'screen-saver');
    popup.setIgnoreMouseEvents(true);
    popup.on('closed', () => { popup = null; });
    popup.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(POPUP_HTML)}`);
  }
  const target = popup;
  const apply = () => {
    if (target.isDestroyed()) return;
    void target.webContents.executeJavaScript(`document.getElementById('t').textContent=${JSON.stringify(String(text).slice(0, 60))}`).catch(() => {});
    target.showInactive();
  };
  if (target.webContents.isLoading()) target.webContents.once('did-finish-load', apply);
  else apply();
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
      const allowedKeys = ['key', 'micId', 'outputId', 'volume', 'listenFx', 'size', 'scan', 'channel', 'deaf', 'ptt',
        'scanPtt', 'replayKey', 'chanKey', 'syncAt', 'tutorialDone', 'recordNotice', 'monitor'];
      for (const key of allowedKeys) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, key)) settings[key] = patch[key];
      }
      saveSettings();
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'size')) applySize();
      return { ...settings, hook: Boolean(uIOhook), relayUrl: DEFAULT_RELAY_URL };
    });
    ipcMain.handle('ptt:capture', (_event, active, which = 'ptt') => {
      capturing = active && uIOhook && BINDS.includes(which) ? which : '';
      return Boolean(capturing);
    });
    ipcMain.on('talk:popup', (_event, text) => showTalkPopup(typeof text === 'string' ? text : ''));
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.handle('crash:take', () => {
      const crashes = readCrashes();
      try { fs.rmSync(crashPath(), { force: true }); } catch { /* ignore */ }
      return crashes;
    });
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
