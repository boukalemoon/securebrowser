/**
 * İlgezdi — Kasa kilidi (şifreleri görüntülemeden önce doğrulama)
 *
 * Neden: kasa diskte safeStorage ile şifreli duruyor ama uygulama açıkken
 * Ayarlar › Şifreler'i açan herkes kayıtlı parolaları göz simgesiyle okuyabiliyordu.
 * Bilgisayarı bir dakika bırakmak yetiyordu. Chrome ve Edge bu noktada işletim
 * sistemi hesabının şifresini ya da Windows Hello'yu sorar.
 *
 * Bizim tercihimiz: doğrulama TAMAMEN CİHAZDA yapılır. Kod hiçbir sunucuya
 * gitmez, ağ bağlantısı gerekmez, QRtım hesabı şart değildir. Kullanıcı isterse
 * kodu olarak QRtım şifresini seçebilir — o zaman da yalnızca özeti burada kalır,
 * dışarı bir istek gitmez (Burak, 20 Eyl 2026: doğrulanan veriler dışarı çıkmasın).
 *
 * Saklanan kayıt: scrypt(kod, tuz) özeti. Kodun kendisi hiçbir yerde durmaz, bu
 * yüzden geri alma yolu yoktur — kullanıcıya kurulumda açıkça söylenir.
 *
 * Bu modül SAF mantıktır (Electron'a bağlı değil): kayıt okuma/yazma ve saat
 * dışarıdan verilir, böylece test/run.js içinde doğrudan çalıştırılabilir.
 */

'use strict';

const crypto = require('crypto');

// scrypt parametreleri. N=32768 → yaklaşık 33 MB bellek, ~100 ms; kayıt zaten
// DPAPI ile şifreli olduğu için çevrimdışı deneme için önce işletim sistemi
// hesabı gerekir, üstüne bu maliyet biner.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

const MIN_UZUNLUK = 6;          // 4 haneli PIN çevrimdışı denemeye fazla açık
const ACIK_SURE_MS = 2 * 60 * 1000;  // açıldıktan sonra 2 dakika sormadan gösterir
const PANO_TEMIZLE_MS = 30 * 1000;   // panoya kopyalanan şifre 30 sn sonra silinir

// Yanlış denemede bekleme: 3. denemeden sonra başlar, her yanlışta iki katına
// çıkar, 15 dakikada durur. Sayaç kayda yazılır — uygulamayı kapatıp açmak
// beklemeyi sıfırlamasın.
const BEKLEME_MS = [0, 0, 0, 30e3, 60e3, 120e3, 240e3, 480e3, 900e3];

function beklemeSuresi(yanlis) {
  return BEKLEME_MS[Math.min(yanlis, BEKLEME_MS.length - 1)];
}

/** Türkçe klavye farklarında aynı kodun aynı özeti vermesi için birleştirilmiş biçim. */
function normalize(kod) {
  return String(kod == null ? '' : kod).normalize('NFC');
}

function ozetle(kod, tuz, params) {
  const p = params || SCRYPT;
  return crypto.scryptSync(normalize(kod), tuz, p.keylen, { N: p.N, r: p.r, p: p.p, maxmem: p.maxmem });
}

