'use strict';

/**
 * İlgezdi — QRtım Hesap Senkronizasyonu
 *
 * Kullanıcının QRtım (Supabase) user_id'sine bağlı tek satırda ayarlar ve
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
    'homepage', 'searchEngine', 'theme', 'accentColor', 'fontSize', 'fontFamily',
    'newTabMode', 'customNewTabUrl', 'blockTrackers', 'blockAds',
    'fingerprintProtection', 'httpsOnly', 'doNotTrack', 'userAgentRotation',
    'notifications', 'askDownloadLocation', 'blockLevel', 'whitelist',
    'globalPrivacyControl', 'cleanLinks', 'blockAutoplay', 'clearSiteDataOnExit', 'clearHistoryOnExit',
    'fingerprintShield', 'verticalTabs',
  ];
  const PUSH_DEBOUNCE_MS = 4000;

  // Son yerel değişiklik zamanı. Açılıştaki pull eskiden "uzak kazanır" diye sunucudaki
  // kaydı koşulsuz uyguluyordu: Kaydet'ten sonraki gönderim (4 sn gecikmeli) yapılmadan
  // uygulama kapanırsa ya da gönderim başarısız olursa, sonraki açılışta eski ayarlar
  // yerel ayarların üzerine yazılıyordu. Artık hangisi daha yeniyse o kazanır.
  const LOCAL_AT_KEY = 'ilgezdi-sync-local-at';
  function localChangedAt() {
    try { return Number(localStorage.getItem(LOCAL_AT_KEY)) || 0; } catch { return 0; }
  }
  function setLocalChangedAt(ms) {
    try { localStorage.setItem(LOCAL_AT_KEY, String(ms)); } catch {}
  }

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

  // Veri ve Gizlilik › QRtım hesabı: kullanıcı neyin senkronlanacağını seçer (varsayılan açık).
  async function syncChoices() {
    const cfg = await window.secureBrowser?.getConfig() || {};
    return { cfg, settings: cfg.syncSettings !== false, bookmarks: cfg.syncBookmarks !== false };
  }

  async function pull() {
    if (!_ctx) return { applied: false };
    const choice = await syncChoices();
    const r = await req('GET', `?user_id=eq.${_ctx.userId}&select=settings,bookmarks,updated_at`);
    if (!r?.ok) return { applied: false };
    const rows = await r.json();
    if (!rows?.length) return { applied: false, empty: true };

    const remote = rows[0];
    // Bu cihazda sunucudaki kayıttan sonra değişiklik yapıldıysa uzak kayıt uygulanmaz;
    // onLogin yerel durumu gönderir.
    if (localChangedAt() > (Date.parse(remote.updated_at) || 0)) return { applied: false, localNewer: true };

    // Ayarları uygula (yalnızca senkron anahtarları — cihaz ayarlarına dokunma)
    const settings = choice.settings ? pickSyncSettings(remote.settings) : {};
    if (Object.keys(settings).length) {
      // __source: onay kayıtlarında değişikliğin senkrondan geldiği yazılır.
      await window.secureBrowser?.saveConfig({ ...settings, __source: 'sync' });
    }

    // Yer imlerini uygula (kapatılan senkronda sunucuda yalnızca { cleared } kalır, uygulanmaz)
    if (choice.bookmarks && remote.bookmarks && Array.isArray(remote.bookmarks.items)) {
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
      const { cfg, settings, bookmarks } = await syncChoices();
      // Kapatılan tür sunucudan da temizlenir: hesaptaki eski kopya kalmaz.
      const r = await req('POST', '', {
        user_id:    _ctx.userId,
        settings:   settings ? pickSyncSettings(cfg) : {},
        bookmarks:  bookmarks ? collectBookmarks() : { cleared: true },
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
    setLocalChangedAt(Date.now());   // oturum kapalıyken yapılan değişiklik de sayılır
    if (!_ctx) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => { push(); }, PUSH_DEBOUNCE_MS);
  }

  async function onLogin(ctx) {
    if (!ctx?.userId || !ctx?.accessToken) return;
    _ctx = { userId: ctx.userId, accessToken: ctx.accessToken };
    const res = await pull();
    // Sunucuda hiç veri yoksa bu cihazdaki durumu ilk kayıt olarak gönder
    if (res.empty || res.localNewer) await push();
  }

  function onLogout() {
    clearTimeout(_pushTimer);
    _ctx = null;
  }

  window.ilgezdiSync = { onLogin, onLogout, schedulePush, pushNow: push, pullNow: pull,
    isActive: () => !!_ctx };
})();
