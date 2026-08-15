const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anchorPhone', {
  minimize: () => ipcRenderer.send('phone-minimize'),
  close: () => ipcRenderer.send('phone-close'),
  drag: (dx, dy) => ipcRenderer.send('phone-drag', { dx, dy }),
  openUrl: (href) => ipcRenderer.invoke('phone-open-url', href),
  getVersion: () => ipcRenderer.invoke('phone-get-version'),
  session: () => ipcRenderer.invoke('phone-session'),
  login: () => ipcRenderer.invoke('phone-login'),
  logout: () => ipcRenderer.invoke('phone-logout'),
  api: (payload) => ipcRenderer.invoke('phone-api', payload),
  installUpdate: (href) => ipcRenderer.invoke('phone-install-update', href),
  onUpdateProgress: (cb) => {
    ipcRenderer.on('phone-update-progress', (_e, pct) => cb(pct));
  },
  onVisibility: (cb) => {
    ipcRenderer.on('overlay-visibility', (_e, v) => cb(v));
  }
});
