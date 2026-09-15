// Senkron çakışması: sync-manager.js'i sahte window/localStorage/fetch ile çalıştırır.
// Yerel değişiklik sunucudaki kayıttan yeniyse açılıştaki pull uzak ayarları UYGULAMAMALI
// ve yerel durumu göndermeli. Sonuç JSON olarak stdout'a yazılır (test/run.js okur).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'renderer', 'sync-manager.js'), 'utf8');
const LOCAL_AT_KEY = 'ilgezdi-sync-local-at';

function load({ localAt = null, remoteAt = 0, remoteRow = true } = {}) {
  const store = new Map();
  if (localAt != null) store.set(LOCAL_AT_KEY, String(localAt));
  const saved = [];
  const posts = [];
  const events = [];
  const window = {
    secureBrowser: {
      saveConfig: async (c) => { saved.push(c); return c; },
      getConfig: async () => ({ httpsOnly: true, theme: 'hibrit' }),
    },
    dispatchEvent: (e) => { events.push(e.type); },
  };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  const fetch = async (_url, opts) => {
    if (opts.method === 'GET') {
      const rows = remoteRow
        ? [{ settings: { httpsOnly: false }, bookmarks: { folders: [], items: [] }, updated_at: new Date(remoteAt).toISOString() }]
        : [];
      return { ok: true, status: 200, json: async () => rows };
    }
    posts.push(JSON.parse(opts.body));
    return { ok: true, status: 201 };
  };
  class CustomEvent { constructor(type) { this.type = type; } }
  const ctx = vm.createContext({
    window, localStorage, fetch, CustomEvent, console,
    SB_URL: 'https://sync.invalid', SB_KEY: 'anon', setTimeout, clearTimeout,
  });
  vm.runInContext(SRC, ctx);
  return { sync: window.ilgezdiSync, store, saved, posts, events };
}

async function login(opts) {
  const s = load(opts);
  await s.sync.onLogin({ userId: 'u1', accessToken: 't1' });
  return {
    saved: s.saved.length,
    savedHttpsOnly: s.saved[0] ? s.saved[0].httpsOnly : null,
    posts: s.posts.length,
    postedHttpsOnly: s.posts[0] ? s.posts[0].settings.httpsOnly : null,
    applied: s.events.includes('ilgezdi-sync-applied'),
    bookmarksWritten: s.store.has('ilgezdi-bm-items'),
  };
}

(async () => {
  const out = {};
  out.localNewer = await login({ localAt: 2_000_000, remoteAt: 1_000_000 });
  out.remoteNewer = await login({ localAt: 1_000_000, remoteAt: 2_000_000 });
  out.firstRun = await login({ localAt: null, remoteAt: 1_000_000 });
  out.noRemote = await login({ localAt: null, remoteRow: false });
  const offline = load();
  offline.sync.schedulePush();
  out.offlineMarks = Number(offline.store.get(LOCAL_AT_KEY)) > 0;
  process.stdout.write(JSON.stringify(out));
})().catch((e) => { process.stdout.write(JSON.stringify({ error: String(e && e.stack || e) })); });
