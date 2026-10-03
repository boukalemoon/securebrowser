'use strict';
/**
 * İlgezdi — pencere yerleşimi: sayfa görünümünün ve web panelinin yeri (saf mantık).
 *
 * Sayfa (WebContentsView) arayüzün ÜSTÜNDE çizilir; arayüz kendi içerik alanının
 * (#content-area) dört kenarını ölçüp bildirir (app.js contentInsets → ui-layout),
 * sayfa o dikdörtgene yerleşir.
 *
 * ⛔ NEDEN DÖRT KENAR (Burak, 03.10.2026 — menü yerleşimini özelleştirme): eskiden
 *    yalnız sol kenar bildiriliyordu; üst (128 = başlık + araç çubuğu + yer imleri)
 *    ve alt (24 = durum çubuğu) burada SABİT yazılıydı. Kenar çubuğu alta, üste ya
 *    da sağa taşınınca sayfa ya araç çubuğunun altında kalır ya da boşluk bırakırdı.
 *    Artık sabitler yalnız ilk ölçüm gelene kadar kullanılan yedektir.
 *
 * Yan paneller (Ülgen, Not Defteri, Ayarlar…) içerik alanının içinde bir kenara
 * yaslanır; panel açıkken sayfa o kenardan panel genişliği kadar daralır. Kenar
 * çubuğu sağdayken paneller soldan açılır (panelSide).
 */

// Ölçülen bir kenar bu sınırların dışındaysa arayüz bozuk bir değer göndermiştir:
// yok sayılır (sayfa eski yerinde kalır, görünmez olmaz).
const KENAR_SINIRI = 800;

/**
 * Arayüzden gelen yerleşimi doğrular. Eski arayüz yalnız `left` gönderir; eksik
 * kenar yedekten gelir. Geçersiz `left` → null (hiçbir şey değişmez).
 * @param {object} gelen  { left, top?, right?, bottom?, panelSide? }
 * @param {object} yedek  { left, top, right, bottom, panelSide }
 */
function yerlesimDenetle(gelen, yedek) {
  if (!gelen || typeof gelen !== 'object') return null;
  const kenar = (ad, ust) => {
    if (gelen[ad] === undefined) return yedek[ad];
    const n = Number(gelen[ad]);
    return Number.isFinite(n) && n >= 0 && n <= ust ? Math.round(n) : NaN;
  };
  const sonuc = {
    left: kenar('left', KENAR_SINIRI),
    top: kenar('top', KENAR_SINIRI),
    right: kenar('right', KENAR_SINIRI),
    bottom: kenar('bottom', KENAR_SINIRI),
    panelSide: gelen.panelSide === 'left' ? 'left' : 'right',
  };
  if (gelen.left === undefined) return null;          // sol kenarsız ölçüm anlamsız
  if (['left', 'top', 'right', 'bottom'].some((k) => !Number.isFinite(sonuc[k]))) return null;
  return sonuc;
}

/**
 * Sayfa görünümünün dikdörtgeni.
 * @param {{width:number,height:number}} pencere  win.getContentBounds()
 * @param {object|null} yer  doğrulanmış yerleşim (yoksa yedek)
 * @param {boolean} panelAcik
 * @param {number} panelGenisligi
 * @param {object} yedek
 */
function icerikDikdortgeni(pencere, yer, panelAcik, panelGenisligi, yedek) {
  const y = yer || yedek;
  const kullanilabilir = pencere.width - y.left - y.right;
  const solaPanel = panelAcik && y.panelSide === 'left';
  return {
    x: y.left + (solaPanel ? panelGenisligi : 0),
    y: y.top,
    width: panelAcik ? Math.max(kullanilabilir - panelGenisligi, 100) : Math.max(kullanilabilir, 100),
    height: Math.max(pencere.height - y.top - y.bottom, 100),
  };
}

/**
 * Web panelinin (WhatsApp, Telegram…) dikdörtgeni: yan panelle aynı kenarda, panel
 * başlığının altında.
 */
function webPanelDikdortgeni(pencere, yer, panelGenisligi, baslikYuksekligi, yedek) {
  const y = yer || yedek;
  const ust = y.top + baslikYuksekligi;
  const x = y.panelSide === 'left' ? y.left : pencere.width - y.right - panelGenisligi;
  return {
    x: Math.max(x, 0),
    y: ust,
    width: panelGenisligi,
    height: Math.max(pencere.height - ust - y.bottom, 100),
  };
}

module.exports = { yerlesimDenetle, icerikDikdortgeni, webPanelDikdortgeni, KENAR_SINIRI };
