// Мост оболочки (полоса вкладок и домашний экран) в main. Только для страницы оболочки:
// у страниц игр своя предзагрузка без мостов (game-preload.js).
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('igroteka', {
  init: () => ipcRenderer.invoke('shell:init'),
  open: (id) => ipcRenderer.send('tabs:open', id),
  activate: (id) => ipcRenderer.send('tabs:activate', id),
  close: (id) => ipcRenderer.send('tabs:close', id),
  revive: (id) => ipcRenderer.send('tabs:revive', id),
  menu: (id) => ipcRenderer.send('tabs:menu', id),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  clearData: (id) => ipcRenderer.invoke('games:clear', id),
  modalResult: (id, index) => ipcRenderer.send('modal:result', id, index),
  modalLocal: (open) => ipcRenderer.send('modal:local', open),
  onState: (cb) => ipcRenderer.on('shell:state', (_e, s) => cb(s)),
  onModal: (cb) => ipcRenderer.on('shell:modal', (_e, m) => cb(m)),
});
