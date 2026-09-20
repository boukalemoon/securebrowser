/**
 * İlgezdi — Ülgen çeviri motoru (CİHAZ İÇİ)
 *
 * Yabancı bir sayfanın ÖZETİNİ Türkçeleştirir. Sayfa metni cihazdan ÇIKMAZ:
 * çeviri, indirilen Mozilla/Bergamot modeliyle bu makinede yapılır. İnen tek
 * şey dil paketidir; çevrilen metin hiçbir sunucuya gitmez.
 *
 * ⛔ Uzak çeviri (Riva, bulut API) BİLEREK YOK: İlgezdi'nin duruşunun tersi.
 *
 * ÖLÇÜLDÜ (20.09.2026, gerçek en→tr modeliyle, canlı sunucudan):
 *   indirme 1,0 sn (16 MB) · ilk çeviri 619-738 ms · sonraki cümle 26-66 ms
 *   bellek çalışırken +291 MB, worker kapatılınca GERİ VERİLİYOR (319→109 MB)
 *   → motor boşta kalınca kapatılır.
 *
 * ⚠️ Chromium'un yerleşik Translator API'si Electron'da YOK (44.3.0 / Chromium
 *    152'de ölçüldü: arayüz tanımlı bile değil), o yüzden tek yol budur.
 *
 * GÜVENLİK DURUŞU (güvenlik denetimi 20.09.2026 sonrası):
 *   · Dosya listesi ve SHA-256 özetleri KODA YAZILI; sunucudan liste çekilmez.
 *   · İndirme AKIŞ HÂLİNDE ve beklenen boyda kesilir — sunucu gigabaytlık
 *     gövde verse bile ana süreç şişmez.
 *   · Yönlendirme YASAK: tek bir açık yönlendirme kullanıcının adresini
 *     üçüncü tarafa açardı; bu da paketleri kendi sunucumuza taşıma sebebini
 *     boşa çıkarırdı.
 *   · Kurulan dosyaların özetleri diskte saklanır ve motora verilmeden ÖNCE
 *     yeniden doğrulanır: koddaki özet değişirse paket "yok" sayılır (geri
 *     alma), diskte dosya değiştirilirse motor açılmaz.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { Worker } = require('node:worker_threads');
const { app, session } = require('electron');

const TABAN = 'https://www.ilgezdi.com.tr/ceviri';
const BOLUM = 'ilgezdi-ceviri';          // "persist:" YOK → bellek içi, çerezsiz
const INDIRME_ZAMAN_ASIMI_MS = 120000;
const CAGRI_ZAMAN_ASIMI_MS = 45000;      // worker yanıt vermezse panel kilitlenmesin
const BOSTA_KAPAT_MS = 60000;            // motor boşta kalınca bellek geri verilir
const AZAMI_CUMLE = 8;
const AZAMI_CUMLE_HARF = 600;
const DAMGA_SURUM = 2;

/* Dosya listesi + özetler uygulamayla gelir; sunucudan LİSTE ÇEKİLMEZ.
   `bayt` = inen (.gz) boy, `acik` = açılmış boy: ikisi de sınır olarak kullanılır. */
const PAKETLER = {
  motor: [
    // ⚠️ gzip dosya ADINI ve ZAMAN DAMGASINI baytlara gömer; bu yüzden paket
    // `gzip -9 -n` (damgasız) ile üretilir, yoksa her üretimde özet DEĞİŞİR.
    // Açılmış WASM: 735d4d95ede043c48f146b9a89336077f18885ad30b7e9a6a86c51a73ca02e7b
    { ad: 'bergamot-translator-worker.wasm', uzak: 'motor/bergamot-translator-worker.wasm.gz',
      bayt: 1857881, acik: 5241884, sha256: '24b80fdd0cfe326a69fdb3f8f17619cad0e6179098bd71636445d0e4803514d2' },
  ],
  'en-tr': [
    { ad: 'model.bin', uzak: 'en-tr/model.entr.intgemm.alphas.bin.gz',
      bayt: 13159314, acik: 17141051, sha256: '52d10136b1a4804879989aa9ee146e83ced75aa0ce2d371b4e582473ed6b9020' },
    { ad: 'lex.bin', uzak: 'en-tr/lex.50.50.entr.s2t.bin.gz',
      bayt: 1546258, acik: 3261300, sha256: 'cf74d4edec0b51affd30a43e6bd2c2274bf4ce7fd54c24fd293db2c5c4bf043d' },
    { ad: 'vocab.spm', uzak: 'en-tr/vocab.entr.spm.gz',
      bayt: 395473, acik: 798793, sha256: '01e55973e65a34c5efbdce3968857d4e53998b4bef131c5125a19f8e44d8f87c' },
  ],
};
const DESTEKLENEN = new Set(['en-tr']);
const ozetle = (b) => crypto.createHash('sha256').update(b).digest('hex');

