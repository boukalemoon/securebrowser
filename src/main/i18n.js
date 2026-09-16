/**
 * İlgezdi — ana süreç dil yükleyicisi.
 *
 * Dil açılışta bir kez seçilir (Ayarlar › Genel › Dil; "auto" = sistem dili) ve yeniden
 * başlatınca değişir. Arayüz pencereleri aynı paketi ön yüklemede eşzamanlı alır
 * ('i18n-bundle'). Electron'a bağımlı değildir: saf modüller (sağ tık menüsü, hata
 * sayfaları) de buradan T alır; testlerde başlatılmadan Türkçe çalışır.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../renderer/i18n.js');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const cache = new Map();

function readMessages(code) {
  if (cache.has(code)) return cache.get(code);
  let messages = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, code + '.json'), 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) messages = parsed;
  } catch (e) { messages = {}; }
  cache.set(code, messages);
  return messages;
}

let state = null;

function init(setting, systemLanguages) {
  const locale = core.resolveLanguage(setting, systemLanguages);
  const source = readMessages(core.SOURCE_LANGUAGE);
  const messages = locale === core.SOURCE_LANGUAGE ? source : readMessages(locale);
  state = { locale, source, messages, translator: core.createTranslator(locale, messages, source) };
  return state.translator;
}

function current() {
  if (!state) init(core.SOURCE_LANGUAGE, []);
  return state;
}

function T(key, params) { return current().translator.T(key, params); }
function TH(key, params, html) { return current().translator.TH(key, params, html); }

/** Arayüze giden paket: eksik anahtarlar Türkçeyle doldurulmuş tek sözlük. */
function bundle() {
  const s = current();
  return { locale: s.locale, intl: s.translator.intl, messages: { ...s.source, ...s.messages } };
}

module.exports = { init, T, TH, bundle, locale: () => current().locale, intl: () => current().translator.intl, readMessages, LANGUAGES: core.LANGUAGES };
