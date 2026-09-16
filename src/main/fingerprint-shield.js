/**
 * İlgezdi — parmak izi koruması (Brave'in "farbling" yaklaşımı).
 *
 * Parmak izi betikleri tarayıcıyı çerez olmadan tanımak için tuval (canvas) çizimini,
 * ses işlemeyi ve donanım bilgilerini okuyup özetler. Bu değerleri engellemek siteleri
 * bozar; bunun yerine okunan değerlere gözle ve kulakla fark edilmeyen, SİTE BAŞINA
 * farklı ama site içinde TUTARLI değişiklikler eklenir:
 *   • aynı site aynı oturumda hep aynı "parmak izini" görür (tekrar okuma tutarlı, sayfa bozulmaz),
 *   • başka bir site başka bir parmak izi görür → siteler arası eşleştirme yapılamaz,
 *   • uygulama yeniden açılınca parmak izi değişir → günler arası takip yapılamaz.
 *
 * Kapsam (sayfanın kendi dünyasında, sayfa betiklerinden önce):
 *   • tuval: getImageData, toDataURL, toBlob, OffscreenCanvas.convertToBlob — en fazla
 *     4 milyon piksellik tuvallerde, kabaca her 350 pikselden birinde tek renk kanalı ±1,
 *   • ses: AudioBuffer.getChannelData / copyFromChannel, AnalyserNode kayan noktalı
 *     çıktıları — duyulmayacak kadar küçük (1e-7) değişiklik,
 *   • navigator.hardwareConcurrency: 2 ile gerçek çekirdek sayısı arasında site başına sabit,
 *   • WebGL ekran kartı adı: üretici kalır, model adı çıkarılır ("NVIDIA GeForce GTX 1070" → "NVIDIA Graphics"),
 *   • değiştirilen işlevler Function.prototype.toString'de yerel kod gibi görünür.
 * Koruma kapalıyken de navigator.deviceMemory Chrome gibi en fazla 8 bildirilir (Electron
 * gerçek değeri veriyordu, ör. 32 — nadir ve ayırt edici).
 *
 * Tohum ana süreçte üretilir: oturum başına rastgele anahtar + üst sayfanın kayıtlı alan adı
 * (HMAC). Sayfa tohumu seçemez; alt çerçeveler üst sitenin tohumunu kullanır. Site Bilgisi'nde
 * "Bu sitede engelle" kapatılan sitelerde ve Ayarlar'da koruma kapalıyken yalnızca
 * deviceMemory sınırı uygulanır.
 *
 * Kapsam dışı: Web Worker içindeki OffscreenCanvas, yazı tipi listesi, ekran çözünürlüğü,
 * saat dilimi (bunları değiştirmek siteleri belirgin biçimde bozar).
 */

'use strict';

const crypto = require('crypto');

/**
 * Sayfanın kendi dünyasında çalışır: kendi başına yeterli olmalı (dış değişken kullanmaz),
 * çünkü metni ön yükleme betiğiyle sayfaya enjekte edilir. Testler sahte bir pencere
 * nesnesiyle çağırıp yardımcıları kullanır.
 * @param {{farble: boolean, seed: string}} cfg
 * @param {object} [W] pencere (varsayılan: globalThis)
 */
