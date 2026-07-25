/**
 * İlgezdi — Yer İmi İçe Aktarma (ana süreç)
 *
 * İki kaynak:
 *   1) Kurulu Chromium tabanlı tarayıcıların Bookmarks (JSON) dosyasını
 *      otomatik algılayıp doğrudan okur (Chrome, Edge, Brave, Vivaldi, Opera).
 *   2) Herhangi bir tarayıcıdan dışa aktarılmış Netscape HTML dosyası
 *      (Firefox, Safari dahil hepsi bu formatı destekler).
 *
 * Yalnızca yer imleri okunur; şifre/oturum gibi hassas veriye DOKUNULMAZ.
 * Sonuç renderer'a { items:[{title,url,folder}] } olarak döner; birleştirme
 * (dedupe + İlgezdi yer imlerine ekleme) renderer tarafında yapılır.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { dialog } = require('electron');

const HOME        = os.homedir();
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const APPDATA      = process.env.APPDATA      || path.join(HOME, 'AppData', 'Roaming');

function chromiumSources() {
  if (process.platform === 'win32') {
    return [
      { id:'chrome',  name:'Google Chrome',  file: path.join(LOCALAPPDATA,'Google','Chrome','User Data','Default','Bookmarks') },
      { id:'edge',    name:'Microsoft Edge',  file: path.join(LOCALAPPDATA,'Microsoft','Edge','User Data','Default','Bookmarks') },
      { id:'brave',   name:'Brave',           file: path.join(LOCALAPPDATA,'BraveSoftware','Brave-Browser','User Data','Default','Bookmarks') },
      { id:'vivaldi', name:'Vivaldi',         file: path.join(LOCALAPPDATA,'Vivaldi','User Data','Default','Bookmarks') },
      { id:'opera',   name:'Opera',           file: path.join(APPDATA,'Opera Software','Opera Stable','Bookmarks') },
    ];
  }
  if (process.platform === 'darwin') {
    const AS = path.join(HOME,'Library','Application Support');
    return [
      { id:'chrome', name:'Google Chrome', file: path.join(AS,'Google','Chrome','Default','Bookmarks') },
      { id:'edge',   name:'Microsoft Edge', file: path.join(AS,'Microsoft Edge','Default','Bookmarks') },
      { id:'brave',  name:'Brave',          file: path.join(AS,'BraveSoftware','Brave-Browser','Default','Bookmarks') },
    ];
  }
  const CFG = path.join(HOME,'.config');
  return [
    { id:'chrome',   name:'Google Chrome', file: path.join(CFG,'google-chrome','Default','Bookmarks') },
    { id:'chromium', name:'Chromium',      file: path.join(CFG,'chromium','Default','Bookmarks') },
    { id:'brave',    name:'Brave',         file: path.join(CFG,'BraveSoftware','Brave-Browser','Default','Bookmarks') },
  ];
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'");
}

// ── Chromium Bookmarks JSON → düz item listesi (klasör adıyla) ──
function parseChromium(json) {
  const items = [];
  const roots = (json && json.roots) || {};
  const walk = (node, folderName) => {
    if (!node) return;
    if (node.type === 'url' && node.url && /^https?:\/\//i.test(node.url)) {
      items.push({ title: node.name || node.url, url: node.url, folder: folderName });
    }
    if (Array.isArray(node.children)) {
      const fname = node.type === 'folder' && node.name ? node.name : folderName;
      node.children.forEach((c) => walk(c, fname));
    }
  };
  const TOP = { bookmark_bar:'Yer İmi Çubuğu', other:'Diğer Yer İmleri', synced:'Senkronize' };
  Object.keys(TOP).forEach((k) => {
    const r = roots[k];
    if (r) (r.children || []).forEach((c) => walk(c, r.name || TOP[k]));
  });
  return items;
}

// ── Netscape HTML dışa aktarım → düz item listesi (klasör yığınıyla) ──
function parseNetscape(html) {
  const items = [];
  const stack = [];
  let pending = null;
  const re = /<DL>|<\/DL>|<H3[^>]*>([\s\S]*?)<\/H3>|<A\s[^>]*HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (/^<DL>/i.test(tok)) {
      stack.push(pending || (stack.length ? stack[stack.length - 1] : 'İçe Aktarılan'));
      pending = null;
    } else if (/^<\/DL>/i.test(tok)) {
      stack.pop();
    } else if (m[1] !== undefined) { // <H3> klasör
      pending = decodeHtml(m[1].trim()) || 'İçe Aktarılan';
    } else if (m[2]) {               // <A HREF> bağlantı
      const url = m[2];
      if (/^https?:\/\//i.test(url)) {
        items.push({
          url,
          title: decodeHtml((m[3] || '').trim()) || url,
          folder: stack[stack.length - 1] || 'İçe Aktarılan',
        });
      }
    }
  }
  return items;
}

function detect() {
  return chromiumSources()
    .map((s) => {
      try {
        if (!fs.existsSync(s.file)) return null;
        const json = JSON.parse(fs.readFileSync(s.file, 'utf8'));
        const count = parseChromium(json).length;
        return count > 0 ? { id: s.id, name: s.name, count } : null;
      } catch { return null; }
    })
    .filter(Boolean);
}

function importBrowser(id) {
  const src = chromiumSources().find((s) => s.id === id);
  if (!src || !fs.existsSync(src.file)) return { items: [], error: 'not_found' };
  try {
    const json = JSON.parse(fs.readFileSync(src.file, 'utf8'));
    return { items: parseChromium(json) };
  } catch (e) {
    return { items: [], error: e.message };
  }
}

async function importFile(win) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Yer imi dosyası seçin (tarayıcıdan dışa aktarılan HTML)',
    filters: [{ name: 'Yer imleri', extensions: ['html', 'htm'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return { items: [] };
  try {
    const html = fs.readFileSync(r.filePaths[0], 'utf8');
    return { items: parseNetscape(html) };
  } catch (e) {
    return { items: [], error: e.message };
  }
}

function setupBookmarkImport(ipcMain, getWindow) {
  ipcMain.handle('bm-import-detect',  () => detect());
  ipcMain.handle('bm-import-browser', (e, id) => importBrowser(id));
  ipcMain.handle('bm-import-file',    () => importFile(getWindow()));
}

module.exports = { setupBookmarkImport };