/* ── Dil tanıma ────────────────────────────────────────────────────────────
   Küçük ve dürüst: yalnız "bu metin Türkçe mi, İngilizce mi" sorusunu yanıtlar.
   Emin olamazsa null döner ve çeviri TEKLİF EDİLMEZ (yanlış dilde çeviri,
   çevirmemekten kötüdür). Kütüphane eklemedim: 1 KB metin için gereksiz. */
// ⚠️ ÖLÇÜLDÜ: "ö" ve "ü" Türkçeye özgü DEĞİL — Almanca cümle bu yüzden Türkçe
// sanılıyordu. Yalnız Türkçeye özgü harfler sayılır (ğ, ı, ş ve büyükleri).
const TR_HARF = /[ğıĞİşŞ]/;
const TR_SOZ = /\b(ve|bir|bu|için|ile|olarak|daha|olan|göre|ancak|ama|de|da|değil|sonra|kadar)\b/gi;
const EN_SOZ = /\b(the|and|of|to|in|that|is|for|with|as|was|on|are|by|from|this|it)\b/gi;

function dilBul(metin) {
  const m = String(metin || '').slice(0, 4000);
  const soz = (m.match(/[\p{L}]+/gu) || []).length;
  if (soz < 12) return null;                       // örnek çok küçük, iddia etme
  const tr = (m.match(TR_SOZ) || []).length + (TR_HARF.test(m) ? 3 : 0);
  const en = (m.match(EN_SOZ) || []).length;
  if (en >= 5 && en > tr * 2) return 'en';
  if (tr >= 3 && tr > en) return 'tr';
  return null;
}

/* ── Paket yönetimi ───────────────────────────────────────────────────────*/
const kokDizin = () => path.join(app.getPath('userData'), 'ulgen-ceviri');
const paketDizin = (ad) => path.join(kokDizin(), ad);
const damgaYolu = (ad) => path.join(paketDizin(ad), 'tamam.json');

function damgaOku(ad) {
  try { return JSON.parse(fs.readFileSync(damgaYolu(ad), 'utf8')); } catch { return null; }
}

/** Kurulu mu? Damgadaki KAYNAK özetleri koddakiyle aynı olmalı: kodda özet
 *  değişirse (bozuk model geri alınırsa) paket kurulu SAYILMAZ, yeniden iner. */
function paketVar(ad) {
  const d = damgaOku(ad);
  if (!d || d.surum !== DAMGA_SURUM || !d.dosyalar) return false;
  return (PAKETLER[ad] || []).every((x) => {
    const k = d.dosyalar[x.ad];
    return k && k.kaynak === x.sha256 && typeof k.disk === 'string'
      && fs.existsSync(path.join(paketDizin(ad), x.ad));
  });
}

function ciftAdi(kaynakDil, hedefDil) { return `${kaynakDil}-${hedefDil}`; }

/** 'hazir' | 'paket_yok' | 'desteklenmiyor' */
function durum(kaynakDil, hedefDil) {
  const cift = ciftAdi(kaynakDil, hedefDil);
  if (!DESTEKLENEN.has(cift)) return 'desteklenmiyor';
  return paketVar('motor') && paketVar(cift) ? 'hazir' : 'paket_yok';
}

/** Arayüz için: dil paketi kurulu mu, hangi çiftler var. */
function paketDurumu() {
  const ciftler = [...DESTEKLENEN].filter((c) => paketVar(c));
  return { kurulu: paketVar('motor') && ciftler.length > 0, ciftler };
}

/** Gövdeyi PARÇA PARÇA okur ve beklenen boyu aşınca hemen keser.
 *  ⛔ Tek seferde arrayBuffer() almak, sunucu gigabaytlık akış verirse ana
 *  süreci şişirirdi ve SHA-256 denetimi hiç sıraya gelmezdi. */
