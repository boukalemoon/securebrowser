/**
 * İlgezdi — Ana Ülgen görev kanalı sınaması (Katman 2). AĞA ÇIKMAZ.
 *
 * Çalıştır:  node test/gorev.js
 *
 * Ölçülenler: izin kapalıyken susmak, gizli pencerede iş almamak, jetonun
 * şifreli saklanması (kasa yoksa HİÇ saklamamak), temiz oturum ve iş sonrası
 * temizlik, yalnız METİN dönmesi, 401'de bağın kopması.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ilgezdi-gorev-'));
let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d ? '  ' + d : ''}`); }
};
const baslik = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

/* ── Sahte Electron ─────────────────────────────────────────────────────── */
const kayit = { pencereler: [], temizlendi: 0, izinRed: 0, acilanAdres: [], oturumAdlari: [] };
let sayfaCevabi = { title: 'Örnek Başlık', nodes: [['p', {}, ['Bu sayfa metni yeterince uzun bir cümledir ve ayıklanmalıdır.']]] };

class SahtePencere {
  constructor(opt) {
    kayit.pencereler.push(opt);
    this.yikildi = false;
    this.webContents = {
      loadURL: async (u) => { kayit.acilanAdres.push(u); },
      executeJavaScriptInIsolatedWorld: async () => sayfaCevabi,
      getURL: () => kayit.acilanAdres[kayit.acilanAdres.length - 1] || '',
      setWindowOpenHandler: () => {},
    };
  }
  destroy() { this.yikildi = true; }
}

const fakeElectron = {
  app: { getPath: () => TMP, getVersion: () => '0.8.6-test', whenReady: async () => {}, on: () => {} },
  BrowserWindow: SahtePencere,
  session: {
    fromPartition: (ad) => {
      kayit.oturumAdlari.push(ad);
      return {
        setPermissionRequestHandler: (fn) => { fn(null, 'geolocation', (izin) => { if (!izin) kayit.izinRed++; }); },
        on: () => {},
        clearStorageData: async () => { kayit.temizlendi++; },
        clearCache: async () => {},
      };
    },
  },
  ipcMain: { handle: () => {}, on: () => {} },
  net: {},
};

/* ── Sahte kasa ─────────────────────────────────────────────────────────── */
const kasa = { acik: true, yazilan: null };
const fakeCrypto = {
  isAvailable: async () => kasa.acik,
  encryptText: async (t) => { kasa.yazilan = t; return Buffer.from('sifreli:' + t, 'utf8'); },
  decryptBuffer: async (b) => ({ text: String(b).replace(/^sifreli:/, '') }),
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'electron') return fakeElectron;
  if (request === './os-crypto' && parent && parent.filename.includes('ulgen-gorev')) return fakeCrypto;
  return origLoad.apply(this, arguments);
};

/* ── Sahte ağ ───────────────────────────────────────────────────────────── */
const agKaydi = [];
let agCevabi = null;
global.fetch = async (url, opt = {}) => {
  agKaydi.push({ url: String(url), opt, govde: opt.body ? JSON.parse(opt.body) : null });
  return agCevabi(String(url), opt);
};
const json = (obj, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => obj });

const gorev = require('../src/main/ulgen-gorev');

