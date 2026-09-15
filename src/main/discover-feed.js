/**
 * İlgezdi — Keşfet: TrendTech yazılımlarının tanıtım kartları
 *
 * Liste uygulamayla birlikte gelir (BUNDLED). www.ilgezdi.com.tr/discover.json
 * varsa en fazla günde bir kez, bellek içi ayrı bir oturumla ve çerezsiz tazelenir;
 * yeni ürün eklemek için uygulama sürümü çıkarmak gerekmez. Sunucu yanıtı doğrulanır:
 * geçersizse uygulamadaki liste kullanılır.
 *
 * Gizlilik: kartlarda görsel yok (dış istek yok), tıklama sayılmaz, bağlantılara
 * izleme parametresi eklenmez.
 */

'use strict';

const FEED_URL = 'https://www.ilgezdi.com.tr/discover.json';
const FEED_PARTITION = 'ilgezdi-discover';   // "persist:" yok → bellek içi
const REFRESH_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_ITEMS = 24;

// Açıklamalar ürünlerin kendi sitelerindeki tanıtımlardan (2026-09-15).
const BUNDLED = Object.freeze([
  {
    id: 'arku', name: 'Arku Remote', category: 'Uzak masaüstü',
    tagline: 'Güvenli P2P uzak masaüstü',
    description: 'Sunucusuz, uçtan uca şifreli, açık kaynak uzak masaüstü. Windows, macOS, Linux ve tarayıcı için.',
    url: 'https://www.arku.com.tr', color: '#3a6db5', letter: 'A',
  },
  {
    id: 'qartim', name: 'Qartim', category: 'Dijital kartvizit',
    tagline: 'Dijital kartvizit platformu',
    description: 'Kartvizitinizi dijitale taşıyın. İlgezdi hesabınız da Qartim hesabıyla açılır.',
    url: 'https://www.qartim.com', color: '#b85c3a', letter: 'Q',
  },
  {
    id: 'trendtech', name: 'TrendTech', category: 'Kurumsal BT',
    tagline: 'Kurumsal BT ve siber güvenlik çözümleri',
    description: 'Kurumsal işletmelere siber güvenlik, bulut mimarileri, KVKK uyumu ve yönetilebilir BT hizmetleri.',
    url: 'https://www.trendtech.com.tr', color: '#5a7a4a', letter: 'T',
  },
]);

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Sunucudan gelen tek kartı doğrular; geçersizse null. */
function validateItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id, 40);
  const name = str(raw.name, 40);
  const url = str(raw.url, 300);
  if (!/^[a-z0-9-]{1,40}$/.test(id) || !name || !/^https:\/\/[^\s/$.?#][^\s]*$/i.test(url)) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(raw.color || '')) ? raw.color : '#5a6a8a';
  const letter = str(raw.letter, 2) || name[0];
  return {
    id, name, url: parsed.href.replace(/\/$/, parsed.pathname === '/' && !parsed.search ? '' : '/'),
    category: str(raw.category, 30), tagline: str(raw.tagline, 60), description: str(raw.description, 220),
    color, letter: letter.toLocaleUpperCase('tr'),
  };
}

function validateFeed(json) {
  const items = json && Array.isArray(json.items) ? json.items : null;
  if (!items) return null;
  const out = [];
  const seen = new Set();
  for (const raw of items.slice(0, MAX_ITEMS)) {
    const it = validateItem(raw);
    if (it && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
  }
  return out.length ? out : null;
}

function setupDiscover(ipcMain, session) {
  let items = BUNDLED.map((b) => validateItem(b));
  let fetchedAt = 0;
  let inFlight = null;

  async function refresh() {
    const ses = session.fromPartition(FEED_PARTITION);
    const res = await ses.fetch(FEED_URL, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const valid = validateFeed(await res.json());
    if (valid) items = valid;
  }

  ipcMain.handle('discover-list', async () => {
    if (Date.now() - fetchedAt > REFRESH_MS && !inFlight) {
      fetchedAt = Date.now();
      inFlight = refresh().catch(() => {}).finally(() => { inFlight = null; });
    }
    // İlk açılışta sunucuyu en fazla kısa süre bekle; gelmezse uygulamadaki liste.
    if (inFlight) await Promise.race([inFlight, new Promise((r) => setTimeout(r, 1500))]);
    return items;
  });
}

module.exports = { setupDiscover, validateItem, validateFeed, BUNDLED, FEED_URL };
