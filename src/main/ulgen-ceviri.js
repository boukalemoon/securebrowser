/**
 * İlgezdi — Ülgen çeviri motoru (CİHAZ İÇİ)
 *
 * Yabancı bir sayfanın ÖZETİNİ Türkçeleştirir. Sayfa metni cihazdan ÇIKMAZ:
 * çeviri, indirilen Mozilla/Bergamot modeliyle bu makinede yapılır. İnen tek
 * şey dil paketidir; çevrilen metin hiçbir sunucuya gitmez.
 *
 * ⛔ Uzak çeviri (Riva, bulut API) BİLEREK YOK: İlgezdi'nin duruşunun tersi.
 *
 * ÖLÇÜLDÜ (20.09.2026, gerçek en→tr modeliyle):
 *   ilk çeviri (WASM + model yükleme dahil) 642-738 ms · sonraki cümle 55-66 ms
 *   tipik özet (699 karakter) 183-214 ms · bellek çalışırken +291 MB,
 *   worker kapatılınca GERİ VERİLİYOR → motor boşta kalınca kapatılır.
 *
 * ⚠️ Chromium'un yerleşik Translator API'si Electron'da YOK (44.3.0 / Chromium
 *    152'de ölçüldü: arayüz tanımlı bile değil), o yüzden tek yol budur.
 *
 * Paket dosyaları ve SHA-256 özetleri KODA YAZILIDIR: sunucu ele geçirilse
 * bile listede olmayan ya da özeti tutmayan bir dosya kurulmaz.
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
const BOSTA_KAPAT_MS = 60000;            // motor boşta kalınca bellek geri verilir
const AZAMI_CUMLE = 8;
const AZAMI_CUMLE_HARF = 600;

/* Dosya listesi + özetler uygulamayla gelir; sunucudan LİSTE ÇEKİLMEZ. */
const PAKETLER = {
  motor: [
    // ⚠️ gzip dosya ADINI ve ZAMAN DAMGASINI baytlara gömer; bu yüzden paket
    // `gzip -9 -n` (damgasız) ile üretilir, yoksa her üretimde özet DEĞİŞİR.
    // Açılmış WASM: 735d4d95ede043c48f146b9a89336077f18885ad30b7e9a6a86c51a73ca02e7b
    { ad: 'bergamot-translator-worker.wasm', uzak: 'motor/bergamot-translator-worker.wasm.gz',
      bayt: 1857881, sha256: '24b80fdd0cfe326a69fdb3f8f17619cad0e6179098bd71636445d0e4803514d2' },
  ],
  'en-tr': [
    { ad: 'model.bin', uzak: 'en-tr/model.entr.intgemm.alphas.bin.gz',
      bayt: 13159314, sha256: '52d10136b1a4804879989aa9ee146e83ced75aa0ce2d371b4e582473ed6b9020' },
    { ad: 'lex.bin', uzak: 'en-tr/lex.50.50.entr.s2t.bin.gz',
      bayt: 1546258, sha256: 'cf74d4edec0b51affd30a43e6bd2c2274bf4ce7fd54c24fd293db2c5c4bf043d' },
    { ad: 'vocab.spm', uzak: 'en-tr/vocab.entr.spm.gz',
      bayt: 395473, sha256: '01e55973e65a34c5efbdce3968857d4e53998b4bef131c5125a19f8e44d8f87c' },
  ],
};
const DESTEKLENEN = new Set(['en-tr']);

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
const damga = (ad) => path.join(paketDizin(ad), 'tamam.json');

function paketVar(ad) {
  try {
    if (!fs.existsSync(damga(ad))) return false;
    return (PAKETLER[ad] || []).every((d) => fs.existsSync(path.join(paketDizin(ad), d.ad)));
  } catch { return false; }
}

function ciftAdi(kaynakDil, hedefDil) { return `${kaynakDil}-${hedefDil}`; }

/** 'hazir' | 'paket_yok' | 'desteklenmiyor' */
function durum(kaynakDil, hedefDil) {
  const cift = ciftAdi(kaynakDil, hedefDil);
  if (!DESTEKLENEN.has(cift)) return 'desteklenmiyor';
  return paketVar('motor') && paketVar(cift) ? 'hazir' : 'paket_yok';
}

