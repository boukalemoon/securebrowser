/**
 * İlgezdi — Site güvenliği kararları (saf mantık)
 * site-safety.js
 *
 * Electron'a bağımlı değildir; main.js olayları bağlar. Buradaki her karar
 * test/run.js'te birim testleriyle korunur:
 *   • açılır pencere engelleme (kullanıcı etkileşimi penceresi)
 *   • site izinlerinin doğrulanması ve listelenmesi
 *   • üçüncü taraf çerez kararı
 *   • güvenli DNS (DNS-over-HTTPS) seçenekleri
 *   • yükleme hatası sayfası ve sertifika özeti
 */

'use strict';

const isWebUrl = (u) => /^https?:\/\//i.test(String(u || ''));

function hostOf(url) {
  try { return new URL(String(url)).hostname; } catch { return ''; }
}

// ─── Açılır pencere engelleme ─────────────────────────────────────────────────
// Electron'da Chromium'un açılır pencere engelleyicisi yok: etkileşimsiz
// window.open da setWindowOpenHandler'a ulaşır (fizibilite sondasıyla ölçüldü).
// Karar ana süreçte, sayfanın taklit edemeyeceği 'input-event' zamanına göre
// verilir. Pencere Chromium'un geçici etkileşim süresiyle aynıdır (5 sn).
const ACTIVATION_WINDOW_MS = 5000;
const ACTIVATION_EVENTS = Object.freeze(new Set([
  'mouseDown', 'mouseUp', 'keyDown', 'rawKeyDown', 'touchStart', 'touchEnd', 'gestureTap',
]));

/**
 * @param {{now: number, lastActivation?: number, siteDecision?: boolean}} p
 *   siteDecision: kullanıcı bu site için açılır pencerelere izin verdiyse true,
 *   engellediyse false, karar yoksa undefined.
 * @returns {'allow'|'block'}
 */
function popupVerdict({ now, lastActivation, siteDecision }) {
  if (siteDecision === true) return 'allow';
  if (siteDecision === false) return 'block';
  if (lastActivation && now - lastActivation >= 0 && now - lastActivation <= ACTIVATION_WINDOW_MS) return 'allow';
  return 'block';
}

// ─── Site izinleri ────────────────────────────────────────────────────────────
// Sıra, Site Bilgisi panelinde gösterilme sırasıdır.
const SITE_PERMISSIONS = Object.freeze([
  { id: 'geolocation',         label: 'Konum',                          ask: true },
  { id: 'media',               label: 'Kamera ve mikrofon',             ask: true },
  { id: 'display-capture',     label: 'Ekran paylaşımı',                ask: true },
  { id: 'notifications',       label: 'Bildirimler',                    ask: true },
  { id: 'midi',                label: 'MIDI cihazları',                 ask: true },
  { id: 'midiSysex',           label: 'MIDI sistem mesajları',          ask: true },
  // Uzak masaüstü (Arku) gibi sitelerin bilgisayardaki panoyu okuması (yapıştırma).
  // Eskiden hiç sorulmadan reddediliyordu; site kopyalananı alamıyordu.
  { id: 'clipboard-read',      label: 'Panodan okuma (yapıştırma)',     ask: true },
  { id: 'popups',              label: 'Açılır pencereler',              ask: false },
  { id: 'third-party-cookies', label: 'Üçüncü taraf çerezler',          ask: false },
]);
const PERMISSION_IDS = new Set(SITE_PERMISSIONS.map((p) => p.id));
const permissionLabel = (id) => (SITE_PERMISSIONS.find((p) => p.id === id) || {}).label || id;

/** Geçerli bir http(s) origin'i döndürür ("https://a.com:8443"), değilse null. */
function normalizeOrigin(origin) {
  try {
    const u = new URL(String(origin || ''));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin === String(origin) ? u.origin : null;
  } catch { return null; }
}

/**
 * Arayüzden gelen izin değişikliğini doğrular.
 * decision: 'allow' | 'block' | 'ask' ('ask' kaydı siler, site yeniden sorar)
 */
