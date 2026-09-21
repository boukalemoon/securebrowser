'use strict';
/**
 * ARAŞTIRMA ZİNCİRİ — DÜŞMANCA ÖLÇÜM. Bu sınama AĞA ÇIKAR (bilerek).
 *
 * Çalıştır:  node test/arastir-dusmanca.js
 *
 * ⛔ NEDEN VAR (Burak, 22.09.2026): *"Yarından itibaren google da aranıza
 *    katılacak antigravity ile birlikte bakalım gözden kaçacak yalanlar
 *    bulabilecek misiniz? Üzerine codex ekleyeyim."* Dışarıdan denetim
 *    gelmeden ÖNCE kendi kusurlarımızı kendimiz bulmak zorundayız.
 *
 * ⛔ BU SINAMA GEÇMEK İÇİN DEĞİL, KIRMAK İÇİN YAZILDI. Sorular bilerek
 *    zincirin zayıf olduğu yerlerden seçildi:
 *      - olmayan bir varlık          → "bulamadım" demeli, UYDURMAMALI
 *      - yanlış öncüllü soru         → öncülü kabul edip cevap ÜRETMEMELİ
 *      - kategori tuzağı             → yanlış kategoriye ad yazmamalı
 *      - liste / tanım / sayı / nasıl → farklı soru tipleri
 *
 * ⚠️ DÜRÜST SINIR: sayfa metni KABA çıkarımla alınıyor (üretimde İlgezdi'nin
 *    `reader.extract()` yolu kullanılacak, o tabloları da okuyor). Yani bu
 *    ölçüm ZİNCİRİ ölçer, okuyucuyu değil — sonuçlar üretimde DAHA İYİ olmalı.
 */
const http = require('http');
const https = require('https');
const arastirma = require('../src/main/ulgen-arastir.js');

const SEARX = process.env.SEARX || 'http://127.0.0.1:8888';

const getir = (u, yon = 0) => new Promise((coz, red) => {
  const m = u.startsWith('https') ? https : http;
  const istek = m.get(u, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'tr,en' } }, (y) => {
    if (y.statusCode >= 300 && y.statusCode < 400 && y.headers.location && yon < 4) {
      y.resume();
      const hedef = y.headers.location.startsWith('http') ? y.headers.location : new URL(y.headers.location, u).href;
      return getir(hedef, yon + 1).then(coz, red);
    }
    let d = ''; y.setEncoding('utf8');
    y.on('data', (x) => { if (d.length < 400000) d += x; });
    y.on('end', () => coz({ kod: y.statusCode, govde: d }));
  });
  istek.setTimeout(15000, () => { istek.destroy(new Error('zaman_asimi')); });
  istek.on('error', red);
});

async function ara(sorgu) {
  const { govde } = await getir(`${SEARX}/search?q=${encodeURIComponent(sorgu)}&format=json&language=tr`);
  let j; try { j = JSON.parse(govde); } catch { return []; }
  return (j.results || []).slice(0, 12).map((r) => ({ baslik: r.title, url: r.url, parcacik: r.content }));
}

