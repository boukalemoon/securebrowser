'use strict';
/**
 * PENCERE YERLEŞİMİ — birim sınamaları. AĞA ÇIKMAZ, Electron gerekmez.
 *
 * Çalıştır:  node test/yerlesim.js   (npm test de koşar)
 *
 * ⛔ NEDEN VAR (Burak, 03.10.2026 — menü yerleşimini özelleştirme): sayfa görünümü
 *    artık arayüzün ölçtüğü dört kenara göre yerleşiyor. Bu dosya iki sözü kilitler:
 *      1) VARSAYILAN DÜZEN DEĞİŞMEDİ — bugünkü yerleşimde yeni hesap eski formülle
 *         piksel piksel aynı sonucu verir (yerleşimi göremediğimiz için asıl güvence bu).
 *      2) Kenar çubuğu sağa, alta, üste taşınınca sayfa doğru yere gider; bozuk
 *         ölçüm sayfayı görünmez yapamaz.
 */
const Y = require('../src/main/yerlesim.js');

let gecen = 0, kalan = 0;
const ol = (ad, k, d) => {
  if (k) { gecen++; console.log(`  \x1b[32m✓\x1b[0m ${ad}`); }
  else { kalan++; console.log(`  \x1b[31m✗ ${ad}\x1b[0m${d !== undefined ? '  → ' + d : ''}`); }
};
const g = (x) => JSON.stringify(x);

// main.js'teki sabitler (yedek) — testte aynı değerlerle.
const PANEL_WIDTH = 420, SIDEBAR_WIDTH = 56, TOOLBAR_HEIGHT = 128, STATUSBAR_HEIGHT = 24, WEB_BASLIK = 44;
const YEDEK = { left: SIDEBAR_WIDTH, top: TOOLBAR_HEIGHT, right: 0, bottom: STATUSBAR_HEIGHT, panelSide: 'right' };

// Değişiklikten ÖNCEKİ main.js formülleri (birebir kopya).
function eskiContentRect(bounds, leftInset, panelIsOpen) {
  const left = Number.isFinite(leftInset) ? leftInset : SIDEBAR_WIDTH;
  const usableWidth = bounds.width - left;
  return { x: left, y: TOOLBAR_HEIGHT,
    width: panelIsOpen ? Math.max(usableWidth - PANEL_WIDTH, 100) : Math.max(usableWidth, 100),
    height: bounds.height - TOOLBAR_HEIGHT - STATUSBAR_HEIGHT };
}
function eskiWebPanelRect(b) {
  const top = TOOLBAR_HEIGHT + WEB_BASLIK;
  return { x: Math.max(b.width - PANEL_WIDTH, 0), y: top, width: PANEL_WIDTH, height: Math.max(b.height - top - STATUSBAR_HEIGHT, 100) };
}

// ── 1. Varsayılan düzen değişmedi ─────────────────────────────────────────
console.log('\n\x1b[1m1) Varsayılan düzen — eski formülle piksel piksel aynı\x1b[0m');
{
  const PENCERELER = [{ width: 1280, height: 800 }, { width: 1920, height: 1040 }, { width: 900, height: 600 }, { width: 2560, height: 1400 }];
  const SOLLAR = [56, 56 + 240, 56 + 52];     // yalnız kenar çubuğu, dikey sekmeler, dar dikey sekmeler
  let ayni = true, fark = '';
  for (const p of PENCERELER) for (const sol of SOLLAR) for (const panel of [false, true]) {
    // Bugünkü arayüzün ölçeceği değerler: üst 128, sağ 0, alt 24.
    const yer = Y.yerlesimDenetle({ left: sol, top: 128, right: 0, bottom: 24, panelSide: 'right' }, YEDEK);
    const yeni = Y.icerikDikdortgeni(p, yer, panel, PANEL_WIDTH, YEDEK);
    const eski = eskiContentRect(p, sol, panel);
    if (g(yeni) !== g(eski)) { ayni = false; fark = g({ p, sol, panel, yeni, eski }); }
  }
  ol('⛔ sayfa dikdörtgeni: 4 pencere × 3 sol kenar × panel açık/kapalı — 24 durumun hepsi aynı', ayni, fark);
  ol('eski arayüz yalnız `left` gönderse de aynı sonuç (diğer kenarlar yedekten)',
     g(Y.icerikDikdortgeni({ width: 1280, height: 800 }, Y.yerlesimDenetle({ left: 56 }, YEDEK), false, PANEL_WIDTH, YEDEK)) === g(eskiContentRect({ width: 1280, height: 800 }, 56, false)));
  ol('ilk ölçüm gelmeden (yer yok) eski yedek davranış',
     g(Y.icerikDikdortgeni({ width: 1280, height: 800 }, null, true, PANEL_WIDTH, YEDEK)) === g(eskiContentRect({ width: 1280, height: 800 }, undefined, true)));
  const webAyni = PENCERELER.every((p) => g(Y.webPanelDikdortgeni(p, Y.yerlesimDenetle({ left: 56, top: 128, right: 0, bottom: 24 }, YEDEK), PANEL_WIDTH, WEB_BASLIK, YEDEK)) === g(eskiWebPanelRect(p)));
  ol('web paneli dikdörtgeni de aynı', webAyni);
}