function installShield(cfg, W) {
  W = W || globalThis;
  const farble = !!(cfg && cfg.farble);
  const seedText = String((cfg && cfg.seed) || '');
  const MAX_PIXELS = 4000000;

  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  const SEED = hash32(seedText);
  function mix(a, b) {
    let h = (SEED ^ Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77)) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return h >>> 0;
  }

  // Seyrek kafes: mutlak koordinata bağlı olduğu için aynı pikseller hangi bölge okunursa okunsun aynı değişir.
  const SX = 13, SY = 7;
  const OX = SEED % SX, OY = (SEED >>> 8) % SY;
  const mod = (a, m) => ((a % m) + m) % m;
  function nudge(data, i, h) {
    const c = (h >>> 2) % 3;
    const v = data[i + c];
    data[i + c] = ((h >>> 4) & 1) ? (v === 255 ? 254 : v + 1) : (v === 0 ? 1 : v - 1);
  }
  /** RGBA piksel dizisine (x0, y0 mutlak başlangıç) gürültü ekler; değişen piksel sayısını döndürür. */
  function farblePixels(data, width, height, x0, y0) {
    if (!data || width <= 0 || height <= 0 || width * height > MAX_PIXELS) return 0;
    let changed = 0;
    for (let ry = mod(OY - y0, SY); ry < height; ry += SY) {
      const ay = y0 + ry;
      for (let rx = mod(OX + mod(ay, 5) - x0, SX); rx < width; rx += SX) {
        const h = mix(x0 + rx, ay);
        if (h & 3) continue;
        const i = (ry * width + rx) * 4;
        if (data[i + 3] === 0) continue;   // tamamen saydam pikselin rengi dışa aktarımda kaybolur
        nudge(data, i, h);
        changed++;
      }
    }
    // Küçük, çoğu saydam tuvallerde (yalnızca yazı) kafes hiçbir opak piksele denk gelmeyebilir:
    // tohumla seçilen yerden başlayıp ilk tam opak pikseli değiştir.
    if (!changed && width * height <= 262144) {
      const total = width * height;
      const start = mix(width, height) % total;
      for (let k = 0; k < total; k++) {
        const p = (start + k) % total;
        if (data[p * 4 + 3] === 255) { nudge(data, p * 4, mix(x0 + (p % width), y0 + Math.floor(p / width))); changed = 1; break; }
      }
    }
    return changed;
  }
  /** Ses örneklerine (mutlak başlangıç offset) duyulmaz gürültü. */
  function farbleSamples(arr, offset, channel) {
    if (!arr) return;
    for (let i = mod(97 - mod(offset, 97) + (SEED % 97), 97); i < arr.length; i += 97) {
      const h = mix(offset + i, channel + 1);
      if (h & 1) arr[i] += ((h >>> 1) & 1) ? 1e-7 : -1e-7;
    }
  }
  function concurrencyFor(real) {
    const n = Number(real) || 0;
    return n <= 2 ? n : 2 + (SEED % (n - 1));
  }
  function generalizeRenderer(text) {
    const m = /^ANGLE \(([^,]+),\s*(.+),\s*([^,]+)\)$/.exec(String(text));
    if (!m) return 'ANGLE (Generic Graphics)';
    const vendor = m[1].trim();
    return 'ANGLE (' + vendor + ', ' + vendor + ' Graphics, ' + m[3].trim() + ')';
  }
  const helpers = { farblePixels, farbleSamples, concurrencyFor, generalizeRenderer, seed: SEED };

  const FP = W.Function && W.Function.prototype;
  if (!FP || typeof W.Navigator !== 'function') return helpers;

  // ── Yerel görünüm: değiştirilen işlevler toString'de özgün metni verir ──
  const nativeToString = FP.toString;
  const masks = new WeakMap();
  const toStringShim = { toString() { const o = masks.get(this); return nativeToString.call(typeof o === 'function' ? o : this); } }.toString;
  masks.set(toStringShim, nativeToString);
  try { Object.defineProperty(FP, 'toString', { value: toStringShim, writable: true, configurable: true, enumerable: false }); } catch (e) { /* değiştirilemezse maskesiz devam */ }
  function masked(fn, orig) {
    masks.set(fn, orig);
    try {
      Object.defineProperty(fn, 'name', { value: orig.name, configurable: true });
      Object.defineProperty(fn, 'length', { value: orig.length, configurable: true });
    } catch (e) { /* yok say */ }
    return fn;
  }
  function wrapMethod(proto, name, make) {
    if (!proto) return;
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.value !== 'function') return;
    const orig = d.value;
    Object.defineProperty(proto, name, { ...d, value: masked(make(orig), orig) });
  }
  function wrapGetter(proto, name, make) {
    if (!proto) return;
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.get !== 'function') return;
    Object.defineProperty(proto, name, { ...d, get: masked(make(d.get), d.get) });
  }

  // ── Her zaman: deviceMemory Chrome gibi en fazla 8 ──
  wrapGetter(W.Navigator.prototype, 'deviceMemory', (get) => function () {
    const v = get.call(this);
    return typeof v === 'number' && v > 8 ? 8 : v;
  });

  if (!farble) return helpers;

  // ── Donanım ──
  wrapGetter(W.Navigator.prototype, 'hardwareConcurrency', (get) => function () { return concurrencyFor(get.call(this)); });

  // ── Tuval ──
  const createElement = W.Document && W.Document.prototype.createElement;
  const C2D = W.CanvasRenderingContext2D && W.CanvasRenderingContext2D.prototype;
  const O2D = W.OffscreenCanvasRenderingContext2D && W.OffscreenCanvasRenderingContext2D.prototype;
  const origGetImageData = C2D && C2D.getImageData;
  const origPutImageData = C2D && C2D.putImageData;
  const origDrawImage = C2D && C2D.drawImage;
  const origGetContext = W.HTMLCanvasElement && W.HTMLCanvasElement.prototype.getContext;

  const imageDataWrap = (orig) => function (sx, sy, sw, sh) {
    const img = orig.apply(this, arguments);
    try {
      const x0 = Math.floor(Number(sw) < 0 ? Number(sx) + Number(sw) : Number(sx)) || 0;
      const y0 = Math.floor(Number(sh) < 0 ? Number(sy) + Number(sh) : Number(sy)) || 0;
      farblePixels(img.data, img.width, img.height, x0, y0);
    } catch (e) { /* özgün sonuç */ }
    return img;
  };
  wrapMethod(C2D, 'getImageData', imageDataWrap);
  wrapMethod(O2D, 'getImageData', imageDataWrap);

  // Tuvalin gürültülü kopyası (özgün tuval ekranda değişmez). Kirli (başka kaynaktan resim
  // içeren) tuvalde getImageData hata verir → null → özgün işlev kendi hatasını verir.
  function farbledCopy(canvas) {
    const w = canvas.width, h = canvas.height;
    if (!w || !h || w * h > MAX_PIXELS || !createElement || !origGetContext) return null;
    const doc = canvas.ownerDocument || W.document;
    const copy = createElement.call(doc, 'canvas');
    copy.width = w; copy.height = h;
    const ctx = origGetContext.call(copy, '2d');
    origDrawImage.call(ctx, canvas, 0, 0);
    const img = origGetImageData.call(ctx, 0, 0, w, h);
    farblePixels(img.data, w, h, 0, 0);
    origPutImageData.call(ctx, img, 0, 0);
    return copy;
  }
  const exportWrap = (orig) => function () {
    let copy = null;
    try { copy = farbledCopy(this); } catch (e) { copy = null; }
    return orig.apply(copy || this, arguments);
  };
  if (W.HTMLCanvasElement) {
    wrapMethod(W.HTMLCanvasElement.prototype, 'toDataURL', exportWrap);
    wrapMethod(W.HTMLCanvasElement.prototype, 'toBlob', exportWrap);
  }
  if (W.OffscreenCanvas && O2D) {
    const origOffGetContext = W.OffscreenCanvas.prototype.getContext;
    const oGet = O2D.getImageData, oPut = O2D.putImageData, oDraw = O2D.drawImage;
    wrapMethod(W.OffscreenCanvas.prototype, 'convertToBlob', (orig) => function () {
      let copy = null;
      try {
        const w = this.width, h = this.height;
        if (w && h && w * h <= MAX_PIXELS) {
          copy = new W.OffscreenCanvas(w, h);
          const ctx = origOffGetContext.call(copy, '2d');
          oDraw.call(ctx, this, 0, 0);
          const img = oGet.call(ctx, 0, 0, w, h);
          farblePixels(img.data, w, h, 0, 0);
          oPut.call(ctx, img, 0, 0);
        }
      } catch (e) { copy = null; }
      return orig.apply(copy || this, arguments);
    });
  }

  // ── WebGL ekran kartı adı ──
  const glParam = (orig) => function (p) {
    const v = orig.apply(this, arguments);
    return p === 0x9246 && typeof v === 'string' ? generalizeRenderer(v) : v;   // UNMASKED_RENDERER_WEBGL
  };
  if (W.WebGLRenderingContext) wrapMethod(W.WebGLRenderingContext.prototype, 'getParameter', glParam);
  if (W.WebGL2RenderingContext) wrapMethod(W.WebGL2RenderingContext.prototype, 'getParameter', glParam);

  // ── Ses ──
  if (W.AudioBuffer) {
    const AB = W.AudioBuffer.prototype;
    const done = new WeakMap();
    const origGetChannelData = AB.getChannelData;
    wrapMethod(AB, 'getChannelData', (orig) => function (channel) {
      const arr = orig.apply(this, arguments);
      try {
        let set = done.get(this);
        if (!set) done.set(this, (set = new Set()));
        const ch = Number(channel) | 0;
        if (!set.has(ch)) { set.add(ch); farbleSamples(arr, 0, ch); }
      } catch (e) { /* özgün veri */ }
      return arr;
    });
    // Kopyalamadan önce kanal bir kez gürültülenir: getChannelData ile tutarlı sonuç.
    wrapMethod(AB, 'copyFromChannel', (orig) => function (dest, channel) {
      try { AB.getChannelData.call(this, channel); } catch (e) { /* özgün davranış */ }
      return orig.apply(this, arguments);
    });
    void origGetChannelData;
  }
  if (W.AnalyserNode) {
    const AN = W.AnalyserNode.prototype;
    const floatWrap = (orig) => function (array) {
      const r = orig.apply(this, arguments);
      try { farbleSamples(array, 0, 7); } catch (e) { /* özgün veri */ }
      return r;
    };
    wrapMethod(AN, 'getFloatFrequencyData', floatWrap);
    wrapMethod(AN, 'getFloatTimeDomainData', floatWrap);
  }

  // ── Betikle oluşturulan aynı kaynaklı iframe'ler (about:blank): alt pencereye erişilince
  // korumayı orada da kur. Ön yükleme alt çerçevelerde de çalışır; bu yalnızca yedek.
  if (W.HTMLIFrameElement) {
    const IF = W.HTMLIFrameElement.prototype;
    const seen = new WeakSet();
    const guard = (win) => {
      try {
        if (!win || seen.has(win)) return;
        seen.add(win);
        const probe = win.HTMLCanvasElement && win.HTMLCanvasElement.prototype.toDataURL;
        if (probe && /\[native code\]/.test(nativeToString.call(probe))) installShield(cfg, win);
      } catch (e) { /* başka kaynaklı çerçeve: erişilemez */ }
    };
    wrapGetter(IF, 'contentWindow', (get) => function () { const w = get.call(this); guard(w); return w; });
    wrapGetter(IF, 'contentDocument', (get) => function () { const d = get.call(this); guard(d && d.defaultView); return d; });
  }
  return helpers;
}

/** Sayfaya enjekte edilecek betik metni (değer döndürmez: executeJavaScript sonucu seri hale getirir). */
function shieldScript(cfg) {
  return '(' + installShield.toString() + ')(' + JSON.stringify({ farble: !!cfg.farble, seed: String(cfg.seed || '') }) + '); void 0;';
}

/** Oturum başına rastgele anahtar + site → tohum. Anahtar diske yazılmaz. */
function createSeeder(randomBytes = crypto.randomBytes) {
  const keys = new WeakMap();
  return function seedFor(sessionObj, site) {
    let key = keys.get(sessionObj);
    if (!key) { key = randomBytes(32); keys.set(sessionObj, key); }
    return crypto.createHmac('sha256', key).update(String(site || '')).digest('hex').slice(0, 32);
  };
}

module.exports = { installShield, shieldScript, createSeeder };
