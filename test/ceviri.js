/**
 * İlgezdi — Ülgen çeviri motoru sınaması (AĞA ÇIKMAZ)
 *
 * Çalıştır:  node test/ceviri.js
 *
 * Burada ölçülenler, gerçek modelle yapılan hız/kalite ölçümünden AYRI:
 * motorun KAPI davranışları — izin, dil tanıma, indirme doğrulaması, yönlendirme
 * reddi, boy sınırı, geri alma, disk kurcalama, tek seferlik indirme, paket
 * yokken susmak. Sahte `electron` ve sahte ağ kullanılır; gerçek dosya
 * indirilmez, worker açılmaz.
 *
 * Bölüm 5-7, 20.09.2026 güvenlik denetiminin bulgularını kapatan sınamalardır.
 */
'use strict';

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
  session: { fromPartition: () => ({ fetch: async (url, opt) => { istekler.push({ url: String(url), opt }); return yanitla(String(url), opt); } }) },
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
const sahteDosya = (ad, uzak, govde, acikBoy) => {
  const acik = Buffer.from(govde);
  const gz = zlib.gzipSync(acik);
  return { ad, uzak, bayt: gz.length, acik: acikBoy ?? acik.length,
           sha256: crypto.createHash('sha256').update(gz).digest('hex'), _gz: gz };
};
const MOTOR = sahteDosya('bergamot-translator-worker.wasm', 'motor/bergamot-translator-worker.wasm.gz', 'WASM-SAHTE');
const MODEL = sahteDosya('model.bin', 'en-tr/model.entr.intgemm.alphas.bin.gz', 'MODEL-SAHTE');
const LEX = sahteDosya('lex.bin', 'en-tr/lex.50.50.entr.s2t.bin.gz', 'LEX-SAHTE');
const VOCAB = sahteDosya('vocab.spm', 'en-tr/vocab.entr.spm.gz', 'VOCAB-SAHTE');
const hepsi = [MOTOR, MODEL, LEX, VOCAB];

const gercekPaketler = JSON.parse(JSON.stringify(ceviri.PAKETLER));
ceviri.PAKETLER.motor = [MOTOR];
ceviri.PAKETLER['en-tr'] = [MODEL, LEX, VOCAB];

/* Sahte Response: başlık + akış (gövde parça parça verilir, iptal edilebilir). */
let govdeOkundu = false;
let iptalEdildi = false;
function yanit(govde, { durum = 200, url = null, uzunluk, parcaBoyu = 0 } = {}) {
  const len = uzunluk === undefined ? govde.length : uzunluk;
  return {
    ok: durum >= 200 && durum < 300, status: durum, url,
    headers: { get: (k) => (k.toLowerCase() === 'content-length' && len !== null ? String(len) : null) },
    body: {
      getReader() {
        let i = 0;
        const adim = parcaBoyu || govde.length || 1;
        return {
          read: async () => {
            govdeOkundu = true;
            if (i >= govde.length) return { done: true, value: undefined };
            const p = govde.subarray(i, i + adim); i += adim;
            return { done: false, value: new Uint8Array(p) };
          },
          cancel: async () => { iptalEdildi = true; },
        };
      },
    },
    arrayBuffer: async () => { govdeOkundu = true; return govde.buffer.slice(govde.byteOffset, govde.byteOffset + govde.byteLength); },
  };
}
const duzgun = (url) => {
  const d = hepsi.find((x) => url.endsWith(x.uzak));
  return d ? yanit(d._gz, { url: `${ceviri.TABAN}/${d.uzak}` }) : yanit(Buffer.from(''), { durum: 404 });
};
const temizle = () => fs.rmSync(path.join(TMP, 'ulgen-ceviri'), { recursive: true, force: true });
const kur = async () => { temizle(); yanitla = duzgun; return ceviri.paketIndir('en', 'tr', () => {}); };

