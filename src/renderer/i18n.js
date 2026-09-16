/**
 * İlgezdi — çok dilli arayüz çekirdeği (arayüz ve ana süreç ortak).
 *
 * Metinler src/locales/<dil>.json dosyalarındadır; kaynak dil Türkçedir. Bir dilde eksik
 * anahtar Türkçeden, Türkçede de yoksa anahtarın kendisi gösterilir (testler bunu yakalar).
 *
 * Değer biçimi:
 *   "Kaydet"                                   düz metin
 *   "{count} sekme açık"                       parametre ({ad} → params.ad)
 *   { "one": "{count} tab", "other": "..." }   tekil/çoğul: Intl.PluralRules ile seçilir
 *                                              (Türkçe tek biçim kullanır; İngilizce iki)
 *
 * Arayüzde (window):
 *   T(key, params)             düz metin (textContent, title için)
 *   TH(key, params, html)      HTML'e girecek metin: çeviri ve parametreler kaçışlanır;
 *                              yalnızca üçüncü argümandaki değerler (kod üretir) olduğu gibi girer
 *   data-i18n="key"            sabit HTML öğesinin metni; data-i18n-title, -aria-label,
 *                              -placeholder öznitelikler için
 *
 * Arapça bilerek listede yok: sağdan sola arayüz ayrı bir iş (Burak, 16.09.2026: "sonra").
 */

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ilgezdiI18nCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const LANGUAGES = Object.freeze([
    { code: 'tr', name: 'Türkçe', intl: 'tr-TR' },
    { code: 'en', name: 'English', intl: 'en-US' },
    { code: 'az', name: 'Azərbaycan dili', intl: 'az-Latn-AZ' },
    { code: 'kk', name: 'Қазақ тілі', intl: 'kk-KZ' },
    { code: 'uz', name: 'Oʻzbekcha', intl: 'uz-Latn-UZ' },
    { code: 'tk', name: 'Türkmen dili', intl: 'tk-TM' },
    { code: 'ky', name: 'Кыргызча', intl: 'ky-KG' },
    { code: 'de', name: 'Deutsch', intl: 'de-DE' },
    { code: 'fr', name: 'Français', intl: 'fr-FR' },
  ].map(Object.freeze));
  const SOURCE_LANGUAGE = 'tr';
  // Desteklenmeyen bir Türk dili sistemde Türkçe açılır; diğer desteklenmeyen diller İngilizce.
  const TURKIC = new Set(['tr', 'az', 'kk', 'uz', 'tk', 'ky', 'tt', 'ba', 'cv', 'ug', 'sah', 'crh', 'gag', 'alt', 'tyv', 'kjh', 'krc', 'kum', 'nog', 'kaa']);

  const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const languageInfo = (code) => LANGUAGES.find((l) => l.code === code) || null;

  /** Ayar ('auto' ya da kod) ve sistem dilleri → kullanılacak dil kodu. */
  function resolveLanguage(setting, systemLanguages) {
    if (languageInfo(setting)) return setting;
    const bases = (Array.isArray(systemLanguages) ? systemLanguages : [])
      .map((tag) => String(tag || '').toLowerCase().split(/[-_]/)[0]).filter(Boolean);
    for (const base of bases) if (languageInfo(base)) return base;
    for (const base of bases) if (TURKIC.has(base)) return SOURCE_LANGUAGE;
    return bases.length ? 'en' : SOURCE_LANGUAGE;
  }

  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"'`]/g, (c) => HTML_ESC[c]);

  function createTranslator(locale, messages, fallbackMessages) {
    const info = languageInfo(locale) || languageInfo(SOURCE_LANGUAGE);
    let plural = null;
    let numbers = null;
    try { plural = new Intl.PluralRules(info.intl); } catch (e) { plural = null; }
    try { numbers = new Intl.NumberFormat(info.intl); } catch (e) { numbers = null; }

    function raw(key, params) {
      let v = hasOwn(messages, key) ? messages[key] : hasOwn(fallbackMessages, key) ? fallbackMessages[key] : undefined;
      if (v === undefined || v === null) return String(key);
      if (typeof v === 'object') {
        const n = Number(params && params.count);
        const cat = plural && Number.isFinite(n) ? plural.select(n) : 'other';
        v = hasOwn(v, cat) ? v[cat] : v.other;
        if (v === undefined) return String(key);
      }
      return String(v);
    }
    const formatParam = (value) => (typeof value === 'number' && numbers ? numbers.format(value) : String(value));

    /** Düz metin. */
    function T(key, params) {
      return raw(key, params).replace(/\{(\w+)\}/g, (m, name) => (params && hasOwn(params, name) ? formatParam(params[name]) : m));
    }

    /** HTML bağlamı: çeviri ve params kaçışlanır; html içindeki değerler olduğu gibi girer. */
    function TH(key, params, html) {
      return raw(key, params).split(/(\{\w+\})/).map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return esc(part);
        if (html && hasOwn(html, m[1])) return String(html[m[1]]);
        if (params && hasOwn(params, m[1])) return esc(formatParam(params[m[1]]));
        return esc(part);
      }).join('');
    }

    const has = (key) => hasOwn(messages, key) || hasOwn(fallbackMessages, key);
    return { locale: info.code, intl: info.intl, T, TH, has };
  }

  /** Sabit HTML: data-i18n (metin) ve data-i18n-title / -aria-label / -placeholder öznitelikleri. */
  function translateDom(root, T) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = T(el.getAttribute('data-i18n'));
    for (const [attr, name] of [['data-i18n-title', 'title'], ['data-i18n-aria-label', 'aria-label'], ['data-i18n-placeholder', 'placeholder']]) {
      for (const el of root.querySelectorAll('[' + attr + ']')) el.setAttribute(name, T(el.getAttribute(attr)));
    }
  }

  return { LANGUAGES, SOURCE_LANGUAGE, resolveLanguage, createTranslator, translateDom, languageInfo, escapeHtml: esc };
});

// Arayüz penceresi: ön yükleme ana süreçten dil paketini verir (window.ilgezdiLocale).
if (typeof window !== 'undefined' && window.document && window.ilgezdiI18nCore) {
  (function () {
    const core = window.ilgezdiI18nCore;
    const bundle = window.ilgezdiLocale || { locale: 'tr', messages: {} };
    const tr = core.createTranslator(bundle.locale, bundle.messages || {}, {});
    window.T = tr.T;
    window.TH = tr.TH;
    window.ilgezdiI18n = Object.freeze({
      locale: tr.locale,
      intl: tr.intl,
      T: tr.T,
      TH: tr.TH,
      has: tr.has,
      languages: core.LANGUAGES,
      translate: (root) => core.translateDom(root || document, tr.T),
      formatNumber: (n, opts) => { try { return new Intl.NumberFormat(tr.intl, opts).format(n); } catch (e) { return String(n); } },
      formatDate: (d, opts) => { try { return new Date(d).toLocaleDateString(tr.intl, opts); } catch (e) { return ''; } },
      formatTime: (d, opts) => { try { return new Date(d).toLocaleTimeString(tr.intl, opts); } catch (e) { return ''; } },
      formatDateTime: (d, opts) => { try { return new Date(d).toLocaleString(tr.intl, opts); } catch (e) { return ''; } },
    });
    document.documentElement.lang = tr.locale;
    const run = () => core.translateDom(document, tr.T);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  })();
}