async function govdeOku(res, azami) {
  const okuyucu = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!okuyucu) {
    const b = Buffer.from(await res.arrayBuffer());
    if (b.length > azami) throw new Error('boy_tutmadi');
    return b;
  }
  const parcalar = [];
  let n = 0;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    n += value.byteLength;
    if (n > azami) {
      try { await okuyucu.cancel(); } catch { /* akış zaten kapanmış olabilir */ }
      throw new Error('boy_tutmadi');
    }
    parcalar.push(Buffer.from(value));
  }
  return Buffer.concat(parcalar, n);
}

async function dosyaIndir(d, ses) {
  const url = `${TABAN}/${d.uzak}`;
  const res = await ses.fetch(url, {
    credentials: 'omit', cache: 'no-store',
    // ⛔ Yönlendirme İZLENMEZ: tek bir açık yönlendirme kullanıcının adresini
    //    üçüncü tarafa açardı — paketleri kendi sunucumuza taşıma sebebi buydu.
    redirect: 'error',
    signal: AbortSignal.timeout(INDIRME_ZAMAN_ASIMI_MS),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  if (res.url && !String(res.url).startsWith(`${TABAN}/`)) throw new Error('yonlendirme');
  const bildirilen = Number(res.headers.get('content-length') || 0);
  if (bildirilen && bildirilen !== d.bayt) throw new Error('boy_tutmadi');   // gövdeyi hiç okumadan
  const ham = await govdeOku(res, d.bayt);
  // ⛔ Beklenen boy ve özet TUTMUYORSA yazılmaz: sunucu değişse de başka dosya kurulmaz.
  if (ham.length !== d.bayt) throw new Error('boy_tutmadi');
  if (ozetle(ham) !== d.sha256) throw new Error('ozet_tutmadi');
  const acik = zlib.gunzipSync(ham, { maxOutputLength: d.acik });
  if (acik.length !== d.acik) throw new Error('acik_boy_tutmadi');
  return acik;
}

const inenler = new Map();   // cift -> Promise  (ikinci çağrı aynı indirmeye bağlanır)

function paketIndir(kaynakDil, hedefDil, ilerleme) {
  const cift = ciftAdi(kaynakDil, hedefDil);
  if (!DESTEKLENEN.has(cift)) return Promise.resolve({ ok: false, durum: 'hata', hata: 'desteklenmiyor' });
  if (inenler.has(cift)) return inenler.get(cift);

  const is = (async () => {
    const ses = session.fromPartition(BOLUM);
    const gerekli = [...(paketVar('motor') ? [] : [['motor', PAKETLER.motor]]),
                     ...(paketVar(cift) ? [] : [[cift, PAKETLER[cift]]])];
    const toplam = gerekli.reduce((n, [, l]) => n + l.reduce((s, d) => s + d.bayt, 0), 0);
    let inen = 0;
    const bildir = (durumAd) => { try { ilerleme?.({ kaynakDil, hedefDil, durum: durumAd, inen, toplam,
      yuzde: toplam ? Math.round((inen / toplam) * 100) : 100 }); } catch { /* bildirim şart değil */ } };
    try {
      bildir('iniyor');
      for (const [ad, liste] of gerekli) {
        const dizin = paketDizin(ad);
        await fsp.mkdir(dizin, { recursive: true });
        const dosyalar = {};
        for (const d of liste) {
          const acik = await dosyaIndir(d, ses);
          // Yarım dosya kurulu sayılmasın: önce .yeni, sonra yerine taşı.
          const hedef = path.join(dizin, d.ad);
          await fsp.writeFile(`${hedef}.yeni`, acik);
          await fsp.rename(`${hedef}.yeni`, hedef);
          dosyalar[d.ad] = { kaynak: d.sha256, disk: ozetle(acik), bayt: acik.length };
          inen += d.bayt;
          bildir('iniyor');
        }
        // Damga: hangi KAYNAK özetiyle kuruldu + DİSKTEKİ hâlin özeti.
        await fsp.writeFile(damgaYolu(ad), JSON.stringify({ surum: DAMGA_SURUM, tarih: new Date().toISOString(), dosyalar }));
      }
      bildir('indi');
      return { ok: true, durum: 'indi' };
    } catch (e) {
      bildir('hata');
      return { ok: false, durum: 'hata', hata: String(e && e.message ? e.message : e).slice(0, 80) };
    } finally {
      inenler.delete(cift);
    }
  })();
  inenler.set(cift, is);
  return is;
}

/** Diskteki dosyaları OKUR ve damgadaki özetlerle doğrular; tutmazsa atar.
 *  Motor açılmadan önce çağrılır: dosya sonradan değiştirilmişse yüklenmez. */
async function dosyalariOku(ad) {
  const d = damgaOku(ad);
  if (!d || !d.dosyalar) throw new Error('paket_damgasiz');
  const out = {};
  for (const x of PAKETLER[ad] || []) {
    const beklenen = d.dosyalar[x.ad];
    if (!beklenen || beklenen.kaynak !== x.sha256) throw new Error('paket_eski');
    const b = await fsp.readFile(path.join(paketDizin(ad), x.ad));
    if (b.length !== beklenen.bayt || ozetle(b) !== beklenen.disk) throw new Error('dosya_bozuk');
    out[x.ad] = b;
  }
  return out;
}

/** İndirilen her şeyi siler (izin geri alınınca ve Veri ve Gizlilik'ten). */
function paketSil() {
  motorKapat();
  try { fs.rmSync(kokDizin(), { recursive: true, force: true }); return true; } catch { return false; }
}

/* ── Motor (worker) ───────────────────────────────────────────────────────*/
let motor = null;          // { worker, yuklu:Map, bekleyen:Map, sayac }
let motorSozu = null;      // aynı anda İKİ worker açılmasın (291 MB × 2 olurdu)
let bostaZaman = null;

function motorKapat() {
  if (bostaZaman) { clearTimeout(bostaZaman); bostaZaman = null; }
  if (!motor) return;
  const m = motor; motor = null;
  for (const b of m.bekleyen.values()) b.rej(new Error('motor_kapandi'));
  m.bekleyen.clear();
  try { m.worker.terminate(); } catch { /* zaten kapalı */ }
}
function bostaSayacYenile() {
  if (bostaZaman) clearTimeout(bostaZaman);
  bostaZaman = setTimeout(motorKapat, BOSTA_KAPAT_MS);
  if (typeof bostaZaman.unref === 'function') bostaZaman.unref();
}

/** Worker'a çağrı. ⛔ Zaman aşımı ŞART: worker askıda kalırsa söz hiç
 *  çözülmez, `ulgen-sor` yanıt vermez ve panel kilitli kalırdı. */
function cagir(m, name, args, sure = CAGRI_ZAMAN_ASIMI_MS) {
  return new Promise((res, rej) => {
    const id = ++m.sayac;
    const zaman = setTimeout(() => {
      if (m.bekleyen.delete(id)) { rej(new Error('zaman_asimi')); if (motor === m) motorKapat(); }
    }, sure);
    if (typeof zaman.unref === 'function') zaman.unref();
    m.bekleyen.set(id, { res: (v) => { clearTimeout(zaman); res(v); },
                         rej: (e) => { clearTimeout(zaman); rej(e); } });
    const aktar = args?.[1] && typeof args[1] === 'object'
      ? Object.values(args[1]).flat().filter((v) => v instanceof ArrayBuffer) : [];
    m.worker.postMessage({ id, name, args }, aktar);   // 21 MB kopyalanmasın, aktarılsın
  });
}

async function motorAc(wasmYolu) {
  if (motor) return motor;
  if (motorSozu) return motorSozu;
  motorSozu = (async () => {
    const m = { worker: new Worker(path.join(__dirname, 'ceviri', 'bergamot-worker.cjs'),
                                   { resourceLimits: { maxOldGenerationSizeMb: 512 } }),
                yuklu: new Map(), bekleyen: new Map(), sayac: 0 };
    const hepsiniKes = (e) => {
      for (const b of m.bekleyen.values()) b.rej(e);
      m.bekleyen.clear();
      if (motor === m) motor = null;
    };
    m.worker.on('message', ({ id, result, error }) => {
      const b = m.bekleyen.get(id);
      if (!b) return;
      m.bekleyen.delete(id);
      if (error) b.rej(new Error(error.message || 'worker_hatasi'));
      else b.res(result);
    });
    m.worker.on('error', (e) => hepsiniKes(e));
    // ⛔ 'exit' olmadan: worker ölürse bekleyen sözler HİÇ çözülmez, panel kilitlenir.
    m.worker.on('exit', (kod) => hepsiniKes(new Error(`worker_kapandi_${kod}`)));
    await cagir(m, 'initialize', [{ cacheSize: 0, useNativeIntGemm: false, wasmYolu }]);
    motor = m;
    return m;
  })().finally(() => { motorSozu = null; });
  return motorSozu;
}

/* Doğrulama ve yükleme MOTOR ÖMRÜNDE BİR KEZ. ⚠️ Ölçüldü: her çeviride
   doğrulamak 21 MB okuma+özet demek ve ikinci çeviriyi 26 ms'den 111 ms'ye
   çıkarıyordu. Dosyalar motora girerken doğrulanır; motor kapanınca (60 sn
   boşta, izin iptali, kapanış) yeniden doğrulanır. */
function modelYukle(m, kaynakDil, hedefDil, hazirDosyalar) {
  const cift = ciftAdi(kaynakDil, hedefDil);
  if (m.yuklu.has(cift)) return m.yuklu.get(cift);      // aynı model iki kez yüklenmesin
  const arabellek = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const soz = (async () => {
    const dosyalar = hazirDosyalar || await dosyalariOku(cift);
    return cagir(m, 'loadTranslationModel', [{ from: kaynakDil, to: hedefDil }, {
      model: arabellek(dosyalar['model.bin']),
      shortlist: arabellek(dosyalar['lex.bin']),
      vocabs: [arabellek(dosyalar['vocab.spm'])],
    }], INDIRME_ZAMAN_ASIMI_MS);
  })().catch((e) => { m.yuklu.delete(cift); throw e; });
  m.yuklu.set(cift, soz);
  return soz;
}

/**
 * Cümleleri çevirir. Döner: { durum, motor, kaynakDil, cumleler }
 * durum: 'hazir' | 'paket_yok' | 'desteklenmiyor' | 'hata'
 * ⚠️ Özgün cümleler ÇAĞIRANDA kalır; burada yalnız çeviri döner. Panel ikisini
 *    birlikte gösterir ("makine çevirisi" damgasıyla) — asıl metin kaybolmaz.
 */
async function cevir(cumleler, { kaynakDil, hedefDil }) {
  const d = durum(kaynakDil, hedefDil);
  if (d !== 'hazir') return { durum: d, motor: 'bergamot', kaynakDil, cumleler: [] };
  const metinler = (cumleler || []).slice(0, AZAMI_CUMLE)
    .map((c) => String(c || '').slice(0, AZAMI_CUMLE_HARF));
  if (!metinler.length) return { durum: 'hazir', motor: 'bergamot', kaynakDil, cumleler: [] };
  try {
    /* Dosyalar motor AÇILMADAN ÖNCE doğrulanır (kurcalanmış dosyayla worker
       hiç başlatılmaz) ama motor ömründe YALNIZ BİR KEZ: ölçüldü, her çeviride
       doğrulamak 21 MB okuma+özet demekti ve ikinci çeviri 26 → 111 ms oluyordu. */
    const cift = ciftAdi(kaynakDil, hedefDil);
    let dosyalar = null;
    if (!motor || !motor.yuklu.has(cift)) {
      await dosyalariOku('motor');
      dosyalar = await dosyalariOku(cift);
    }
    const m = await motorAc(path.join(paketDizin('motor'), 'bergamot-translator-worker.wasm'));
    await modelYukle(m, kaynakDil, hedefDil, dosyalar);
    const sonuc = await cagir(m, 'translate', [{
      models: [{ from: kaynakDil, to: hedefDil }],
      texts: metinler.map((text) => ({ text, html: false, qualityScores: false })),
    }]);
    bostaSayacYenile();
    return { durum: 'hazir', motor: 'bergamot', kaynakDil,
             cumleler: (sonuc || []).map((x) => String(x?.target?.text || '')) };
  } catch (e) {
    motorKapat();
    return { durum: 'hata', motor: 'bergamot', kaynakDil, cumleler: [],
             hata: String(e && e.message ? e.message : e).slice(0, 80) };
  }
}

module.exports = { dilBul, durum, paketIndir, paketVar, paketDurumu, paketSil, cevir, motorKapat, DESTEKLENEN, PAKETLER, TABAN };
