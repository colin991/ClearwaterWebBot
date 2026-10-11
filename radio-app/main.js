'use strict';

const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const fs = require('node:fs');
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

function setupUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
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
    send('update', { state: 'installing', version: info?.version });
    // Outdated radios update themselves: install silently and reopen.
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 4000);
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 3000);
  setInterval(check, UPDATE_CHECK_MS);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    keepOnTop();
  });

  app.whenReady().then(() => {
    loadSettings();
    const allowed = new Set(['media', 'speaker-selection']);
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));

    ipcMain.handle('settings:get', () => ({ ...settings, hook: Boolean(uIOhook) }));
    ipcMain.handle('settings:set', (_event, patch) => {
      const allowedKeys = ['key', 'micId', 'outputId', 'volume', 'filter', 'deaf', 'ptt'];
      for (const key of allowedKeys) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, key)) settings[key] = patch[key];
      }
      saveSettings();
      return { ...settings, hook: Boolean(uIOhook) };
    });
    ipcMain.handle('ptt:capture', (_event, active) => {
      capturingPtt = Boolean(active) && Boolean(uIOhook);
      return capturingPtt;
    });
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.handle('update:check', async () => {
      if (!autoUpdater || !app.isPackaged) return { state: 'dev' };
      await autoUpdater.checkForUpdates().catch(() => {});
      return { state: 'checking' };
    });
    ipcMain.on('app:quit', () => app.quit());

    createWindow();
    startHook();
    setupUpdates();
  });

  app.on('will-quit', () => {
    try { uIOhook?.stop(); } catch { /* ignore */ }
  });
  app.on('window-all-closed', () => app.quit());
}
