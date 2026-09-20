/**
 * İlgezdi — Ülgen çeviri motoru sınaması (AĞA ÇIKMAZ)
 *
 * Çalıştır:  node test/ceviri.js
 *
 * Burada ölçülenler, gerçek modelle yapılan hız/kalite ölçümünden AYRI:
 * bunlar motorun KAPI davranışları — izin, dil tanıma, indirme doğrulaması,
 * tek seferlik indirme, paket yokken susmak. Sahte `electron` ve sahte ağ
 * kullanılır; gerçek dosya indirilmez, worker açılmaz.
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const Module = require('node:module');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ilgezdi-ceviri-'));
const istekler = [];
let yanitla = null;

const fakeElectron = {
  app: { getPath: () => TMP, getVersion: () => '0.0.0-test', isPackaged: false },
  session: { fromPartition: () => ({ fetch: async (url) => { istekler.push(String(url)); return yanitla(String(url)); } }) },
  ipcMain: { handle: () => {}, on: () => {} },
  net: {},
};
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return fakeElectron;
  return origLoad.apply(this, arguments);
};

const ceviri = require('../src/main/ulgen-ceviri');

let gecen = 0, kalan = 0;
const ol = (ad, kosul, ayrinti) => {
  if (kosul) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${ayrinti ? '  ' + ayrinti : ''}`); }
};
const baslik = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

/* Gerçek 16 MB'lık paket yerine küçük sahte dosyalar: kapı davranışını
   ölçüyoruz, modelin kendisini değil. */
const sahteDosya = (ad, uzak, govde) => {
  const gz = zlib.gzipSync(Buffer.from(govde));
  return { ad, uzak, bayt: gz.length, sha256: crypto.createHash('sha256').update(gz).digest('hex'), _gz: gz };
};
const MOTOR = sahteDosya('bergamot-translator-worker.wasm', 'motor/bergamot-translator-worker.wasm.gz', 'WASM-SAHTE');
const MODEL = sahteDosya('model.bin', 'en-tr/model.entr.intgemm.alphas.bin.gz', 'MODEL-SAHTE');
const LEX = sahteDosya('lex.bin', 'en-tr/lex.50.50.entr.s2t.bin.gz', 'LEX-SAHTE');
const VOCAB = sahteDosya('vocab.spm', 'en-tr/vocab.entr.spm.gz', 'VOCAB-SAHTE');
const hepsi = [MOTOR, MODEL, LEX, VOCAB];

const gercekPaketler = JSON.parse(JSON.stringify(ceviri.PAKETLER));
ceviri.PAKETLER.motor = [MOTOR];
ceviri.PAKETLER['en-tr'] = [MODEL, LEX, VOCAB];

const yanit = (govde, durum = 200) => ({ ok: durum >= 200 && durum < 300, status: durum,
  arrayBuffer: async () => govde.buffer.slice(govde.byteOffset, govde.byteOffset + govde.byteLength) });
const duzgun = (url) => {
  const d = hepsi.find((x) => url.endsWith(x.uzak));
  return d ? yanit(d._gz) : yanit(Buffer.from(''), 404);
};
const temizle = () => fs.rmSync(path.join(TMP, 'ulgen-ceviri'), { recursive: true, force: true });

