'use strict';
/**
 * ARAŞTIRMA ZİNCİRİ — GERÇEK ÖLÇÜM. Bu sınama AĞA ÇIKAR (bilerek).
 *
 * Çalıştır:  node test/arastir.js
 *
 * ⛔ NEDEN VAR (Burak, 22.09.2026): "İnternet browser içerisindeki bir yapay
 *    zeka soru sorulduğunda araştıramıyorsa aptal bir uygulamadan farkı yok."
 *    Klon Ülgen iki soruya da `bilinmiyor` dönüyordu.
 *
 * ⚠️ DÜRÜST SINIR: burada sayfa metni KABA çıkarımla alınıyor. Üründe bu iş
 *    İlgezdi'nin kendi `reader.extract()` yoluna (korumalı, temiz oturum)
 *    bağlanacak. Yani bu ölçüm ZİNCİRİ ölçer, okuyucuyu değil.
 */
const http = require('http');
const https = require('https');
const arastirma = require('../src/main/ulgen-arastir.js');

const SEARX = process.env.SEARX || 'http://127.0.0.1:8888';

const getir = (u, yonlendirme = 0) => new Promise((coz, red) => {
  const m = u.startsWith('https') ? https : http;
  m.get(u, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'tr,en' } }, (y) => {
    if (y.statusCode >= 300 && y.statusCode < 400 && y.headers.location && yonlendirme < 4) {
      y.resume();
      const hedef = y.headers.location.startsWith('http') ? y.headers.location : new URL(y.headers.location, u).href;
      return getir(hedef, yonlendirme + 1).then(coz, red);
    }
    let d = ''; y.setEncoding('utf8');
    y.on('data', (x) => { if (d.length < 400000) d += x; });
    y.on('end', () => coz({ kod: y.statusCode, govde: d }));
  }).on('error', red);
});

// ── kanca 1: arama (yerel SearXNG — Ülgen'in zaten kullandığı) ────────────
async function ara(sorgu) {
  const { govde } = await getir(`${SEARX}/search?q=${encodeURIComponent(sorgu)}&format=json&language=tr`);
  let j; try { j = JSON.parse(govde); } catch { return []; }
  return (j.results || []).slice(0, 12).map((r) => ({ baslik: r.title, url: r.url, parcacik: r.content }));
}

// ── kanca 2: sayfa aç (üründe İlgezdi'nin korumalı görev sayfası) ─────────
async function sayfaAc(url) {
  const { kod, govde } = await getir(url);
  if (kod >= 400) return { ok: false, sebep: `http_${kod}` };
  // ⛔ PDF/ikili içerik: kaba çıkarım ham bayt döndürüyordu (ölçüldü).
  //    Üründe okuyucu bunu zaten yapmaz; burada da reddediyoruz.
  if (/^%PDF-|^PK/.test(govde.slice(0, 8))) return { ok: false, sebep: 'pdf_okunamaz' };
  const bloklar = govde
    .replace(/<(script|style|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, '')
    .split(/<\/p>|<\/li>|<\/h[1-6]>|<\/div>|<\/td>|<\/th>|<\/tr>/i)
    .map((s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim())
    // ⚠️ Eşik 60 → 20: üründe okuyucu td/th/tr'yi de blok sayıyor ve kağan
    //    adları TABLO hücrelerinde. 60 eşiği onları atıyordu (ölçüldü).
    .filter((s) => s.length > 20);
  const b = (govde.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i) || [])[1] || '';
  if (!bloklar.length) return { ok: false, sebep: 'makale_yok' };
  return { ok: true, bloklar, basliklar: [], baslik: b.replace(/\s+/g, ' ').trim(), kirpildi: govde.length >= 400000 };
}

const SORULAR = [
  'Göktürk tarihindeki önemli hükümdarları sıralamanı istiyorum',
  'Matematik biliminde çağ atlatacak buluşlar yapan bilim insanları kimlerdir?',
];

(async () => {
  for (const soru of SORULAR) {
    console.log('\n' + '═'.repeat(68));
    console.log('SORU: ' + soru);
    const s = await arastirma.arastir(soru, { ara, sayfaAc }, { azamiKaynak: 4 });
    if (!s.ok) { console.log('  ⛔ ' + s.sebep + ' — UYDURMUYOR'); console.log(JSON.stringify(s.iz, null, 1)); continue; }

    const a = s.iz.adimlar;
    const suz = a.find((x) => x.adim === 'suzgec');
    const coz = a.find((x) => x.adim === 'soru_coz');
    console.log(`  tip: ${coz.tip} · sorgu: "${coz.sorgu}" · eşanlam: ${coz.esanlam}`);
    console.log(`  arama: ${a.find((x) => x.adim === 'arama').bulunan} sonuç → süzgeç: ${suz.elenen} elendi, ${suz.kalan} kaldı`);
    for (const p of a.filter((x) => x.adim === 'sayfa')) {
      console.log(`    ${p.ok ? '✓' : '✗'} ${p.ms} ms · ${p.ok ? p.cumle + ' cümle' : p.sebep} · ${p.url.slice(0, 70)}`);
    }
    if (s.adlar && s.adlar.length) {
      console.log(`\n  CEVAP — ${s.adlar.length} ad (${s.kaynakSayisi} kaynak · ${s.iz.toplamMs} ms):`);
      s.adlar.forEach((v, i) => {
        console.log(`   ${i + 1}. ${v.ad}${v.unvan ? ' ' + v.unvan : ''}${v.yil ? '  (' + v.yil + ')' : ''}`
          + `   · ${v.sayi} kez · ${v.kaynaklar.length} kaynak · güven: ${v.guven}`);
      });
      console.log('\n  bağlam cümleleri:');
    } else {
      console.log(`\n  CEVAP (${s.maddeler.length} madde · ${s.kaynakSayisi} kaynak · ${s.iz.toplamMs} ms):`);
    }
    s.maddeler.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.metin.slice(0, 190)}`);
      console.log(`      kaynak: ${m.kaynaklar.map((k) => k.url.slice(0, 60)).join(' , ')}`);
    });
  }
})();