// ── 2. Yeni konumlar ──────────────────────────────────────────────────────
console.log('\n\x1b[1m2) Kenar çubuğu başka yerdeyken sayfa doğru yerde\x1b[0m');
{
  const P = { width: 1280, height: 800 };
  const sag = Y.yerlesimDenetle({ left: 0, top: 128, right: 56, bottom: 24, panelSide: 'left' }, YEDEK);
  ol('sağda: sayfa sol kenardan başlar, sağdan çubuk kadar dar', g(Y.icerikDikdortgeni(P, sag, false, PANEL_WIDTH, YEDEK)) === g({ x: 0, y: 128, width: 1224, height: 648 }));
  ol('sağda + panel açık: panel SOLDA, sayfa panelin sağından başlar', g(Y.icerikDikdortgeni(P, sag, true, PANEL_WIDTH, YEDEK)) === g({ x: 420, y: 128, width: 804, height: 648 }));
  ol('sağda: web paneli de solda', Y.webPanelDikdortgeni(P, sag, PANEL_WIDTH, WEB_BASLIK, YEDEK).x === 0);
  const alt = Y.yerlesimDenetle({ left: 0, top: 128, right: 0, bottom: 24 + 56 }, YEDEK);
  ol('altta: tam genişlik, alttan çubuk kadar kısa', g(Y.icerikDikdortgeni(P, alt, false, PANEL_WIDTH, YEDEK)) === g({ x: 0, y: 128, width: 1280, height: 592 }));
  const ust = Y.yerlesimDenetle({ left: 0, top: 128 + 44, right: 0, bottom: 24 }, YEDEK);
  ol('üstte: tam genişlik, üstten çubuk kadar aşağıda', g(Y.icerikDikdortgeni(P, ust, false, PANEL_WIDTH, YEDEK)) === g({ x: 0, y: 172, width: 1280, height: 604 }));
  ol('üstte: web paneli de çubuğun altından başlar', Y.webPanelDikdortgeni(P, ust, PANEL_WIDTH, WEB_BASLIK, YEDEK).y === 172 + WEB_BASLIK);
  const iki = Y.yerlesimDenetle({ left: 56, top: 128, right: 56, bottom: 24 }, YEDEK);
  ol('iki kenar çubuğu: iki yandan daralır, sağ panel sağ çubuğun içinden açılır',
     g(Y.icerikDikdortgeni(P, iki, false, PANEL_WIDTH, YEDEK)) === g({ x: 56, y: 128, width: 1168, height: 648 })
     && Y.webPanelDikdortgeni(P, iki, PANEL_WIDTH, WEB_BASLIK, YEDEK).x === 1280 - 56 - 420);
}

// ── 3. Bozuk ölçüm ────────────────────────────────────────────────────────
console.log('\n\x1b[1m3) Bozuk ölçüm sayfayı kaybettiremez\x1b[0m');
{
  const BOZUK = [null, 5, 'x', {}, { top: 10 }, { left: -1 }, { left: 900 }, { left: NaN }, { left: 56, top: -5 },
                 { left: 56, bottom: 'çok' }, { left: 56, right: 1e9 }];
  ol('geçersiz ölçüm → null (sayfa eski yerinde kalır)', BOZUK.every((b) => Y.yerlesimDenetle(b, YEDEK) === null),
     g(BOZUK.filter((b) => Y.yerlesimDenetle(b, YEDEK) !== null)));
  ol('panelSide yalnız "left" ya da "right"', Y.yerlesimDenetle({ left: 0, panelSide: 'üst' }, YEDEK).panelSide === 'right');
  const kucuk = Y.icerikDikdortgeni({ width: 150, height: 120 }, Y.yerlesimDenetle({ left: 56, top: 128, right: 0, bottom: 24 }, YEDEK), true, PANEL_WIDTH, YEDEK);
  ol('çok küçük pencerede bile en az 100×100 (görünmez olmaz)', kucuk.width >= 100 && kucuk.height >= 100, g(kucuk));
}

console.log(`\n${kalan ? '\x1b[31m' : '\x1b[32m'}SONUÇ: ${gecen} geçti · ${kalan} kaldı\x1b[0m`);
process.exit(kalan ? 1 : 0);