async function dosyaIndir(d, ses) {
  const res = await ses.fetch(`${TABAN}/${d.uzak}`, {
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(INDIRME_ZAMAN_ASIMI_MS),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const ham = Buffer.from(await res.arrayBuffer());
  // ⛔ Beklenen boy ve özet TUTMUYORSA yazılmaz: sunucu değişse de başka dosya kurulmaz.
  if (ham.length !== d.bayt) throw new Error('boy_tutmadi');
  if (crypto.createHash('sha256').update(ham).digest('hex') !== d.sha256) throw new Error('ozet_tutmadi');
  return zlib.gunzipSync(ham);
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
        for (const d of liste) {
          const acik = await dosyaIndir(d, ses);
          // Yarım dosya kurulu sayılmasın: önce .yeni, sonra yerine taşı.
          const hedef = path.join(dizin, d.ad);
          await fsp.writeFile(`${hedef}.yeni`, acik);
          await fsp.rename(`${hedef}.yeni`, hedef);
          inen += d.bayt;
          bildir('iniyor');
        }
        await fsp.writeFile(damga(ad), JSON.stringify({ tarih: new Date().toISOString(), dosyalar: liste.map((x) => x.ad) }));
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

/** Yalnız indirilen dosyaları siler (Veri ve Gizlilik → temizleme yolu). */
function paketSil() {
  try { fs.rmSync(kokDizin(), { recursive: true, force: true }); return true; } catch { return false; }
}

/* ── Motor (worker) ───────────────────────────────────────────────────────*/
let motor = null;          // { worker, yuklu:Set, bekleyen:Map, sayac }
let bostaZaman = null;

function motorKapat() {
  if (bostaZaman) { clearTimeout(bostaZaman); bostaZaman = null; }
  if (!motor) return;
  const m = motor; motor = null;
  for (const b of m.bekleyen.values()) b.rej(new Error('motor_kapandi'));
  try { m.worker.terminate(); } catch { /* zaten kapalı */ }
}
function bostaSayacYenile() {
  if (bostaZaman) clearTimeout(bostaZaman);
  bostaZaman = setTimeout(motorKapat, BOSTA_KAPAT_MS);
  if (typeof bostaZaman.unref === 'function') bostaZaman.unref();
}

function cagir(m, name, args) {
  return new Promise((res, rej) => {
    const id = ++m.sayac;
    m.bekleyen.set(id, { res, rej });
    m.worker.postMessage({ id, name, args });
  });
}

async function motorAc() {
  if (motor) return motor;
  const m = { worker: new Worker(path.join(__dirname, 'ceviri', 'bergamot-worker.cjs')),
              yuklu: new Set(), bekleyen: new Map(), sayac: 0 };
  m.worker.on('message', ({ id, result, error }) => {
    const b = m.bekleyen.get(id);
    if (!b) return;
    m.bekleyen.delete(id);
    if (error) b.rej(new Error(error.message || 'worker_hatasi'));
    else b.res(result);
  });
  m.worker.on('error', (e) => { for (const b of m.bekleyen.values()) b.rej(e); m.bekleyen.clear(); motor = null; });
  await cagir(m, 'initialize', [{ cacheSize: 0, useNativeIntGemm: false,
    wasmYolu: path.join(paketDizin('motor'), 'bergamot-translator-worker.wasm') }]);
  motor = m;
  return m;
}

const arabellek = (p) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

async function modelYukle(m, kaynakDil, hedefDil) {
  const cift = ciftAdi(kaynakDil, hedefDil);
  if (m.yuklu.has(cift)) return;
  const d = paketDizin(cift);
  await cagir(m, 'loadTranslationModel', [{ from: kaynakDil, to: hedefDil }, {
    model: arabellek(path.join(d, 'model.bin')),
    shortlist: arabellek(path.join(d, 'lex.bin')),
    vocabs: [arabellek(path.join(d, 'vocab.spm'))],
  }]);
  m.yuklu.add(cift);
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
    const m = await motorAc();
    await modelYukle(m, kaynakDil, hedefDil);
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

module.exports = { dilBul, durum, paketIndir, paketVar, paketSil, cevir, motorKapat, DESTEKLENEN, PAKETLER, TABAN };
