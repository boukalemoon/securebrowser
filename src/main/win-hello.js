/**
 * İlgezdi — Windows Hello doğrulaması (kasa kilidi için isteğe bağlı hızlı yol)
 *
 * Ne yapar: "bu oturumdaki kullanıcı mı?" sorusunu Windows'un YEREL doğrulama
 * servisine sorar (yüz, parmak izi ya da PIN). Biyometrik şablon cihazdan çıkmaz,
 * Microsoft hesabı ya da internet gerekmez, yerel hesap + PIN yeterlidir. Bu
 * modülün ve çağırdığı yardımcının hiçbir ağ çağrısı yoktur.
 *
 * Ne YAPMAZ: kasanın şifrelemesi Hello'ya BAĞLANMAZ. Hello yalnızca bir kapıdır;
 * cihaz değişir, Hello kapatılır ya da kurum ilkesi engellerse kullanıcı kendi
 * koduyla girmeye devam eder. Aksi tasarımda Hello'nun bozulması kayıtlı
 * şifreleri kalıcı olarak erişilemez yapardı.
 *
 * Yardımcı: build/win-hello/IlgezdiHello.cs — derleme sırasında .NET Framework'ün
 * csc.exe'siyle üretilir (scripts/build-win-hello.js). Yerel npm modülü yok.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');
const { log: diag } = require('./diagnostics');

// IlgezdiHello.exe çıkış kodları — Windows'un kendi sabitleri.
const UYGUNLUK = { 0: 'var', 1: 'aygit_yok', 2: 'kurulu_degil', 3: 'ilke_engelli', 4: 'mesgul' };
const SONUC    = { 0: 'dogrulandi', 1: 'aygit_yok', 2: 'kurulu_degil', 3: 'ilke_engelli', 4: 'mesgul', 5: 'deneme_bitti', 6: 'iptal' };
const HATA     = { 90: 'hata', 91: 'zaman_asimi', 92: 'kullanim' };

const CHECK_TIMEOUT_MS  = 10 * 1000;
const VERIFY_TIMEOUT_MS = 125 * 1000;   // yardımcı 120 sn'de kendi kendine biter
const ONBELLEK_MS       = 60 * 1000;    // kullanıcı arada Hello'yu kurabilir

let yolOnbellek;
let uygunlukOnbellek = null;   // { deger, zaman }

/** Yardımcının yolu: paketliyse resources/win-hello, geliştirmede build/win-hello. */
function yardimciYolu() {
  if (yolOnbellek !== undefined) return yolOnbellek;
  if (process.platform !== 'win32') return (yolOnbellek = null);
  const adaylar = [
    path.join(process.resourcesPath || '', 'win-hello', 'IlgezdiHello.exe'),
    path.join(__dirname, '..', '..', 'build', 'win-hello', 'IlgezdiHello.exe'),
  ];
  yolOnbellek = adaylar.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
  return yolOnbellek;
}

function calistir(args, timeout) {
  const exe = yardimciYolu();
  if (!exe) return Promise.resolve({ kod: null, cikis: -1 });
  return new Promise((resolve) => {
    execFile(exe, args, { timeout, windowsHide: true, maxBuffer: 64 * 1024 }, (err, _out, stderr) => {
      // Yardımcı sonucu ÇIKIŞ KODUYLA bildirir; execFile bunu "hata" sayar.
      const cikis = err && typeof err.code === 'number' ? err.code : (err ? -1 : 0);
      if (stderr && String(stderr).trim()) diag.warn('hello', 'Yardımcı uyarısı', { detay: String(stderr).trim().slice(0, 200) });
      resolve({ cikis });
    });
  });
}

/** Windows Hello bu cihazda kullanılabilir mi? Windows dışında her zaman false. */
async function uygunMu() {
  if (process.platform !== 'win32' || !yardimciYolu()) return { uygun: false, neden: 'desteklenmiyor' };
  const simdi = Date.now();
  if (uygunlukOnbellek && simdi - uygunlukOnbellek.zaman < ONBELLEK_MS) return uygunlukOnbellek.deger;
  const { cikis } = await calistir(['check'], CHECK_TIMEOUT_MS);
  const neden = UYGUNLUK[cikis] || HATA[cikis] || 'hata';
  const deger = { uygun: cikis === 0, neden };
  uygunlukOnbellek = { deger, zaman: simdi };
  return deger;
}

/**
 * Hello penceresini açar ve sonucu döndürür. YALNIZCA 'dogrulandi' kabul edilir;
 * iptal, deneme bitti ya da herhangi bir hata kullanıcıyı koda düşürür.
 */
async function dogrula(mesaj) {
  if (process.platform !== 'win32' || !yardimciYolu()) return { ok: false, neden: 'desteklenmiyor' };
  // Hello penceresi uygulamanın üstünde açılsın.
  try { app.focus({ steal: true }); } catch {}
  const { cikis } = await calistir(['verify', String(mesaj || 'İlgezdi').slice(0, 200)], VERIFY_TIMEOUT_MS);
  const neden = SONUC[cikis] || HATA[cikis] || 'hata';
  if (cikis !== 0) diag.info('hello', 'Doğrulama tamamlanmadı', { neden });
  return { ok: cikis === 0, neden };
}

/** Test ve tanılama için: yardımcı paketlenmiş mi? */
function kurulu() { return !!yardimciYolu(); }

module.exports = { uygunMu, dogrula, kurulu, UYGUNLUK, SONUC, _sifirlaOnbellek: () => { uygunlukOnbellek = null; yolOnbellek = undefined; } };
