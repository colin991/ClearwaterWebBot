'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('radioApp', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  capturePtt: (active) => ipcRenderer.invoke('ptt:capture', active),
  version: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  quit: () => ipcRenderer.send('app:quit'),
  onPtt: (callback) => listen('ptt', callback),
  onPttBound: (callback) => listen('ptt:bound', callback),
  onUpdate: (callback) => listen('update', callback),
});