(async () => {
  baslik('Dil tanıma — emin değilse SUSAR');
  ol('İngilizce metin tanınıyor', ceviri.dilBul(
    'The central bank raised its benchmark interest rate on Thursday, citing inflation in the services sector of the economy.') === 'en');
  ol('Türkçe metin tanınıyor (çeviri gerekmez)', ceviri.dilBul(
    'Merkez bankası perşembe günü faiz oranını artırdı ve bu kararı hizmet sektöründeki enflasyona dayandırdı.') === 'tr');
  ol('kısa metinde iddia yok (null)', ceviri.dilBul('Hello world') === null);
  // ⚠️ Almanca ve Fransızca da ö/ü taşır; bunları Türkçe sanmak çeviriyi YANLIŞ
  //    yönde yapardı (Türkçe sayfayı Türkçeye çevirmeye kalkmak gibi).
  ol('Almanca Türkçe sanılmıyor', ceviri.dilBul(
    'Die Zentralbank erhöhte den Leitzins am Donnerstag und verwies dabei auf die Inflation im Dienstleistungssektor.') === null);
  ol('Fransızca Türkçe sanılmıyor', ceviri.dilBul(
    "La banque centrale a relevé son taux directeur jeudi en évoquant l'inflation persistante dans le secteur des services.") === null);

  baslik('Durum — paket yokken dürüst');
  temizle();
  ol("paket yokken 'paket_yok'", ceviri.durum('en', 'tr') === 'paket_yok');
  ol("desteklenmeyen çift 'desteklenmiyor'", ceviri.durum('de', 'tr') === 'desteklenmiyor');
  const bos = await ceviri.cevir(['Hello.'], { kaynakDil: 'en', hedefDil: 'tr' });
  ol('paket yokken çeviri denenmiyor, durum aktarılıyor', bos.durum === 'paket_yok' && bos.cumleler.length === 0, JSON.stringify(bos));

  baslik('İndirme — doğrulama olmadan hiçbir şey kurulmaz');
  const n0 = istekler.length;
  yanitla = (url) => (url.endsWith(MODEL.uzak) ? yanit(zlib.gzipSync(Buffer.from('KOTU-ICERIK'))) : duzgun(url));
  let r = await ceviri.paketIndir('en', 'tr', () => {});
  ol('özet tutmazsa indirme REDDEDİLİYOR', r.ok === false && r.hata === 'ozet_tutmadi', JSON.stringify(r));
  ol('yarım paket "kurulu" sayılmıyor', ceviri.durum('en', 'tr') === 'paket_yok');
  ol('⛔ istekler yalnız ilgezdi.com.tr/ceviri altına gitti',
    istekler.slice(n0).every((u) => u.startsWith(ceviri.TABAN + '/')), istekler.slice(n0).join(' '));

  temizle();
  yanitla = (url) => (url.endsWith(LEX.uzak) ? yanit(Buffer.concat([LEX._gz, Buffer.from('fazla')])) : duzgun(url));
  r = await ceviri.paketIndir('en', 'tr', () => {});
  ol('beklenen boy tutmazsa reddediliyor', r.ok === false && r.hata === 'boy_tutmadi', JSON.stringify(r));

  temizle();
  yanitla = (url) => (url.endsWith(VOCAB.uzak) ? yanit(Buffer.from(''), 503) : duzgun(url));
  r = await ceviri.paketIndir('en', 'tr', () => {});
  ol('sunucu hatası kullanıcıya dürüstçe dönüyor', r.ok === false && r.hata === 'http_503', JSON.stringify(r));

  baslik('İndirme — başarılı yol');
  temizle();
  yanitla = duzgun;
  const olaylar = [];
  r = await ceviri.paketIndir('en', 'tr', (d) => olaylar.push(d));
  ol('paket kuruldu', r.ok === true && r.durum === 'indi', JSON.stringify(r));
  ol("durum artık 'hazir'", ceviri.durum('en', 'tr') === 'hazir');
  ol('dosyalar AÇILMIŞ hâlde yazıldı (gz değil)',
    fs.readFileSync(path.join(TMP, 'ulgen-ceviri', 'en-tr', 'model.bin'), 'utf8') === 'MODEL-SAHTE');
  ol('yarım dosya artığı kalmadı (.yeni yok)',
    !fs.readdirSync(path.join(TMP, 'ulgen-ceviri', 'en-tr')).some((f) => f.endsWith('.yeni')));
  ol('ilerleme bildirildi: iniyor… → indi',
    olaylar.length >= 2 && olaylar[0].durum === 'iniyor' && olaylar[olaylar.length - 1].durum === 'indi'
    && olaylar[olaylar.length - 1].yuzde === 100, JSON.stringify(olaylar.map((x) => x.durum + ':' + x.yuzde)));

  baslik('Tek seferlik indirme + yeniden indirmeme');
  temizle();
  const n1 = istekler.length;
  const [a, b] = await Promise.all([ceviri.paketIndir('en', 'tr', () => {}), ceviri.paketIndir('en', 'tr', () => {})]);
  ol('iki eşzamanlı çağrı TEK indirme yapıyor', istekler.length - n1 === hepsi.length && a.ok && b.ok,
    `${istekler.length - n1} istek`);
  const n2 = istekler.length;
  await ceviri.paketIndir('en', 'tr', () => {});
  ol('kurulu paket tekrar indirilmiyor', istekler.length === n2);

  baslik('Desteklenmeyen çift');
  r = await ceviri.paketIndir('de', 'tr', () => {});
  ol('indirme reddediliyor, ağa çıkılmıyor', r.ok === false && r.hata === 'desteklenmiyor');

  baslik('Ana süreç bağlantısı (kaynak metni)');
  const kok = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(kok, 'src', 'main', 'main.js'), 'utf8');
  const pre = fs.readFileSync(path.join(kok, 'src', 'preload', 'preload.js'), 'utf8');
  ol("özet isteği hedefDil taşıyor ve çeviri yanıta ekleniyor",
    /hedefDil.*istek\?\.hedefDil/s.test(main) && main.includes('yanit.ceviri = await ulgenOzetCevir('));
  ol('çeviri izni (ulgenTranslate) motor tarafında denetleniyor',
    main.includes("ulgenIzin('ulgenTranslate')") && main.includes("durum: 'kapali'"));
  ol('paket indirme yalnız eylemle başlıyor', main.includes("eylem?.tur === 'ceviriPaketi'"));
  ol('ilerleme olayı pencereye gönderiliyor', main.includes("send('ulgen-ceviri-durum'"));
  ol('köprüde abonelik var ve bırakma işlevi dönüyor',
    pre.includes('onCeviriDurum:') && /ipcRenderer\.off\('ulgen-ceviri-durum'/.test(pre));
  ol('⛔ motor modülünde uzak çeviri API adresi YOK',
    !/api\.|translate\.google|deepl|riva|8765/i.test(fs.readFileSync(path.join(kok, 'src', 'main', 'ulgen-ceviri.js'), 'utf8')
      .replace(/^\s*\*.*$/gm, '')));

  Object.assign(ceviri.PAKETLER, gercekPaketler);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
  process.exit(kalan ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