function esitMi(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {object} io
 * @param {() => (object|null)} io.read   kayıt okur (yoksa null)
 * @param {(kayit: object|null) => void} io.write  kaydı yazar (null → siler)
 * @param {() => number} [io.now]
 */
function createGate(io) {
  const now = io.now || (() => Date.now());
  let kayit;
  try { kayit = io.read() || null; } catch { kayit = null; }
  // Açık olma durumu yalnızca bellektedir: uygulama yeniden başlayınca kilitli.
  let acikSonu = 0;

  const kurulu = () => !!(kayit && kayit.ozet && kayit.tuz);
  const acikMi = () => kurulu() && acikSonu > now();

  function beklemeKalan() {
    if (!kurulu()) return 0;
    const bekle = beklemeSuresi(kayit.yanlis || 0);
    if (!bekle) return 0;
    return Math.max(0, (kayit.sonYanlisAt || 0) + bekle - now());
  }

  function yaz() {
    try { io.write(kayit); } catch { /* disk yazılamazsa kilit bellekte sürer */ }
  }

  return {
    MIN_UZUNLUK,
    ACIK_SURE_MS,
    PANO_TEMIZLE_MS,

    /** Arayüz için durum — özet ya da tuz DIŞARI VERİLMEZ. */
    durum() {
      return {
        kurulu: kurulu(),
        acik: acikMi(),
        yontem: kurulu() ? (kayit.yontem || 'kod') : 'yok',
        kalanMs: acikMi() ? acikSonu - now() : 0,
        beklemeMs: beklemeKalan(),
        yanlis: kurulu() ? (kayit.yanlis || 0) : 0,
        minUzunluk: MIN_UZUNLUK,
      };
    },

    /** Kilit kurulu değilse şifre göstermeye izin var (kullanıcı seçmemiş). */
    izinli() {
      return !kurulu() || acikMi();
    },

    kur(kod) {
      if (kurulu()) return { ok: false, kod: 'zaten_kurulu' };
      const k = normalize(kod);
      if (k.length < MIN_UZUNLUK) return { ok: false, kod: 'cok_kisa', minUzunluk: MIN_UZUNLUK };
      const tuz = crypto.randomBytes(16);
      kayit = {
        v: 1, yontem: 'kod',
        tuz: tuz.toString('base64'),
        ozet: ozetle(k, tuz).toString('base64'),
        params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen, maxmem: SCRYPT.maxmem },
        kurulduAt: now(), yanlis: 0, sonYanlisAt: 0,
      };
      yaz();
      acikSonu = now() + ACIK_SURE_MS;   // kuran kişi zaten doğrulanmış sayılır
      return { ok: true };
    },

    /** Kodu doğrular. Yanlışsa sayaç artar ve bekleme uzar. */
    ac(kod) {
      if (!kurulu()) return { ok: true };
      const bekle = beklemeKalan();
      if (bekle > 0) return { ok: false, kod: 'bekle', beklemeMs: bekle };
      const tuz = Buffer.from(kayit.tuz, 'base64');
      const dogru = esitMi(ozetle(kod, tuz, kayit.params), Buffer.from(kayit.ozet, 'base64'));
      if (!dogru) {
        kayit.yanlis = (kayit.yanlis || 0) + 1;
        kayit.sonYanlisAt = now();
        yaz();
        return { ok: false, kod: 'yanlis', beklemeMs: beklemeKalan(), yanlis: kayit.yanlis };
      }
      if (kayit.yanlis) { kayit.yanlis = 0; kayit.sonYanlisAt = 0; yaz(); }
      acikSonu = now() + ACIK_SURE_MS;
      return { ok: true };
    },

    /** Şifre gösterildikten sonra süreyi uzatmaz; yalnızca kalanı bildirir. */
    kilitle() { acikSonu = 0; return { ok: true }; },

    degistir(eski, yeni) {
      if (!kurulu()) return { ok: false, kod: 'kurulu_degil' };
      const a = this.ac(eski);
      if (!a.ok) return a;
      const k = normalize(yeni);
      if (k.length < MIN_UZUNLUK) return { ok: false, kod: 'cok_kisa', minUzunluk: MIN_UZUNLUK };
      const tuz = crypto.randomBytes(16);
      kayit.tuz = tuz.toString('base64');
      kayit.ozet = ozetle(k, tuz).toString('base64');
      kayit.params = { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen, maxmem: SCRYPT.maxmem };
      kayit.yanlis = 0; kayit.sonYanlisAt = 0;
      yaz();
      acikSonu = now() + ACIK_SURE_MS;
      return { ok: true };
    },

    /** Korumayı kaldırmak için de mevcut kod gerekir. */
    kaldir(kod) {
      if (!kurulu()) return { ok: true };
      const a = this.ac(kod);
      if (!a.ok) return a;
      kayit = null;
      acikSonu = 0;
      yaz();
      return { ok: true };
    },
  };
}

module.exports = { createGate, beklemeSuresi, MIN_UZUNLUK, ACIK_SURE_MS, PANO_TEMIZLE_MS, BEKLEME_MS, SCRYPT };
