'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ilgezdiLocale', ipcRenderer.sendSync('i18n-bundle'));

contextBridge.exposeInMainWorld('popupBridge', {
  onData:  (cb) => ipcRenderer.on('bookmark-popup-data', (_, d) => cb(d)),
  save:    (r)  => ipcRenderer.invoke('bookmark-popup-save', r),
  delete:  ()   => ipcRenderer.invoke('bookmark-popup-delete'),
  close:   ()   => ipcRenderer.invoke('bookmark-popup-close'),
  // Adres çubuğu öneri listesi (suggest-popup.js): içerik gelir, seçilen adres geri gider.
  onSuggest: (cb) => ipcRenderer.on('suggest-data', (_, d) => cb(d)),
  pick:      (url) => ipcRenderer.send('suggest-pick', url),
});
