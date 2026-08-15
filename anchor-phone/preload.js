const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anchorPhone', {
  minimize: () => ipcRenderer.send('phone-minimize'),
  close: () => ipcRenderer.send('phone-close'),
  quit: () => ipcRenderer.send('phone-quit'),
  drag: (dx, dy) => ipcRenderer.send('phone-drag', { dx, dy }),
  openUrl: (href) => ipcRenderer.invoke('phone-open-url', href),
  getVersion: () => ipcRenderer.invoke('phone-get-version'),
  session: () => ipcRenderer.invoke('phone-session'),
  login: () => ipcRenderer.invoke('phone-login'),
  logout: () => ipcRenderer.invoke('phone-logout'),
  launchOverlay: () => ipcRenderer.invoke('phone-launch-overlay'),
  hostSettings: () => ipcRenderer.invoke('phone-host-settings'),
  saveHostSettings: (patch) => ipcRenderer.invoke('phone-host-settings-save', patch),
  showOverlay: () => ipcRenderer.invoke('phone-show-overlay'),
  feed: () => ipcRenderer.invoke('phone-feed'),
  api: (payload) => ipcRenderer.invoke('phone-api', payload),
  installUpdate: (href) => ipcRenderer.invoke('phone-install-update', href),
  checkUpdate: () => ipcRenderer.invoke('phone-check-update'),
  onUpdateProgress: (cb) => {
    ipcRenderer.on('phone-update-progress', (_e, pct) => cb(pct));
  },
  onAuth: (cb) => {
    ipcRenderer.on('phone-auth', (_e, payload) => cb(payload));
  },
  onHostSettings: (cb) => {
    ipcRenderer.on('phone-host-settings', (_e, payload) => cb(payload));
  },
});
