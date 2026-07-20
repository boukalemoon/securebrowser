'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupBridge', {
  onData:  (cb) => ipcRenderer.on('bookmark-popup-data', (_, d) => cb(d)),
  save:    (r)  => ipcRenderer.invoke('bookmark-popup-save', r),
  delete:  ()   => ipcRenderer.invoke('bookmark-popup-delete'),
  close:   ()   => ipcRenderer.invoke('bookmark-popup-close'),
});
