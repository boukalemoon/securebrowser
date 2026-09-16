/**
 * İlgezdi — işletim sistemi anahtar kasası (safeStorage) için eşzamansız arayüz.
 *
 * Electron 44'te eşzamanlı isEncryptionAvailable / encryptString / decryptString kullanımdan
 * kaldırıldı ve Electron 46'da siliniyor (Chromium eşzamanlı OSCrypt arka ucunu kaldırıyor).
 * Eşzamansız yöntemler aynı anahtar kasasını (Windows DPAPI, macOS Anahtar Zinciri, Linux
 * Secret Service) kullanır: eşzamanlı API ile şifrelenmiş mevcut veriler decryptStringAsync
 * ile çözülür, kullanıcı verisi için dönüşüm gerekmez (Electron değişiklik notu).
 *
 * Eşzamansız yöntemler yalnızca uygulama hazır olduktan sonra çağrılabilir. safeStorage
 * yoksa (Node ile çalışan testler) şifreleme "kullanılamıyor" sayılır.
 */

'use strict';

const { T } = require('./i18n');

const { safeStorage } = require('electron');

function hasApi() {
  return !!(safeStorage && typeof safeStorage.isAsyncEncryptionAvailable === 'function');
}

/** Şifreleme kullanılabilir mi? Hata ya da API yoksa false. */
async function isAvailable() {
  if (!hasApi()) return false;
  try { return (await safeStorage.isAsyncEncryptionAvailable()) === true; } catch { return false; }
}

/** Metni şifreler → Buffer. Kullanılamıyorsa hata fırlatır. */
async function encryptText(text) {
  if (!hasApi()) throw new Error(T('osCrypto.unavailable'));
  return safeStorage.encryptStringAsync(String(text));
}

/**
 * Şifreli Buffer'ı çözer → { text, reencrypt }. reencrypt true ise işletim sistemi anahtarı
 * yenilenmiştir: veri yeni anahtarla yeniden şifrelenip yazılmalı. Çözülemezse hata fırlatır.
 */
async function decryptBuffer(buffer) {
  if (!hasApi()) throw new Error(T('osCrypto.unavailable'));
  const r = await safeStorage.decryptStringAsync(buffer);
  return { text: r.result, reencrypt: r.shouldReEncrypt === true };
}

module.exports = { isAvailable, encryptText, decryptBuffer };
