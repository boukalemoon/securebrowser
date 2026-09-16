#!/usr/bin/env node
/**
 * build/installer-lang/messages.json → build/installer-lang/messages.nsh
 *
 * Kurulum sihirbazının electron-builder mesajları (messages.yml, assistedMessages.yml) ve
 * İlgezdi'nin kendi metinleri için NSIS LangString satırları üretir. İngilizce mesajları
 * electron-builder kendisi yazar (installerLanguages: en_US); burada yalnızca diğer dillerle
 * İngilizce uygulama metinleri bulunur. Aynı dil için iki kez LangString NSIS'te uyarıdır ve
 * electron-builder uyarıları hata sayar (-WX).
 *
 * Kullanım: node scripts/build-installer-messages.js [--check]
 *   --check: dosya güncel değilse 1 ile çıkar (test/run.js kullanır).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'build', 'installer-lang');
// Kurulum dilleri ve Windows dil kimlikleri (src/renderer/i18n.js LANGUAGES ile aynı).
const LCID = { tr: 1055, en: 1033, az: 1068, kk: 1087, uz: 1091, tk: 1090, ky: 1088, de: 1031, fr: 1036 };
// İngilizcesini electron-builder'ın ürettiği anahtarlar; İngilizce için burada yazılmaz.
const APP_KEYS = ['ilgezdiAppDescription', 'ilgezdiUrlName'];

/** NSIS çift tırnaklı dizesi: ${PRODUCT_NAME} derleme sabiti olarak kalır, diğer $ kaçışlanır. */
function nsisString(text) {
  return String(text)
    .replace(/\$(?!\{PRODUCT_NAME\})/g, '$$$$')
    .replace(/"/g, '$\\"')
    .replace(/\r?\n/g, '$\\r$\\n');
}

function render(messages) {
  const lines = [
    '; OTOMATİK ÜRETİLDİ — elle düzenlemeyin.',
    '; Kaynak: build/installer-lang/messages.json → node scripts/build-installer-messages.js',
    '',
  ];
  for (const [code, table] of Object.entries(messages)) {
    const id = LCID[code];
    if (!id) throw new Error('bilinmeyen dil: ' + code);
    lines.push('; ' + code + ' (' + id + ')');
    for (const [key, text] of Object.entries(table)) {
      if (code === 'en' && !APP_KEYS.includes(key)) throw new Error('İngilizce yalnızca uygulama metinleri: ' + key);
      if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error('geçersiz anahtar: ' + key);
      lines.push('LangString ' + key + ' ' + id + ' "' + nsisString(text) + '"');
    }
    lines.push('');
  }
  return lines.join('\r\n');
}

function main() {
  const messages = JSON.parse(fs.readFileSync(path.join(DIR, 'messages.json'), 'utf8'));
  // UTF-8 BOM: NSIS Türkçe/Kiril karakterleri ancak böyle doğru okur.
  const output = '﻿' + render(messages);
  const target = path.join(DIR, 'messages.nsh');
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== output) { console.error('messages.nsh güncel değil: node scripts/build-installer-messages.js'); process.exit(1); }
    return;
  }
  fs.writeFileSync(target, output, 'utf8');
  console.log('yazıldı: ' + path.relative(process.cwd(), target));
}

if (require.main === module) main();
module.exports = { render, nsisString, LCID, APP_KEYS };