async function sayfaAc(url) {
  const { kod, govde } = await getir(url);
  if (kod >= 400) return { ok: false, sebep: `http_${kod}` };
  if (/^%PDF-|^PK\x03\x04/.test(govde.slice(0, 8))) return { ok: false, sebep: 'pdf_okunamaz' };
  const bloklar = govde
    .replace(/<(script|style|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, '')
    .split(/<\/p>|<\/li>|<\/h[1-6]>|<\/div>|<\/td>|<\/th>|<\/tr>/i)
    .map((s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 20);
  const b = (govde.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i) || [])[1] || '';
  if (!bloklar.length) return { ok: false, sebep: 'makale_yok' };
  return { ok: true, bloklar, basliklar: [], baslik: b.replace(/\s+/g, ' ').trim(), kirpildi: govde.length >= 400000 };
}

// beklenti: 'cevap' → makul bir cevap gelmeli
//           'bos'   → ZİNCİR DÜŞMELİ; cevap üretirse UYDURUYOR demektir
const SORULAR = [
  { s: 'Göktürk tarihindeki önemli hükümdarları sıralamanı istiyorum', beklenti: 'cevap', not: 'temel vaka' },
  { s: 'Osmanlı padişahlarını sırala', beklenti: 'cevap', not: 'liste, bol kaynak' },
  { s: 'Fotosentez nedir?', beklenti: 'cevap', not: 'tanım sorusu' },
  { s: 'Bor madeninin kullanım alanları nelerdir?', beklenti: 'cevap', not: 'Türkçe teknik liste' },
  { s: 'Kuantum bilgisayar nasıl çalışır?', beklenti: 'cevap', not: 'nasıl sorusu' },
  { s: 'Matematik biliminde çağ atlatacak buluşlar yapan bilim insanları kimlerdir?', beklenti: 'cevap', not: 'unvansız kişi çıkarımı' },
  // ⛔ TUZAKLAR
  { s: 'Zıpzıp Kağanlığının hükümdarları kimlerdir?', beklenti: 'bos', not: '⛔ OLMAYAN devlet' },
  { s: '2026 yılında Marsa inen ilk Türk astronotun adı nedir?', beklenti: 'bos', not: '⛔ YANLIŞ ÖNCÜL' },
  { s: 'Nobel Fizik Ödülü kazanan Türk bilim insanları kimlerdir?', beklenti: 'bos', not: '⛔ KATEGORİ TUZAĞI (Aziz Sancar KİMYA)' },
  { s: 'Kırkambar Üniversitesinin rektörü kimdir?', beklenti: 'bos', not: '⛔ OLMAYAN kurum' },
];

(async () => {
  const ozet = [];
  for (const { s: soru, beklenti, not } of SORULAR) {
    console.log('\n' + '─'.repeat(72));
    console.log(`SORU: ${soru}\n  beklenti: ${beklenti.toUpperCase()}  · ${not}`);
    let sonuc;
    const t0 = Date.now();
    try {
      sonuc = await arastirma.arastir(soru, { ara, sayfaAc }, { azamiKaynak: 4 });
    } catch (e) {
      console.log(`  ⛔ ÇÖKTÜ: ${String(e && e.message).slice(0, 90)}`);
      ozet.push({ soru, beklenti, gercek: 'coktu', gecti: false, ms: Date.now() - t0 });
      continue;
    }
    const ms = Date.now() - t0;
    const gercek = sonuc.ok ? 'cevap' : 'bos';
    const gecti = gercek === beklenti;
    const adet = sonuc.ok ? ((sonuc.adlar && sonuc.adlar.length) || sonuc.maddeler.length) : 0;
    const guven = sonuc.ok
      ? [...new Set(((sonuc.adlar || sonuc.maddeler) || []).map((x) => x.guven))].join('/')
      : '—';

    console.log(`  → ${gercek.toUpperCase()}${sonuc.ok ? '' : ' (' + sonuc.sebep + ')'} · ${adet} öğe · güven: ${guven} · ${ms} ms`
      + `  ${gecti ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗ BEKLENTİYE UYMADI\x1b[0m'}`);

    if (sonuc.ok) {
      const ogeler = sonuc.adlar || sonuc.maddeler;
      for (const o of ogeler.slice(0, 5)) {
        const metin = o.ad ? `${o.ad}${o.unvan ? ' ' + o.unvan : ''}${o.yil ? ' (' + o.yil + ')' : ''}` : o.metin.slice(0, 120);
        console.log(`     · ${metin}   [${o.guven}]`);
      }
      const alan = [...new Set(ogeler.flatMap((o) => (o.kaynaklar || []).map((x) => { try { return new URL(x.url).hostname; } catch { return '?'; } })))];
      console.log(`     kaynak alanları: ${alan.join(', ')}`);
    }
    ozet.push({ soru, beklenti, gercek, gecti, adet, ms });
  }

  console.log('\n' + '═'.repeat(72));
  console.log('ÖZET (beklentiye uyan / uymayan)');
  let ok = 0;
  for (const o of ozet) {
    console.log(`  ${o.gecti ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${o.beklenti.padEnd(6)}→ ${String(o.gercek).padEnd(6)} `
      + `${String(o.adet ?? '').padStart(2)} öğe · ${String(o.ms).padStart(5)} ms · ${o.soru.slice(0, 46)}`);
    if (o.gecti) ok++;
  }
  console.log(`\n  ${ok}/${ozet.length} beklentiye uydu`);
  console.log('  ⚠️ Bu sayı "kalite" DEĞİLDİR: cevabın DOĞRU olup olmadığı elle');
  console.log('     doğrulanmalı. Burada ölçülen şey, zincirin cevap verdiği/');
  console.log('     sustuğu yerlerin doğru yerler olup olmadığıdır.');
})();