function validatePermissionChange(input) {
  const origin = normalizeOrigin(input && input.origin);
  if (!origin) return { ok: false, error: 'Geçersiz site adresi' };
  const permission = String((input && input.permission) || '');
  if (!PERMISSION_IDS.has(permission)) return { ok: false, error: 'Bilinmeyen izin türü' };
  const decision = input && input.decision;
  if (decision !== 'allow' && decision !== 'block' && decision !== 'ask') return { ok: false, error: 'Geçersiz karar' };
  return { ok: true, origin, permission, value: decision === 'ask' ? null : decision === 'allow' };
}

/** permissionDecisions nesnesini ('origin|izin' → boolean) sıralı listeye çevirir. */
function listDecisions(decisions) {
  const out = [];
  if (!decisions || typeof decisions !== 'object') return out;
  for (const [key, value] of Object.entries(decisions)) {
    if (typeof value !== 'boolean') continue;
    const i = key.lastIndexOf('|');
    if (i <= 0) continue;
    const origin = normalizeOrigin(key.slice(0, i));
    const permission = key.slice(i + 1);
    if (!origin || !PERMISSION_IDS.has(permission)) continue;
    out.push({ origin, permission, label: permissionLabel(permission), decision: value ? 'allow' : 'block' });
  }
  const order = (id) => SITE_PERMISSIONS.findIndex((p) => p.id === id);
  return out.sort((a, b) => a.origin.localeCompare(b.origin) || order(a.permission) - order(b.permission));
}

/** Bir sitenin tüm izinleri: kayıt yoksa 'ask' (açılır pencere ve çerezde 'default'). */
function decisionsForOrigin(decisions, origin) {
  return SITE_PERMISSIONS.map((p) => {
    const v = decisions && typeof decisions === 'object' ? decisions[origin + '|' + p.id] : undefined;
    const decision = v === true ? 'allow' : v === false ? 'block' : (p.ask ? 'ask' : 'default');
    return { permission: p.id, label: p.label, decision };
  });
}

// ─── Üçüncü taraf çerezler ────────────────────────────────────────────────────
/**
 * true → istekteki Cookie ve yanıttaki Set-Cookie başlıkları ayıklanmalı.
 * Yalnızca HTTP başlıklarındaki çerezleri kapsar; üçüncü taraf çerçevenin
 * document.cookie ile yazdığı çerezleri engellemez (bilinen sınırlama).
 */
function shouldStripThirdPartyCookies({ enabled, resourceType, thirdParty, siteAllowed, whitelisted }) {
  if (!enabled) return false;
  if (resourceType === 'mainFrame') return false;   // kullanıcının gittiği site birinci taraftır
  if (!thirdParty) return false;
  if (siteAllowed === true || whitelisted) return false;
  return true;
}

// ─── Güvenli DNS (DNS-over-HTTPS) ─────────────────────────────────────────────
const SECURE_DNS_OPTIONS = Object.freeze([
  { id: 'automatic',  label: 'Otomatik (sistem DNS sağlayıcısı destekliyorsa şifreli)' },
  { id: 'cloudflare', label: 'Cloudflare (1.1.1.1)',   server: 'https://cloudflare-dns.com/dns-query' },
  { id: 'quad9',      label: 'Quad9 (9.9.9.9)',        server: 'https://dns.quad9.net/dns-query' },
  { id: 'adguard',    label: 'AdGuard DNS',            server: 'https://dns.adguard-dns.com/dns-query' },
  { id: 'google',     label: 'Google Public DNS',      server: 'https://dns.google/dns-query' },
  { id: 'off',        label: 'Kapalı (işletim sistemi DNS\'i)' },
]);
const DEFAULT_SECURE_DNS = 'automatic';

function normalizeSecureDns(value) {
  return SECURE_DNS_OPTIONS.some((o) => o.id === value) ? value : DEFAULT_SECURE_DNS;
}