(async () => {
  baslik('1. Dil tanıma — emin değilse SUSAR');
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

  baslik('2. Durum — paket yokken dürüst');
  temizle();
  ol("paket yokken 'paket_yok'", ceviri.durum('en', 'tr') === 'paket_yok');
  ol("desteklenmeyen çift 'desteklenmiyor'", ceviri.durum('de', 'tr') === 'desteklenmiyor');
  const bos = await ceviri.cevir(['Hello.'], { kaynakDil: 'en', hedefDil: 'tr' });
  ol('paket yokken çeviri denenmiyor, durum aktarılıyor', bos.durum === 'paket_yok' && bos.cumleler.length === 0, JSON.stringify(bos));

  baslik('3. İndirme — doğrulama olmadan hiçbir şey kurulmaz');
  const n0 = istekler.length;
  temizle();
  yanitla = (url) => (url.endsWith(MODEL.uzak) ? yanit(zlib.gzipSync(Buffer.from('KOTU-ICERIK')), { url: `${ceviri.TABAN}/${MODEL.uzak}`, uzunluk: MODEL.bayt }) : duzgun(url));
  let r = await ceviri.paketIndir('en', 'tr', () => {});
  ol('özet tutmazsa indirme REDDEDİLİYOR', r.ok === false && r.hata === 'ozet_tutmadi', JSON.stringify(r));
  ol('yarım paket "kurulu" sayılmıyor', ceviri.durum('en', 'tr') === 'paket_yok');
  ol('⛔ istekler yalnız ilgezdi.com.tr/ceviri altına gitti',
    istekler.slice(n0).every((x) => x.url.startsWith(ceviri.TABAN + '/')), istekler.slice(n0).map((x) => x.url).join(' '));

  temizle();
  yanitla = (url) => (url.endsWith(VOCAB.uzak) ? yanit(Buffer.from(''), { durum: 503 }) : duzgun(url));
  r = await ceviri.paketIndir('en', 'tr', () => {});
  ol('sunucu hatası kullanıcıya dürüstçe dönüyor', r.ok === false && r.hata === 'http_503', JSON.stringify(r));

  baslik('4. İndirme — başarılı yol');
  const olaylar = [];
  temizle();
  yanitla = duzgun;
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

  baslik('5. Boy sınırı — sunucu ne verirse versin ana süreç şişmez');
  temizle();
  govdeOkundu = false;
  yanitla = (url) => (url.endsWith(MOTOR.uzak)
    ? yanit(MOTOR._gz, { url: `${ceviri.TABAN}/${MOTOR.uzak}`, uzunluk: 900 * 1024 * 1024 }) : duzgun(url));
  r = await ceviri.paketIndir('en', 'tr', () => {});
  ol('bildirilen boy tutmazsa GÖVDE HİÇ OKUNMUYOR', r.hata === 'boy_tutmadi' && govdeOkundu === false, `${r.hata} okundu=${govdeOkundu}`);

  temizle();
  iptalEdildi = false;
  const kocaman = Buffer.alloc(MOTOR.bayt * 20, 7);
  yanitla = (url) => (url.endsWith(MOTOR.uzak)
    ? yanit(kocaman, { url: `${ceviri.TABAN}/${MOTOR.uzak}`, uzunluk: null, parcaBoyu: 4096 }) : duzgun(url));
  r = await ceviri.paketIndir('en', 'tr', () => {});
  ol('boy bildirilmezse AKIŞ beklenen boyda kesiliyor ve iptal ediliyor',
    r.hata === 'boy_tutmadi' && iptalEdildi === true, `${r.hata} iptal=${iptalEdildi}`);

  baslik('6. Yönlendirme — açık yönlendirme adresi üçüncü tarafa açardı');
  temizle();
  yanitla = (url) => (url.endsWith(VOCAB.uzak)
    ? yanit(VOCAB._gz, { url: 'https://kotu.example/toplayici/vocab.gz' }) : duzgun(url));
  r = await ceviri.paketIndir('en', 'tr', () => {});
  ol('başka alana yönlenen yanıt REDDEDİLİYOR', r.hata === 'yonlendirme', JSON.stringify(r));
  ol("istek redirect:'error' ile yapılıyor (izleme yok)",
    istekler[istekler.length - 1].opt?.redirect === 'error', JSON.stringify(istekler[istekler.length - 1].opt));

  baslik('7. Geri alma ve disk kurcalama');
  await kur();
  const eskiOzet = MODEL.sha256;
  MODEL.sha256 = 'a'.repeat(64);                    // kodda özet değişti (bozuk model geri alındı)
  ol('koddaki özet değişince kurulu paket "yok" sayılıyor', ceviri.durum('en', 'tr') === 'paket_yok');
  MODEL.sha256 = eskiOzet;
  ol('özet geri gelince paket yine hazır', ceviri.durum('en', 'tr') === 'hazir');

  fs.writeFileSync(path.join(TMP, 'ulgen-ceviri', 'en-tr', 'model.bin'), 'KURCALANMIS');
  const kurcali = await ceviri.cevir(['Hello there, this is a test sentence.'], { kaynakDil: 'en', hedefDil: 'tr' });
  ol('diskteki dosya değiştirilmişse motora VERİLMİYOR', kurcali.durum === 'hata' && kurcali.hata === 'dosya_bozuk', JSON.stringify(kurcali));

  baslik('8. Tek seferlik indirme + silme');
  temizle();
  yanitla = duzgun;
  const n1 = istekler.length;
  const [a, b] = await Promise.all([ceviri.paketIndir('en', 'tr', () => {}), ceviri.paketIndir('en', 'tr', () => {})]);
  ol('iki eşzamanlı çağrı TEK indirme yapıyor', istekler.length - n1 === hepsi.length && a.ok && b.ok, `${istekler.length - n1} istek`);
  const n2 = istekler.length;
  await ceviri.paketIndir('en', 'tr', () => {});
  ol('kurulu paket tekrar indirilmiyor', istekler.length === n2);
  ol('paketSil diskteki her şeyi siliyor',
    ceviri.paketSil() === true && !fs.existsSync(path.join(TMP, 'ulgen-ceviri')) && ceviri.durum('en', 'tr') === 'paket_yok');
  r = await ceviri.paketIndir('de', 'tr', () => {});
  ol('desteklenmeyen çiftte ağa çıkılmıyor', r.ok === false && r.hata === 'desteklenmiyor');

  baslik('9. Motor dayanıklılığı (kaynak metni)');
  const kok = path.join(__dirname, '..');
  const mot = fs.readFileSync(path.join(kok, 'src', 'main', 'ulgen-ceviri.js'), 'utf8');
  ol("worker 'exit' dinleniyor (ölürse bekleyen söz çözülür, panel kilitlenmez)", /worker\.on\('exit'/.test(mot));
  ol('her çağrıda zaman aşımı var', /CAGRI_ZAMAN_ASIMI_MS/.test(mot) && /zaman_asimi/.test(mot));
  ol('aynı anda iki worker açılmıyor (tek uçuş)', /motorSozu/.test(mot) && /if \(motorSozu\) return motorSozu;/.test(mot));
  ol('aynı model iki kez yüklenmiyor', /m\.yuklu\.get\(cift\)/.test(mot));
  ol('worker belleği sınırlı (resourceLimits)', /resourceLimits/.test(mot));
  ol('gunzip çıktısı sınırlı (maxOutputLength)', /maxOutputLength/.test(mot));

  baslik('10. Ana süreç bağlantısı (kaynak metni)');
  const main = fs.readFileSync(path.join(kok, 'src', 'main', 'main.js'), 'utf8');
  const pre = fs.readFileSync(path.join(kok, 'src', 'preload', 'preload.js'), 'utf8');
  ol('özet isteği hedefDil taşıyor ve çeviri yanıta ekleniyor',
    /hedefDil.*istek\?\.hedefDil/s.test(main) && main.includes('yanit.ceviri = await ulgenOzetCevir('));
  ol('çeviri izni (ulgenTranslate) motor tarafında denetleniyor',
    main.includes("ulgenIzin('ulgenTranslate')") && main.includes("durum: 'kapali'"));
  ol('paket indirme yalnız eylemle başlıyor', main.includes("eylem?.tur === 'ceviriPaketi'"));
  ol('ilerleme olayı pencereye gönderiliyor', main.includes("send('ulgen-ceviri-durum'"));
  ol('⛔ gizli pencerede paket İNMİYOR (iz bırakmaz)',
    /ulgenCeviriPaketi[\s\S]{0,600}incognitoState[\s\S]{0,120}gizli_pencere/.test(main));
  ol('izin geri alınınca indirilen paket siliniyor', main.includes("if (!ulgenIzin('ulgenTranslate')) ulgenCeviri.paketSil();"));
  ol('kapanışta motor kapatılıyor', /will-quit[\s\S]{0,80}ulgenCeviri\.motorKapat\(\)/.test(main));
  ol('köprüde abonelik ve silme var',
    pre.includes('onCeviriDurum:') && /ipcRenderer\.off\('ulgen-ceviri-durum'/.test(pre) && pre.includes("ceviriSil:"));
  ol('⛔ motor modülünde uzak çeviri API adresi YOK',
    !/api\.|translate\.google|deepl|riva|8765/i.test(mot.replace(/^\s*\*.*$/gm, '')));

  baslik('11. Gerçek paket tanımı — özetler yerinde');
  // ⚠️ Özet koddan düşerse indirme doğrulaması SESSİZCE anlamsızlaşır.
  const gercek = Object.values(gercekPaketler).flat();
  ol('her dosyanın 64 haneli SHA-256 özeti, inen ve açılmış boyu var',
    gercek.length === 4 && gercek.every((d) => /^[0-9a-f]{64}$/.test(d.sha256) && d.bayt > 0 && d.acik > d.bayt),
    JSON.stringify(gercek.map((d) => d.ad)));
  ol('uzak yollar ceviri kökünün altında ve .gz',
    gercek.every((d) => /^[a-z-]+\/[\w.-]+\.gz$/.test(d.uzak)));

  Object.assign(ceviri.PAKETLER, gercekPaketler);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
  process.exit(kalan ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
