/**
 * İlgezdi — Okuma modu (saf mantık, Electron'a bağımlı değil).
 *
 * Akış: makale Mozilla Readability ile sayfanın YALITILMIŞ dünyasında çıkarılır (sayfa
 * betikleri bu koda dokunamaz) ve HTML olarak değil, izin verilen etiketlerden oluşan düz
 * bir ağaç olarak döner (readerNodesFrom). Ana süreç ağacı yeniden doğrular
 * (validateReaderNodes: sayfanın süreci ele geçirilmiş olsa bile yalnızca bilinen etiketler
 * ve http(s) adresler geçer), resimleri sekmenin oturumuyla çerezsiz indirip data: adresi
 * olarak gömer (gizli pencerede kalıcı önbelleğe iz kalmasın). Arayüz ağacı innerHTML
 * kullanmadan createElement ile çizer.
 *
 * Ağaç biçimi: metin → string; öğe → [etiket, nitelikler | null, çocuklar].
 */

'use strict';

const READER_TAGS = Object.freeze([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'em', 'i', 'strong', 'b', 'u', 's', 'sub', 'sup', 'small', 'mark', 'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'dl', 'dt', 'dd', 'div',
]);
const READER_LIMITS = Object.freeze({ nodes: 8000, depth: 40, text: 400000, alt: 300 });
const VOID_TAGS = new Set(['br', 'hr', 'img']);

/**
 * Makale öğesini ağaca çevirir. Kaynağı toString ile sayfaya da gönderilir: dışarıdaki hiçbir
 * değişkene dayanmaz, yalnızca nodeType, nodeName, childNodes, getAttribute ve textContent
 * kullanır (tarayıcı DOM'unda ve Readability'nin JSDOMParser'ında aynı çalışır).
 * Bilinmeyen sarmalayıcılar (span, section…) atılır, içerikleri korunur; betik, stil,
 * çerçeve, form ve gömülü nesneler içerikleriyle birlikte atılır.
 */
function readerNodesFrom(root, baseUrl) {
  const ALLOWED = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'em', 'i', 'strong', 'b', 'u', 's', 'sub', 'sup', 'small', 'mark', 'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'dl', 'dt', 'dd', 'div'];
  const DROP = ['script', 'style', 'noscript', 'template', 'iframe', 'frame', 'object', 'embed', 'svg', 'math', 'video',
    'audio', 'canvas', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'head', 'title', 'dialog'];
  const LIM = { nodes: 8000, depth: 40, text: 400000, alt: 300 };
  let count = 0;
  let text = 0;
  const abs = (value) => {
    try {
      const u = new URL(String(value || '').trim(), baseUrl);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
    } catch (e) { return ''; }
  };
  function walk(node, depth) {
    const out = [];
    const kids = (node && node.childNodes) || [];
    for (let i = 0; i < kids.length; i++) {
      if (count >= LIM.nodes || text >= LIM.text) break;
      const k = kids[i];
      if (k.nodeType === 3) {
        const v = String(k.textContent || '');
        if (!v) continue;
        count++;
        text += v.length;
        out.push(v);
        continue;
      }
      if (k.nodeType !== 1 || depth >= LIM.depth) continue;
      const tag = String(k.nodeName || '').toLowerCase();
      if (DROP.indexOf(tag) >= 0) continue;
      if (ALLOWED.indexOf(tag) < 0) {
        const inner = walk(k, depth + 1);
        for (let j = 0; j < inner.length; j++) out.push(inner[j]);
        continue;
      }
      let attrs = null;
      if (tag === 'a') {
        const href = abs(k.getAttribute('href'));
        if (href) attrs = { href: href };
      } else if (tag === 'img') {
        const src = abs(k.getAttribute('src'));
        if (!src) continue;
        attrs = { src: src };
        const alt = k.getAttribute('alt');
        if (alt) attrs.alt = String(alt).slice(0, LIM.alt);
      }
      count++;
      out.push([tag, attrs, tag === 'br' || tag === 'hr' || tag === 'img' ? [] : walk(k, depth + 1)]);
    }
    return out;
  }
  return walk(root, 0);
}

const isHttp = (v) => typeof v === 'string' && /^https?:\/\/[^\s]+$/i.test(v) && v.length <= 4096;

/** Ana süreçte yeniden doğrulama: biçime, etiketlere ve adreslere uymayan her şey atılır. */
function validateReaderNodes(nodes) {
  let count = 0;
  let text = 0;
  function walk(list, depth) {
    const out = [];
    if (!Array.isArray(list) || depth > READER_LIMITS.depth) return out;
    for (const n of list) {
      if (count >= READER_LIMITS.nodes || text >= READER_LIMITS.text) break;
      if (typeof n === 'string') {
        if (!n) continue;
        const v = n.slice(0, READER_LIMITS.text - text);
        count++;
        text += v.length;
        out.push(v);
        continue;
      }
      if (!Array.isArray(n) || n.length !== 3 || !READER_TAGS.includes(n[0])) continue;
      const [tag, rawAttrs, kids] = n;
      let attrs = null;
      if (tag === 'a' && rawAttrs && isHttp(rawAttrs.href)) attrs = { href: rawAttrs.href };
      if (tag === 'img') {
        if (!rawAttrs || !isHttp(rawAttrs.src)) continue;
        attrs = { src: rawAttrs.src };
        if (typeof rawAttrs.alt === 'string' && rawAttrs.alt) attrs.alt = rawAttrs.alt.slice(0, READER_LIMITS.alt);
      }
      count++;
      out.push([tag, attrs, VOID_TAGS.has(tag) ? [] : walk(kids, depth + 1)]);
    }
    return out;
  }
  return walk(nodes, 0);
}