/** app.configureHostResolver seçenekleri. */
function hostResolverOptions(value) {
  const opt = SECURE_DNS_OPTIONS.find((o) => o.id === normalizeSecureDns(value));
  if (opt.id === 'off') return { secureDnsMode: 'off' };
  if (!opt.server) return { secureDnsMode: 'automatic' };
  return { secureDnsMode: 'secure', secureDnsServers: [opt.server] };
}

// ─── Sertifika özeti ──────────────────────────────────────────────────────────
function certErrorText(code) {
  switch (Number(code)) {
    case -200: return 'Sertifika bu alan adı için verilmemiş.';
    case -201: return 'Sertifikanın süresi dolmuş ya da henüz geçerli değil.';
    case -202: return 'Sertifika güvenilen bir kuruluş tarafından verilmemiş.';
    case -203: return 'Sertifika hatalı biçimlendirilmiş.';
    case -206: return 'Sertifika iptal edilmiş.';
    case -207: return 'Sertifika geçersiz.';
    case -208: return 'Sertifika zayıf bir imza algoritması kullanıyor.';
    case -211: return 'Sertifika zayıf bir anahtar kullanıyor.';
    case -107: return 'Güvenli bağlantı kurulamadı (SSL protokol hatası).';
    case -113: return 'Site desteklenmeyen bir güvenlik protokolü kullanıyor.';
    case -501: return 'Sunucudan gelen yanıt güvenli değil.';
    default:   return 'Sertifika doğrulanamadı.';
  }
}

/** setCertificateVerifyProc isteğinden panelde gösterilecek özet. Özel veri içermez. */
function certificateSummary(certificate, verificationResult, errorCode) {
  const c = certificate || {};
  const code = Number(errorCode) || 0;
  return {
    subject:     String(c.subjectName || ''),
    issuer:      String(c.issuerName || ''),
    issuerOrg:   String((c.issuer && Array.isArray(c.issuer.organizations) && c.issuer.organizations[0]) || ''),
    validFrom:   Number(c.validStart) > 0 ? Number(c.validStart) * 1000 : null,
    validTo:     Number(c.validExpiry) > 0 ? Number(c.validExpiry) * 1000 : null,
    fingerprint: String(c.fingerprint || ''),
    ok:          code === 0 && String(verificationResult || '') === 'net::OK',
    error:       code === 0 ? '' : certErrorText(code),
  };
}

// ─── Yükleme hatası sayfası ───────────────────────────────────────────────────
const isCertificateError = (c) => (c <= -200 && c >= -299) || c === -107 || c === -113 || c === -501;
const DNS_ERRORS = new Set([-105, -137]);
const OFFLINE_ERRORS = new Set([-106, -21]);
const UNREACHABLE_ERRORS = new Set([-7, -15, -100, -101, -102, -104, -109, -118, -130, -324]);

/**
 * Sekmede gösterilecek hata sayfasının içeriği.
 * @param {{code: number, description?: string, url: string, httpsOnly?: boolean}} p
 */
