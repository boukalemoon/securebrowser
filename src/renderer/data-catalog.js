/**
 * İlgezdi — Veri ve Gizlilik kataloğu.
 *
 * Kullanıcının açıp kapatabildiği her veri izni burada tek listede durur. Hem ana süreç
 * (değişiklikleri onay kaydına yazmak için) hem arayüz (Veri ve Gizlilik sayfası) bu
 * listeyi kullanır; böylece Ayarlar'dan yapılan bir değişiklik de aynı kimlikle kaydedilir.
 *
 * Öğe türleri:
 *  - config:  config.json'daki bir anahtar. `on`/`off` varsa anahtar metin değer taşır
 *             (ör. startupMode: 'restore' / 'homepage').
 *  - consent: yalnızca bu sayfada verilen izin; config.consents içinde, ana süreç yazar.
 *  - soon:    henüz olmayan izinler (senkron türleri, Ülgen hesap/öneri/geliştirme); anahtar
 *             kapalı ve dokunulamaz görünür, değeri kayda girmez.
 *
 * dest: verinin gittiği yer (rozet) — device | ilgezdi | github | qrtim | ulgen.
 * requires: üst izin kapalıyken bu izin açılamaz; üst izin kapanınca bu da kapanır.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ilgezdiDataCatalog = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SECTIONS = ['device', 'ilgezdi', 'account', 'ulgen', 'sites'];

  const ITEMS = [
    // Cihazda kalanlar
    { id: 'visitLog',            section: 'device',  config: 'logEnabled',           def: true,  dest: 'device' },
    { id: 'omniboxHistory',      section: 'device',  config: 'omniboxHistory',       def: true,  dest: 'device' },
    { id: 'restoreSession',      section: 'device',  config: 'startupMode', on: 'restore', off: 'homepage', def: false, dest: 'device' },
    { id: 'savePasswords',       section: 'device',  config: 'offerToSavePasswords', def: true,  dest: 'device' },
    { id: 'clearHistoryOnExit',  section: 'device',  config: 'clearHistoryOnExit',   def: false, dest: 'device' },
    { id: 'clearSiteDataOnExit', section: 'device',  config: 'clearSiteDataOnExit',  def: false, dest: 'device' },
    // İnternete bağlanan İlgezdi hizmetleri
    { id: 'diagnostics',         section: 'ilgezdi', config: 'diagnosticsConsent',   def: null,  dest: 'ilgezdi', tri: true },
    { id: 'updateCheck',         section: 'ilgezdi', config: 'autoUpdateCheck',      def: true,  dest: 'github' },
    { id: 'threatLists',         section: 'ilgezdi', config: 'threatProtection',     def: true,  dest: 'ilgezdi' },
    { id: 'discoverFeed',        section: 'ilgezdi', config: 'discoverFeed',         def: true,  dest: 'ilgezdi' },
    // QRtım hesabı ve senkron
    { id: 'syncSettings',        section: 'account', config: 'syncSettings',         def: true,  dest: 'qrtim' },
    { id: 'syncBookmarks',       section: 'account', config: 'syncBookmarks',        def: true,  dest: 'qrtim' },
    { id: 'syncNotes',           section: 'account', soon: true,                                 dest: 'qrtim' },
    { id: 'syncPasswords',       section: 'account', soon: true,                                 dest: 'qrtim' },
    { id: 'syncHistory',         section: 'account', soon: true,                                 dest: 'qrtim' },
    { id: 'syncTabs',            section: 'account', soon: true,                                 dest: 'qrtim' },
    // Ülgen — hepsi varsayılan kapalı. Motor bu cihazda çalışır (main/ulgen-motor.js: ağ yok,
    // dil modeli yok); hesap, öneri ve geliştirme izinleri motor kullanmadığı için "yakında".
    { id: 'ulgenChat',           section: 'ulgen',   consent: true, def: false, dest: 'device' },
    { id: 'ulgenPage',           section: 'ulgen',   consent: true, def: false, dest: 'device', requires: 'ulgenChat' },
    { id: 'ulgenHistory',        section: 'ulgen',   consent: true, def: false, dest: 'device', requires: 'ulgenChat' },
    { id: 'ulgenInterests',      section: 'ulgen',   consent: true, def: false, dest: 'device', requires: 'ulgenChat' },
    { id: 'ulgenAccount',        section: 'ulgen',   soon: true,                  dest: 'qrtim' },
    { id: 'ulgenRecommend',      section: 'ulgen',   soon: true,                  dest: 'ulgen' },
    { id: 'ulgenImprove',        section: 'ulgen',   soon: true,                  dest: 'ulgen' },
    // Sitelere karşı korumalar (etiketler Ayarlar › Gizlilik ile aynı)
    { id: 'gpc',                 section: 'sites',   config: 'globalPrivacyControl',   def: true,  label: 'settings.identity.gpc' },
    { id: 'dnt',                 section: 'sites',   config: 'doNotTrack',             def: false, label: 'settings.identity.dnt' },
    { id: 'fingerprint',         section: 'sites',   config: 'fingerprintShield',      def: true,  label: 'settings.identity.fingerprint' },
    { id: 'thirdPartyCookies',   section: 'sites',   config: 'blockThirdPartyCookies', def: true,  label: 'settings.blocking.thirdPartyCookies' },
    { id: 'cleanLinks',          section: 'sites',   config: 'cleanLinks',             def: true,  label: 'settings.identity.cleanLinks' },
  ];

  const BY_ID = Object.create(null);
  for (const it of ITEMS) BY_ID[it.id] = it;

  // Dışarıya veri gönderen öğeler (özet sayacı için): hedefi cihaz olmayan, "yakında" olmayan.
  function sendsData(item) {
    return !!item && !item.soon && item.section !== 'sites' && item.dest !== 'device';
  }

  /** Öğenin şimdiki değeri: true | false | null (yalnızca tri: henüz sorulmadı). */
  function valueOf(item, cfg) {
    const c = cfg || {};
    if (!item || item.soon) return false;
    if (item.consent) return !!(c.consents && c.consents[item.id] === true);
    const raw = c[item.config];
    if (item.on !== undefined) return raw === item.on;
    if (item.tri) return raw === true ? true : raw === false ? false : null;
    if (raw === undefined) return item.def === true;
    return raw === true;
  }

  /** Tüm öğelerin değerleri: { id: değer }. "Yakında" olanlar dahil edilmez. */
  function snapshot(cfg) {
    const out = {};
    for (const it of ITEMS) if (!it.soon) out[it.id] = valueOf(it, cfg);
    return out;
  }

  /** İki anlık görüntü arasındaki farklar: [{ id, from, to }] (katalog sırasıyla). */
  function diff(before, after) {
    const out = [];
    for (const it of ITEMS) {
      if (it.soon) continue;
      const a = before ? before[it.id] : undefined;
      const b = after ? after[it.id] : undefined;
      if (a !== b) out.push({ id: it.id, from: a === undefined ? null : a, to: b === undefined ? null : b });
    }
    return out;
  }

  /** config öğesi için yazılacak değer. */
  function configValue(item, on) {
    if (item.on !== undefined) return on ? item.on : item.off;
    return !!on;
  }

  /** Bu öğeye bağlı (requires ile) öğeler, dolaylı olanlar dahil. */
  function dependentsOf(id) {
    const out = [];
    const walk = (parent) => {
      for (const it of ITEMS) if (it.requires === parent && !out.includes(it.id)) { out.push(it.id); walk(it.id); }
    };
    walk(id);
    return out;
  }

  const SEARCH_ENGINE_NAMES = Object.freeze({
    duckduckgo: 'DuckDuckGo', google: 'Google', bing: 'Bing', yandex: 'Yandex', yahoo: 'Yahoo',
    brave: 'Brave Search', ecosia: 'Ecosia', startpage: 'Startpage',
  });
  const DNS_PROVIDER_NAMES = Object.freeze({
    cloudflare: 'Cloudflare', quad9: 'Quad9', adguard: 'AdGuard', google: 'Google',
  });

  return { SECTIONS, ITEMS, BY_ID, sendsData, valueOf, snapshot, diff, configValue, dependentsOf, SEARCH_ENGINE_NAMES, DNS_PROVIDER_NAMES };
}));
