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
  capturePtt: (active, which = 'ptt') => ipcRenderer.invoke('ptt:capture', active, which),
  talkPopup: (text) => ipcRenderer.send('talk:popup', text),
  setPresence: (info) => ipcRenderer.send('presence:set', info),
  version: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  signIn: (info) => ipcRenderer.invoke('auth:signin', info),
  cancelSignIn: () => ipcRenderer.invoke('auth:cancel'),
  quit: () => ipcRenderer.send('app:quit'),
  takeCrashes: () => ipcRenderer.invoke('crash:take'),
  onPtt: (callback) => listen('ptt', callback),
  onPttBound: (callback) => listen('ptt:bound', callback),
  onBind: (callback) => listen('bind', callback),
  onBindBound: (callback) => listen('bind:bound', callback),
  onUpdate: (callback) => listen('update', callback),
});