function errorPageModel({ code, description, url, httpsOnly }) {
  const c = Number(code) || 0;
  const host = hostOf(url) || String(url || '').slice(0, 80);
  const codeName = String(description || '').replace(/[^A-Z0-9_]/g, '').slice(0, 60) || ('HATA ' + c);
  const base = { code: c, codeName, host, url: isWebUrl(url) ? String(url) : '', canRetry: isWebUrl(url), tips: [] };
  let model;

  if (isCertificateError(c)) {
    model = {
      ...base, kind: 'certificate',
      title: 'Güvenlik uyarısı',
      heading: 'Bağlantınız gizli değil',
      message: 'Saldırganlar ' + host + ' üzerinden parola, mesaj ya da kart bilgilerinizi çalmaya çalışıyor olabilir.',
      reason: certErrorText(c),
      tips: [
        'İlgezdi güvenli olmayan bir bağlantıyla devam etmenize izin vermez.',
        c === -201 ? 'Bilgisayarınızın tarih ve saatinin doğru olduğundan emin olun.' : 'Adresi doğru yazdığınızdan emin olun.',
        'Kurumsal ağ ya da güvenlik yazılımı HTTPS trafiğini denetliyorsa bu uyarı görülebilir.',
      ],
    };
  } else if (DNS_ERRORS.has(c)) {
    model = {
      ...base, kind: 'dns',
      title: host,
      heading: 'Bu siteye ulaşılamıyor',
      message: host + ' sunucusunun IP adresi bulunamadı.',
      tips: [
        'Adreste yazım hatası olup olmadığını kontrol edin.',
        'İnternet ve VPN bağlantınızı kontrol edin.',
        'Güvenli DNS belirli bir sağlayıcıya ayarlıysa kurum içi adresler çözümlenemeyebilir; Ayarlar › Gizlilik bölümünden Otomatik seçin.',
      ],
    };
  } else if (OFFLINE_ERRORS.has(c)) {
    model = {
      ...base, kind: 'offline',
      title: 'Bağlantı yok',
      heading: 'İnternet bağlantısı yok',
      message: 'Bilgisayarınız internete bağlı görünmüyor.',
      tips: [
        'Kablo, modem ya da Wi-Fi bağlantınızı kontrol edin.',
        'VPN tüneli koptuysa ve kill switch açıksa trafik bilinçli olarak durdurulur; VPN panelinden yeniden bağlanın.',
      ],
    };
  } else if (UNREACHABLE_ERRORS.has(c)) {
    const reason = c === -102 ? host + ' bağlanmayı reddetti.'
      : (c === -118 || c === -7) ? host + ' zamanında yanıt vermedi.'
      : (c === -100 || c === -101) ? 'Bağlantı beklenmedik şekilde kesildi.'
      : c === -324 ? host + ' hiç veri göndermedi.'
      : c === -130 ? 'Proxy sunucusuna bağlanılamadı.'
      : host + ' ile bağlantı kurulamadı.';
    model = {
      ...base, kind: 'unreachable',
      title: host,
      heading: 'Bu siteye ulaşılamıyor',
      message: reason,
      tips: ['Birkaç dakika sonra yeniden deneyin.', 'VPN kullanıyorsanız tünelin bağlı olduğunu kontrol edin.'],
    };
  } else if (c === -310) {
    model = {
      ...base, kind: 'redirects',
      title: host,
      heading: 'Bu sayfa çalışmıyor',
      message: host + ' sizi çok fazla kez yönlendirdi.',
      tips: [
        'Kilit simgesine tıklayıp bu sitenin çerezlerini ve verilerini silmeyi deneyin.',
        'Giriş yaparken oluyorsa Site Bilgisi panelinden bu site için üçüncü taraf çerezlere izin verin.',
      ],
    };
  } else if (c === -20 || c === -27) {
    model = {
      ...base, kind: 'blocked',
      title: host,
      heading: 'Bu sayfa engellendi',
      message: 'Sayfa İlgezdi ya da ağ ilkesi tarafından engellendi.',
    };
  } else {
    model = {
      ...base, kind: 'generic',
      title: host,
      heading: 'Sayfa yüklenemedi',
      message: host + ' yüklenirken bir hata oluştu.',
    };
  }

  const httpsRelated = isCertificateError(c) || UNREACHABLE_ERRORS.has(c);
  if (httpsOnly && httpsRelated && /^https:/i.test(String(url || ''))) {
    model.tips = ['Yalnızca HTTPS açık: site güvenli bağlantı sunmuyorsa açılmaz. Ayarlar › Gizlilik bölümünden kapatabilirsiniz.', ...model.tips];
  }
  return model;
}

/**
 * Chromium'un boş hata belgesine (chrome-error://) İlgezdi hata sayfasını yazan betik.
 * Veri JSON olarak gömülür ve DOM'a yalnızca textContent ile yazılır; adres ya da
 * sunucu adı HTML/betik olarak yorumlanamaz. Belge hata belgesi değilse dokunmaz.
 */
