/**
 * İlgezdi — Arayüz erişilebilirlik tabanı
 *
 * Karşılaştırma taramasında arayüzün tamamında 3 aria-label vardı ve hiç role
 * özniteliği yoktu. Simge düğmeleri yalnızca title taşıyor. Ekran okuyucular
 * title'ı her zaman okumaz, yalnızca simge karakterli düğmeyi de ("✕", "─")
 * karakter adıyla okur.
 *
 * Paneller düğmelerini sonradan ürettiği için bu betik DOM değişikliklerini izler:
 *   • metni olmayan ya da yalnızca simge karakteri olan düğmeye title'dan aria-label
 *   • title'ı da olmayan kapat düğmesine "Kapat"
 *   • düğme ve bağlantı içindeki süs SVG'lerine aria-hidden
 * Bu bir güvenlik ağıdır: kalıcı etiketler yine işaretlemede yazılmalı.
 */
(function () {
  'use strict';

  var ONLY_SYMBOLS = /^[^\p{L}\p{N}]*$/u;
  var CLOSE_GLYPH = /^[×✕✖]$/;
  var AUTO = 'data-a11y-auto';   // etiketi bu betik koyduysa title değişince güncellenir

  function labelButton(b) {
    if (b.hasAttribute('aria-labelledby')) return;
    if (b.hasAttribute('aria-label') && !b.hasAttribute(AUTO)) return;
    var text = (b.textContent || '').replace(/\s+/g, '');
    if (text && !ONLY_SYMBOLS.test(text)) return;          // okunabilir metni var
    var title = (b.getAttribute('title') || '').trim();
    var label = title || (CLOSE_GLYPH.test(text) ? 'Kapat' : '');
    if (!label) return;
    b.setAttribute('aria-label', label);
    b.setAttribute(AUTO, '');
  }

  function hideDecoration(svg) {
    if (svg.hasAttribute('aria-hidden') || svg.hasAttribute('aria-label') || svg.querySelector('title')) return;
    svg.setAttribute('aria-hidden', 'true');
  }

  function scan(root) {
    if (!root || root.nodeType !== 1 || !root.isConnected) return;
    if (root.matches('button, [role="button"]')) labelButton(root);
    root.querySelectorAll('button, [role="button"]').forEach(labelButton);
    root.querySelectorAll('button svg, [role="button"] svg, a svg').forEach(hideDecoration);
  }

  var pending = new Set();
  var scheduled = false;
  function flush() {
    scheduled = false;
    pending.forEach(scan);
    pending.clear();
  }

  function start() {
    scan(document.body);
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === 'attributes') pending.add(r.target);
        r.addedNodes && r.addedNodes.forEach(function (n) { if (n.nodeType === 1) pending.add(n); });
      });
      if (!scheduled && pending.size) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
