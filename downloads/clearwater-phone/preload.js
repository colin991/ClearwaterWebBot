const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anchorPhone', {
  minimize: () => ipcRenderer.send('phone-minimize'),
  close: () => ipcRenderer.send('phone-close'),
  drag: (dx, dy) => ipcRenderer.send('phone-drag', { dx, dy }),
  openUrl: (href) => ipcRenderer.invoke('phone-open-url', href),
  onVisibility: (cb) => {
    ipcRenderer.on('overlay-visibility', (_e, v) => cb(v));
  }
});