function errorPageScript(model) {
  const data = JSON.stringify(model);
  return '(function () {\n' +
    "  if (String(location.href).indexOf('chrome-error://') !== 0) return false;\n" +
    '  var m = ' + data + ';\n' +
    '  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };\n' +
    '  document.title = m.title;\n' +
    '  var css = el("style");\n' +
    '  css.textContent = ' + JSON.stringify(ERROR_PAGE_CSS) + ';\n' +
    '  var main = el("main", "w " + m.kind);\n' +
    '  main.appendChild(el("div", "mark", (m.kind === "certificate" || m.kind === "threat") ? "!" : "·"));\n' +
    '  main.appendChild(el("h1", null, m.heading));\n' +
    '  main.appendChild(el("p", "msg", m.message));\n' +
    '  if (m.reason) main.appendChild(el("p", "reason", m.reason));\n' +
    '  if (m.tips && m.tips.length) { var ul = el("ul"); m.tips.forEach(function (t) { ul.appendChild(el("li", null, t)); }); main.appendChild(ul); }\n' +
    '  var row = el("div", "row");\n' +
    '  if (m.canRetry) { var r = el("button", "primary", "Yeniden dene"); r.type = "button"; r.onclick = function () { location.replace(m.url); }; row.appendChild(r); }\n' +
    '  if (history.length > 1) { var b = el("button", m.kind === "threat" ? "primary" : null, "Geri dön"); b.type = "button"; b.onclick = function () { history.back(); }; row.appendChild(b); }\n' +
    '  main.appendChild(row);\n' +
    // Zararlı site uyarısı: "devam et" isteği ana sürece belirteçli konsol mesajıyla
    // gider (threat-lists.js PROCEED_PREFIX); belirteç yalnızca bu betikte bulunur.
    '  if (m.proceedMessage) { var p = el("button", "proceed", "Riski anlıyorum, bu siteye devam et"); p.type = "button"; p.onclick = function () { p.disabled = true; console.info(m.proceedMessage); }; main.appendChild(p); }\n' +
    '  main.appendChild(el("p", "code", m.codeName));\n' +
    '  document.head.appendChild(css);\n' +
    '  document.body.replaceChildren(main);\n' +
    '  return true;\n' +
    '})();';
}

const ERROR_PAGE_CSS = [
  ':root{color-scheme:light dark;--bg:#f4f6fa;--ink:#18223a;--soft:#4c5874;--mute:#7a849a;--line:#d6dce8;--accent:#9a6b1f;--warn:#a8321e}',
  '@media (prefers-color-scheme:dark){:root{--bg:#0e1a2e;--ink:#e8dfcb;--soft:#aab6cc;--mute:#7d8aa4;--line:#2a3a56;--accent:#d4a85a;--warn:#f08a7a}}',
  'html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 "Segoe UI",system-ui,-apple-system,sans-serif}',
  '.w{max-width:600px;margin:12vh auto;padding:0 24px}',
  '.mark{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font:700 22px/1 system-ui;border:2px solid var(--mute);color:var(--mute);margin-bottom:18px}',
  '.certificate .mark,.threat .mark{border-color:var(--warn);color:var(--warn)}',
  '.threat h1{color:var(--warn)}',
  '.proceed{display:block;margin-top:22px;padding:4px 0;border:0;background:none;color:var(--mute);font-size:13px;text-decoration:underline;cursor:pointer}',
  '.proceed:hover{color:var(--ink)}.proceed:disabled{opacity:.6;cursor:default}',
  'h1{font-size:24px;line-height:1.25;margin:0 0 10px;font-weight:600}',
  '.msg{margin:0 0 8px;color:var(--soft)}',
  '.reason{margin:0 0 8px;color:var(--warn);font-weight:600}',
  'ul{margin:14px 0 22px;padding-left:20px;color:var(--soft)}li{margin:4px 0}',
  '.row{display:flex;gap:10px;flex-wrap:wrap}',
  'button{font:inherit;font-size:14px;padding:8px 16px;border-radius:6px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}',
  'button.primary{background:var(--accent);border-color:var(--accent);color:#111}',
  'button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
  '.code{margin-top:26px;font:12px ui-monospace,Consolas,monospace;color:var(--mute);letter-spacing:.04em}',
].join('');

