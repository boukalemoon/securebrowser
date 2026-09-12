/**
 * İlgezdi — Arayüz tarafı tanılama istemcisi
 *
 * Arayüzde oluşan hatalar şimdiye kadar TAMAMEN SESSİZ kayboluyordu: panel
 * kodundaki bir istisna yalnızca DevTools açıksa görülüyordu, kullanıcı ise
 * yalnızca "düğme çalışmıyor" yaşıyordu. Bu dosya o hataları ana sürece
 * iletir; oradan günlüğe yazılır ve (izin varsa) rapor edilir.
 *
 * Bu betik DİĞER TÜM betiklerden ÖNCE yüklenmelidir — yoksa yükleme sırasında
 * oluşan hatalar yakalanmaz.
 */

'use strict';

(function () {
  const sb = window.secureBrowser;
  if (!sb || !sb.diag) return;

  // Aynı hatanın döngüye girip ana süreci boğmasını engelle.
  const seen = new Map();
  const MAX_SAME = 3;
  const WINDOW_MS = 10000;

  function shouldReport(key) {
    const now = Date.now();
    const rec = seen.get(key);
    if (!rec || now - rec.first > WINDOW_MS) { seen.set(key, { first: now, count: 1 }); return true; }
    rec.count++;
    return rec.count <= MAX_SAME;
  }

  // ── Yakalanmamış hatalar ───────────────────────────────────────────────────
  window.addEventListener('error', (e) => {
    // Kaynak yükleme hatası (img/script) ile JS hatasını ayır.
    if (e.target && e.target !== window && e.target.tagName) {
      const tag = e.target.tagName.toLowerCase();
      const key = 'res:' + tag + ':' + (e.target.src || e.target.href || '');
      if (!shouldReport(key)) return;
      sb.diag.log({
        level: 'warn', cat: 'renderer-resource',
        msg: tag + ' yüklenemedi',
        data: { url: e.target.src || e.target.href || '' },
      });
      return;
    }
    const key = 'err:' + (e.message || '') + ':' + (e.lineno || 0);
    if (!shouldReport(key)) return;
    sb.diag.reportError({
      message: e.message || 'Bilinmeyen arayüz hatası',
      stack:   e.error && e.error.stack ? String(e.error.stack) : '',
      source:  e.filename || '',
      line:    e.lineno || 0,
      column:  e.colno || 0,
    });
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const message = r instanceof Error ? r.message : String(r);
    const key = 'rej:' + message;
    if (!shouldReport(key)) return;
    sb.diag.reportError({
      message: 'İşlenmeyen promise reddi: ' + message,
      stack:   r instanceof Error && r.stack ? String(r.stack) : '',
      source:  'unhandledrejection',
    });
  });

  // ── Arayüz kodundan çağrılabilen yapılandırılmış logger ────────────────────
  // Kullanım: ilgezdiLog.warn('bookmarks', 'içe aktarma boş döndü', { count: 0 })
  window.ilgezdiLog = {
    debug: (cat, msg, data) => sb.diag.log({ level: 'debug', cat, msg, data }),
    info:  (cat, msg, data) => sb.diag.log({ level: 'info',  cat, msg, data }),
    warn:  (cat, msg, data) => sb.diag.log({ level: 'warn',  cat, msg, data }),
    error: (cat, msg, data) => sb.diag.log({ level: 'error', cat, msg, data }),
    /** try/catch içinde: ilgezdiLog.catch('vpn', e) */
    catch: (cat, err, extra) => sb.diag.log({
      level: 'error', cat,
      msg: err && err.message ? err.message : String(err),
      data: { stack: err && err.stack ? String(err.stack) : '', ...(extra || {}) },
    }),
  };

  // Konsol hatalarını da günlüğe al — mevcut kodda çok sayıda console.error var
  // ve hepsini elle dönüştürmek yerine köprülemek daha az riskli.
  const origError = console.error;
  console.error = function (...args) {
    try {
      const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === 'object' ? '[obj]' : String(a))).join(' ');
      if (msg && shouldReport('console:' + msg.slice(0, 80))) {
        const errArg = args.find((a) => a instanceof Error);
        sb.diag.log({
          level: 'error', cat: 'console',
          msg,
          data: errArg && errArg.stack ? { stack: String(errArg.stack) } : undefined,
        });
      }
    } catch {}
    return origError.apply(console, args);
  };
})();