function readerTextLength(nodes) {
  let n = 0;
  (function walk(list) {
    for (const x of list) {
      if (typeof x === 'string') n += x.trim().length;
      else if (Array.isArray(x)) walk(x[2] || []);
    }
  })(nodes);
  return n;
}

/** Okuma süresi (dakika): Türkçe metinde dakikada yaklaşık 1200 karakter. */
function readingMinutes(nodes) {
  return Math.max(1, Math.round(readerTextLength(nodes) / 1200));
}

function collectImageUrls(nodes, max = 30) {
  const urls = [];
  (function walk(list) {
    for (const x of list) {
      if (urls.length >= max) return;
      if (!Array.isArray(x)) continue;
      if (x[0] === 'img' && x[1] && isHttp(x[1].src) && !urls.includes(x[1].src)) urls.push(x[1].src);
      walk(x[2] || []);
    }
  })(nodes);
  return urls;
}

/** İndirilen resmi türünü baytlardan tanıyarak data: adresine çevirir; tanınmazsa null. */
function imageDataUrl(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  const b = buffer;
  let mime = null;
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) mime = 'image/png';
  else if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) mime = 'image/jpeg';
  else if (b.length > 6 && b.slice(0, 4).toString('latin1') === 'GIF8') mime = 'image/gif';
  else if (b.length > 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') mime = 'image/webp';
  else if (b.length > 12 && b.slice(4, 8).toString('latin1') === 'ftyp' && /^avi[fs]$/.test(b.slice(8, 12).toString('latin1'))) mime = 'image/avif';
  // SVG <img> içinde betik çalıştıramaz; yine de yalnızca sunucu SVG dediyse ve metin gibi başlıyorsa.
  else if (/image\/svg\+xml/i.test(String(contentType || '')) && /^\s*(<\?xml|<svg|<!--)/i.test(b.slice(0, 200).toString('utf8'))) mime = 'image/svg+xml';
  return mime ? `data:${mime};base64,${b.toString('base64')}` : null;
}

/**
 * Resimleri indirir. fetchFn(url) → Response benzeri ({ ok, headers.get, arrayBuffer }).
 * Sınırlar: resim başına 5 MB, toplam 30 MB, aynı anda 4 istek.
 */
async function fetchReaderImages(urls, fetchFn, { maxBytes = 5 * 1024 * 1024, totalBytes = 30 * 1024 * 1024, concurrency = 4 } = {}) {
  const out = new Map();
  let used = 0;
  const queue = urls.filter(isHttp);
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        const res = await fetchFn(url);
        if (!res || !res.ok) continue;
        const declared = Number(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
        if (declared > maxBytes || used + declared > totalBytes) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > maxBytes || used + buf.length > totalBytes) continue;
        const dataUrl = imageDataUrl(buf, res.headers && res.headers.get && res.headers.get('content-type'));
        if (!dataUrl) continue;
        used += buf.length;
        out.set(url, dataUrl);
      } catch (e) { /* indirilemeyen resim atlanır */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return out;
}

/** Resim adreslerini indirilen data: adresleriyle değiştirir; indirilemeyen resimler atılır. */
function embedImages(nodes, images) {
  const walk = (list) => list.flatMap((x) => {
    if (typeof x === 'string') return [x];
    const [tag, attrs, kids] = x;
    if (tag === 'img') {
      const data = attrs && images.get(attrs.src);
      return data ? [['img', { src: data, ...(attrs.alt ? { alt: attrs.alt } : {}) }, []]] : [];
    }
    return [[tag, attrs, walk(kids)]];
  });
  return walk(nodes);
}

/** Sayfanın yalıtılmış dünyasında çalışan çıkarma betiği. */
function buildExtractScript(readabilitySource) {
  return `(() => {
${readabilitySource}
const readerNodesFrom = ${readerNodesFrom.toString()};
try {
  if (!document.body) return null;
  const article = new Readability(document.cloneNode(true), { charThreshold: 500, serializer: (el) => el }).parse();
  if (!article || !article.content) return null;
  return {
    title: String(article.title || document.title || '').slice(0, 300),
    byline: String(article.byline || '').slice(0, 200),
    siteName: String(article.siteName || '').slice(0, 120),
    lang: String(article.lang || document.documentElement.lang || '').slice(0, 20),
    dir: article.dir === 'rtl' ? 'rtl' : 'ltr',
    nodes: readerNodesFrom(article.content, document.baseURI),
  };
} catch (e) {
  return { error: String((e && e.message) || e).slice(0, 200) };
}
})()`;
}

module.exports = {
  READER_TAGS, READER_LIMITS, readerNodesFrom, validateReaderNodes, readerTextLength, readingMinutes,
  collectImageUrls, imageDataUrl, fetchReaderImages, embedImages, buildExtractScript,
};