// ─── İndirme güvenliği ────────────────────────────────────────────────────────
// Electron 44 indirilen dosyaya Mark-of-the-Web'i (Zone.Identifier) kendisi
// yazıyor (sondayla doğrulandı); SmartScreen dosya açılırken denetler. Burada
// yalnızca güvensiz kaynaktan gelen çalıştırılabilir dosya uyarısı belirlenir.
const DANGEROUS_EXTENSIONS = Object.freeze(new Set([
  'exe', 'msi', 'msp', 'msix', 'msixbundle', 'appx', 'appxbundle', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl',
  'dll', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'lnk', 'reg', 'jar', 'application',
  'gadget', 'inf', 'scf', 'url', 'iso', 'img', 'vhd', 'vhdx', 'chm', 'sh', 'app', 'dmg', 'pkg', 'deb', 'rpm',
]));

/** Uzantı (küçük harf). Windows sondaki nokta ve boşlukları attığı için onlar yok sayılır. */
function fileExtension(name) {
  const base = String(name || '').replace(/[.\s]+$/, '');
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

const isDangerousFile = (name) => DANGEROUS_EXTENSIONS.has(fileExtension(name));

/** https, yerel döngü (localhost, 127.x, ::1) ya da sayfanın ürettiği blob/data. */
function isSecureSource(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol === 'https:' || u.protocol === 'blob:' || u.protocol === 'data:') return true;
    if (u.protocol !== 'http:') return false;
    const h = u.hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h.endsWith('.localhost') || /^127\./.test(h) || h === '::1';
  } catch { return false; }
}

const downloadNeedsWarning = ({ filename, url }) => isDangerousFile(filename) && !isSecureSource(url);

function sourceHost(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : '';
  } catch { return ''; }
}

// Ziyaret günlüğü kimliği: secure-log-manager addVisit biçimi.
const LOG_ID_RE = /^log_\d{10,16}_[a-z0-9]{1,8}$/;
function sanitizeLogIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x) => typeof x === 'string' && LOG_ID_RE.test(x)))].slice(0, 500);
}

// Kalıcı indirme geçmişi: yalnızca biten indirmeler, yalnızca bilinen alanlar.
const DOWNLOAD_HISTORY_MAX = 200;
const FINISHED_DOWNLOAD_STATES = new Set(['completed', 'cancelled', 'interrupted']);
function sanitizeDownloadHistory(list) {
  if (!Array.isArray(list)) return [];
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  return list
    .filter((d) => d && FINISHED_DOWNLOAD_STATES.has(d.state) && typeof d.filename === 'string' && d.filename)
    .map((d) => ({
      filename:   d.filename.slice(0, 180),
      state:      d.state,
      received:   num(d.received),
      total:      num(d.total),
      savePath:   typeof d.savePath === 'string' ? d.savePath.slice(0, 1024) : '',
      sourceHost: typeof d.sourceHost === 'string' ? d.sourceHost.slice(0, 253) : '',
      startedAt:  num(d.startedAt),
      endedAt:    num(d.endedAt),
    }))
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-DOWNLOAD_HISTORY_MAX);
}

module.exports = {
  DANGEROUS_EXTENSIONS,
  fileExtension,
  isDangerousFile,
  isSecureSource,
  downloadNeedsWarning,
  sourceHost,
  sanitizeLogIds,
  sanitizeDownloadHistory,
  ACTIVATION_WINDOW_MS,
  ACTIVATION_EVENTS,
  popupVerdict,
  SITE_PERMISSIONS,
  permissionLabel,
  normalizeOrigin,
  validatePermissionChange,
  listDecisions,
  decisionsForOrigin,
  shouldStripThirdPartyCookies,
  SECURE_DNS_OPTIONS,
  DEFAULT_SECURE_DNS,
  normalizeSecureDns,
  hostResolverOptions,
  certErrorText,
  certificateSummary,
  errorPageModel,
  errorPageScript,
};