(async () => {
  baslik('1. Eşleşme — kullanıcı kodu olmadan bağ yok');
  agCevabi = () => json({ ok: true, jeton: 'JETON-123456789012345678901234567890' });
  ol('kod biçimi denetleniyor', (await gorev.esles('12')).sebep === 'kod_bicimi');
  kasa.acik = false;
  let r = await gorev.esles('123456');
  // ⛔ Jetonu düz metin saklamaktansa HİÇ saklamamak: kasa yoksa eşleşme kurulmaz.
  ol('⛔ işletim sistemi kasası yoksa eşleşme KURULMUYOR', r.ok === false && r.sebep === 'kasa_yok', JSON.stringify(r));
  kasa.acik = true;
  r = await gorev.esles('123456');
  ol('doğru kodla eşleşiyor', r.ok === true, JSON.stringify(r));
  ol('jeton ŞİFRELİ yazıldı', kasa.yazilan === 'JETON-123456789012345678901234567890'
    && fs.readFileSync(path.join(TMP, 'ulgen-gorev.bin'), 'utf8').startsWith('sifreli:'));
  ol('eşleşme isteği cihaz adını taşıyor, sayfa verisi taşımıyor',
    agKaydi[agKaydi.length - 1].govde.cihaz.includes('İlgezdi') && !('url' in agKaydi[agKaydi.length - 1].govde));

  baslik("2. Sayfa getirme — İLGEZDİ'nin korumalı yolundan");
  // ⛔ Bu modül kendi penceresini AÇMAZ: korumalar (parmak izi kalkanı, GPC,
  //    engelleyici, tehdit listesi, sertifika denetimi) sekme yolunda kurulu.
  const kodMetni = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'ulgen-gorev.js'), 'utf8');
  ol('⛔ modül kendi BrowserWindow/oturumunu AÇMIYOR',
    !/new BrowserWindow|session\.fromPartition/.test(kodMetni));
  let yolSonuc = { ok: false, sebep: 'yol_yok' };
  ol('yol bağlanmadan görev reddediliyor (sessiz düşüş yok)',
    (await gorev.sayfaMetni('https://ornek.example/x')).sebep === 'sayfa_yolu_yok');
  const istenen = [];
  gorev.kur({ sayfaGetir: async (u) => { istenen.push(u); return yolSonuc; } });
  yolSonuc = { ok: true, metin: 'A'.repeat(300000), baslik: 'B'.repeat(500),
               url: 'https://ornek.example/haber', html: '<b>gizli</b>', cerez: 'x=1' };
  const s = await gorev.sayfaMetni('https://ornek.example/haber');
  ol("sayfa İlgezdi'nin yolundan isteniyor", istenen[0] === 'https://ornek.example/haber');
  ol('metin ve başlık sınırlanıyor', s.metin.length === 200000 && s.baslik.length === 300);
  // ⛔ Yol fazladan alan döndürse bile Ülgen'e YALNIZ metin gider.
  ol('⛔ yalnız metin/başlık/adres taşınıyor (html, çerez düşüyor)',
    Object.keys(s).sort().join(',') === 'baslik,kirpildi,metin,ok,url', Object.keys(s).join(','));
  // Yarım metni TAM sanmak araştırmayı sessizce yanlış sonuca götürürdü.
  ol('kırpılan metin AÇIKÇA işaretleniyor', s.kirpildi === true);
  yolSonuc = { ok: false, sebep: 'tehdit_listesi' };
  ol('yolun reddi olduğu gibi aktarılıyor', (await gorev.sayfaMetni('https://kotu.example')).sebep === 'tehdit_listesi');

  baslik('3. İzin ve gizli pencere — iş alınmıyor');
  let izin = false, gizli = false;
  gorev.kur({ izin: () => izin, gizli: () => gizli });
  const n0 = agKaydi.length;
  gorev.baslat();
  await new Promise((r2) => setTimeout(r2, 300));
  ol('⛔ izin kapalıyken Ülgen\'e HİÇ istek gitmiyor', agKaydi.length === n0, `${agKaydi.length - n0} istek`);
  izin = true; gizli = true;
  await new Promise((r2) => setTimeout(r2, 300));
  ol('⛔ gizli pencere açıkken iş alınmıyor', agKaydi.length === n0, `${agKaydi.length - n0} istek`);
  gorev.dur();

  baslik('4. Kaynak metni — yön ve kapı kuralları');
  const kod = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'ulgen-gorev.js'), 'utf8');
  ol('⛔ İlgezdi sunucu AÇMIYOR (dinleyen uç yok)',
    !/createServer|\.listen\(|express/.test(kod));
  ol('bağlantıyı İlgezdi açıyor (Ülgen\'e uzun yoklama)', kod.includes('/api/ilgezdi/gorev?bekle='));
  ol('her istek jeton taşıyor', (kod.match(/X-Ilgezdi-Jeton/g) || []).length >= 2);
  ol('401 alınca bağ koparılıyor (jeton siliniyor)', /status === 401[^\n]*jetonSil\(\)/.test(kod));
  ol('adres biçimi ayrıca denetleniyor', kod.includes("/^https?:\\/\\//i.test(is_.url"));
  ol('Ülgen kapalıysa boşuna dönmüyor (bekleme var)', kod.includes('HATA_BEKLEME_MS'));

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
  process.exit(kalan ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
