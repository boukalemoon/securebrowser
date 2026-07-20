'use strict';

/**
 * İlgezdi — Qrtım Hesap Senkronizasyonu
 *
 * Kullanıcının Qrtım (Supabase) user_id'sine bağlı tek satırda ayarlar ve
 * yer imleri tutulur: public.ilgezdi_sync_data (RLS: herkes yalnız kendi satırı).
 *
 * Akış:
 *  - Giriş başarılı olunca auth-screen.js → ilgezdiSync.onLogin({userId, accessToken})
 *  - onLogin: uzak veri varsa uygular (uzak kazanır), yoksa yereli ilk kez yükler
 *  - Ayar/yer imi değişince paneller → ilgezdiSync.schedulePush() (debounce'lu upsert)
 *
 * Not: SB_URL ve SB_KEY auth-screen.js'te tanımlıdır; bu script ondan sonra yüklenir.
 */

(function () {
  // Cihaza özgü olanlar (downloadFolder, VPN, oturum) BİLEREK senkronlanmaz.
  const SYNC_SETTING_KEYS = [
    'homepage', 'theme', 'accentColor', 'fontSize', 'fontFamily', 'language',
    'newTabMode', 'customNewTabUrl', 'blockTrackers', 'blockAds',
    'fingerprintProtection', 'httpsOnly', 'doNotTrack', 'userAgentRotation',
    'notifications', 'askDownloadLocation', 'blockLevel', 'whitelist',
  ];
  const PUSH_DEBOUNCE_MS = 4000;

  let _ctx = null;        // { userId, accessToken }
  let _pushTimer = null;
  let _busy = false;

  function pickSyncSettings(cfg) {
    const out = {};
    for (const k of SYNC_SETTING_KEYS) {
      if (cfg && cfg[k] !== undefined) out[k] = cfg[k];
    }
    return out;
  }

  function collectBookmarks() {
    try {
      return {
        folders: JSON.parse(localStorage.getItem('ilgezdi-bm-folders') || '[]'),
        items:   JSON.parse(localStorage.getItem('ilgezdi-bm-items')   || '[]'),
      };
    } catch { return { folders: [], items: [] }; }
  }

  async function req(method, query, body) {
    if (!_ctx?.accessToken) return null;
    const doFetch = () => fetch(`${SB_URL}/rest/v1/ilgezdi_sync_data${query}`, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${_ctx.accessToken}`,
        ...(method === 'POST' ? { 'Prefer': 'resolution=merge-duplicates' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let r = await doFetch();
    // Access token süresi dolmuş olabilir → bir kez yenile ve tekrar dene
    if (r.status === 401) {
      const fresh = await window.ilgezdiAuth?.refreshAccessToken?.();
      if (!fresh) return r;
      _ctx.accessToken = fresh;
      r = await doFetch();
    }
    return r;
  }

  async function pull() {
    if (!_ctx) return { applied: false };
    const r = await req('GET', `?user_id=eq.${_ctx.userId}&select=settings,bookmarks,updated_at`);
    if (!r?.ok) return { applied: false };
    const rows = await r.json();
    if (!rows?.length) return { applied: false, empty: true };

    const remote = rows[0];

    // Ayarları uygula (yalnızca senkron anahtarları — cihaz ayarlarına dokunma)
    const settings = pickSyncSettings(remote.settings);
    if (Object.keys(settings).length) {
      await window.secureBrowser?.saveConfig(settings);
    }

    // Yer imlerini uygula
    if (remote.bookmarks && Array.isArray(remote.bookmarks.items)) {
      try {
        localStorage.setItem('ilgezdi-bm-folders', JSON.stringify(remote.bookmarks.folders || []));
        localStorage.setItem('ilgezdi-bm-items',   JSON.stringify(remote.bookmarks.items));
      } catch {}
    }

    // Panellere haber ver (yer imi paneli yeniden yükler, temalar tazelenir)
    window.dispatchEvent(new CustomEvent('ilgezdi-sync-applied'));
    return { applied: true };
  }

  async function push() {
    if (!_ctx || _busy) return { pushed: false };
    _busy = true;
    try {
      const cfg = await window.secureBrowser?.getConfig();
      const r = await req('POST', '', {
        user_id:    _ctx.userId,
        settings:   pickSyncSettings(cfg),
        bookmarks:  collectBookmarks(),
        updated_at: new Date().toISOString(),
      });
      return { pushed: !!r?.ok };
    } catch {
      return { pushed: false };
    } finally {
      _busy = false;
    }
  }

  function schedulePush() {
    if (!_ctx) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => { push(); }, PUSH_DEBOUNCE_MS);
  }

  async function onLogin(ctx) {
    if (!ctx?.userId || !ctx?.accessToken) return;
    _ctx = { userId: ctx.userId, accessToken: ctx.accessToken };
    const res = await pull();
    // Sunucuda hiç veri yoksa bu cihazdaki durumu ilk kayıt olarak gönder
    if (res.empty) await push();
  }

  function onLogout() {
    clearTimeout(_pushTimer);
    _ctx = null;
  }

  window.ilgezdiSync = { onLogin, onLogout, schedulePush, pushNow: push, pullNow: pull,
    isActive: () => !!_ctx };
})();
