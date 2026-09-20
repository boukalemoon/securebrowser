/**
 * İlgezdi — Kenar çubuğunda web paneli (saf yardımcılar; testli).
 *
 * Kullanıcı sık kullandığı siteleri (mesajlaşma, müzik, not) kenar çubuğuna ekler; site
 * sağdaki panelde açılır ve kapatılınca arka planda açık kalır. Liste config.json'da
 * (webPanels) yalnızca ana süreç tarafından yazılır; adresler burada doğrulanır.
 */

'use strict';

const MAX_PANELS = 12;
const HEADER_HEIGHT = 44;      // panel başlığı (arayüz çizer); site görünümü bunun altında
const TITLE_MAX = 60;

/**
 * Hazır servisler — kullanıcı adres yazmak yerine listeden seçsin.
 *
 * Bunlar API DEĞİL: sitenin kendi web arayüzü kenar çubuğunda açılıyor. Opera,
 * Vivaldi ve Edge de aynısını yapıyor; hiçbirinin Meta ya da benzeri bir
 * şirketle anlaşması yok. Dolayısıyla burada anahtar, jeton ya da uygulama
 * kaydı bulunmaz — yalnızca adres.
 *
 * `ad` çeviriye GİRMEZ: hepsi marka adı.
 */
const PRESETS = Object.freeze([
  { id: 'whatsapp',  ad: 'WhatsApp',  url: 'https://web.whatsapp.com/',       mikrofon: true },
  { id: 'telegram',  ad: 'Telegram',  url: 'https://web.telegram.org/',       mikrofon: true },
  { id: 'messenger', ad: 'Messenger', url: 'https://www.messenger.com/',      mikrofon: true },
  { id: 'instagram', ad: 'Instagram', url: 'https://www.instagram.com/direct/inbox/' },
  { id: 'x',         ad: 'X',         url: 'https://x.com/messages' },
  { id: 'gmail',     ad: 'Gmail',     url: 'https://mail.google.com/' },
  { id: 'outlook',   ad: 'Outlook',   url: 'https://outlook.live.com/mail/' },
  { id: 'discord',   ad: 'Discord',   url: 'https://discord.com/app',         mikrofon: true },
  { id: 'slack',     ad: 'Slack',     url: 'https://app.slack.com/client',    mikrofon: true },
  { id: 'youtube',   ad: 'YouTube Music', url: 'https://music.youtube.com/' },
  { id: 'spotify',   ad: 'Spotify',   url: 'https://open.spotify.com/' },
  { id: 'chatgpt',   ad: 'ChatGPT',   url: 'https://chatgpt.com/' },
]);

/**
 * Okunmamış sayısı SAYFA BAŞLIĞINDAN okunur — API yok, sunucuya istek yok.
 * WhatsApp Web "(3) WhatsApp", Telegram "(3) Telegram", Gmail "Gelen Kutusu (3) …"
 * yazıyor. Opera'nın kenar çubuğu sayacı da tam olarak bunu yapıyor.
 *
 * Kasıtlı olarak DAR: tanımadığı biçimde sessizce yanlış sayı göstermek yerine
 * hiç göstermiyor. Site başlık biçimini değiştirirse sayaç kaybolur, panel
 * çalışmaya devam eder.
 *
 * @returns {number} 0 = sayaç yok/bilinmiyor; 99 üstü 99'da sabitlenir
 */
function unreadFromTitle(title) {
  const t = String(title == null ? '' : title).trim();
  if (!t) return 0;
  // "(3) WhatsApp" / "(3+) …" / "[3] …" — başlıkta ÖNDE olmak zorunda.
  let m = /^[([](\d{1,4})\+?[)\]]/.exec(t);
  // "Gelen Kutusu (3) - ad@ornek.com" — Gmail sayıyı ortada yazıyor.
  if (!m) m = /\((\d{1,4})\)\s*[-–—]/.exec(t);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 99);
}

/**
 * Panelin kendi kalıcı oturum bölümü. Panel başına ayrı olması iki işi çözüyor:
 *   • WhatsApp'ın çerezi gezdiğin her siteyle aynı kavanozda durmuyor (ve tersi).
 *   • İki ayrı hesabı iki ayrı panelde kullanabiliyorsun.
 * `persist:` şart — yoksa her açılışta yeniden QR okutmak gerekir.
 */
function panelPartition(id) {
  const temiz = String(id || '').replace(/[^a-z0-9]/gi, '').slice(0, 32);
  return temiz ? 'persist:panel-' + temiz : null;
}

function parseWebUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname || u.username || u.password) return null;
    u.hash = '';
    return u;
  } catch { return null; }
}

/** Kullanıcının yazdığı adres: şema yoksa https eklenir. Geçersizse null. */
function normalizePanelUrl(input) {
  const text = String(input || '').trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : 'https://' + text;
  const u = parseWebUrl(withScheme);
  if (!u || !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
  return u.toString();
}

function titleFor(url) {
  const u = parseWebUrl(url);
  return u ? u.hostname.replace(/^www\./, '').slice(0, TITLE_MAX) : '';
}

// Aynı site iki kez eklenmez: kök adres (şema + alan adı + yol) karşılaştırılır.
function sameSite(a, b) {
  const x = parseWebUrl(a);
  const y = parseWebUrl(b);
  if (!x || !y) return false;
  const key = (u) => u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '');
  return key(x) === key(y);
}

/** Diskten okunan liste: geçersiz kayıtlar atılır, en çok MAX_PANELS. */
function normalizePanels(list) {
  const out = [];
  const ids = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p.id !== 'string' || !/^p[0-9a-z]{1,16}$/.test(p.id) || ids.has(p.id)) continue;
    const u = parseWebUrl(p.url);
    if (!u) continue;
    ids.add(p.id);
    out.push({ id: p.id, url: u.toString(), title: String(p.title || titleFor(u.toString())).slice(0, TITLE_MAX) });
    if (out.length >= MAX_PANELS) break;
  }
  return out;
}

/** Ekler; { list, id } ya da { error: 'invalid' | 'full' }. Aynı site varsa onun kimliği. */
function addPanel(list, input, makeId) {
  const url = normalizePanelUrl(input);
  if (!url) return { error: 'invalid' };
  const current = normalizePanels(list);
  const existing = current.find((p) => sameSite(p.url, url));
  if (existing) return { list: current, id: existing.id, existed: true };
  if (current.length >= MAX_PANELS) return { error: 'full' };
  let id;
  do { id = 'p' + makeId(); } while (current.some((p) => p.id === id));
  return { list: current.concat({ id, url, title: titleFor(url) }), id };
}

function removePanel(list, id) {
  return normalizePanels(list).filter((p) => p.id !== id);
}

module.exports = { MAX_PANELS, HEADER_HEIGHT, normalizePanelUrl, normalizePanels, addPanel, removePanel, titleFor, sameSite,
  PRESETS, unreadFromTitle, panelPartition };
