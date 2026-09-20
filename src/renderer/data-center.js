/**
 * İlgezdi — Veri ve Gizlilik sayfası (kenar çubuğu › anahtar deliği simgesi).
 *
 * Kullanıcı hangi verinin cihazda kaldığını, hangisinin nereye gittiğini tek sayfada görür
 * ve her birini ayrı ayrı açıp kapatır. Değerler ana süreçte tutulur ve doğrulanır
 * (main.js › data-center-set); her değişiklik onay kayıtlarına yazılır (consent-log.js).
 * Öğe listesi renderer/data-catalog.js'tedir; Ayarlar'daki aynı anahtarlar da aynı kimlikle
 * kaydedilir.
 */

'use strict';

(function () {
  const C = () => window.ilgezdiDataCatalog;
  const sb = () => window.secureBrowser;
  const esc = (s) => window.ilgezdiHtml.esc(s);

  const SECTION_KEYS = { device: 'device', ilgezdi: 'ilgezdi', account: 'account', ulgen: 'ulgen', sites: 'sites' };
  const LOG_PAGE = 25;

  // Ayarlar › Gizlilik sekmesinden taşınan teknik ayarlar (Burak, 20 Eyl 2026).
  // Değerler ana süreçte ayrıca doğrulanır (browser-commands.js → normalizeWebrtcPolicy).
  const SECURE_DNS_CHOICES = [
    ['automatic',  'settings.dns.automatic'],
    ['cloudflare', 'Cloudflare (1.1.1.1)'],
    ['quad9',      'Quad9 (9.9.9.9)'],
    ['adguard',    'AdGuard DNS'],
    ['google',     'Google Public DNS'],
    ['off',        'settings.off'],
  ];
  const WEBRTC_OPTIONS = [
    ['default_public_interface_only',         'settings.webrtc.publicOnly'],
    ['default_public_and_private_interfaces', 'settings.webrtc.publicPrivate'],
    ['default',                               'settings.webrtc.all'],
    ['disable_non_proxied_udp',               'settings.webrtc.noUdp'],
  ];

  let state = null;          // { values, searchEngine, secureDns, vpnEnabled }
  let logEntries = [];
  let logTotal = 0;

  function itemTitle(item) { return item.label ? T(item.label) : T('data.item.' + item.id + '.title'); }
  function itemDesc(item)  { return item.label ? T(item.label + 'Hint') : T('data.item.' + item.id + '.desc'); }

  function rowHtml(item) {
    const id = item.id;
    const dest = item.dest ? `<span class="dc-dest dc-dest-${esc(item.dest)}">${TH('data.dest.' + item.dest)}</span>` : '';
    const soon = item.soon ? `<span class="dc-dest dc-soon">${TH('data.soon')}</span>` : '';
    return `
      <div class="dc-row${item.soon ? ' dc-row-soon' : ''}" data-id="${esc(id)}">
        <div class="dc-row-text">
          <div class="dc-row-top">
            <label class="dc-row-title" for="dc-t-${esc(id)}">${esc(itemTitle(item))}</label>
            ${dest}${soon}
          </div>
          <p class="dc-row-desc" id="dc-d-${esc(id)}">${esc(itemDesc(item))}</p>
          <p class="dc-row-note" id="dc-n-${esc(id)}" hidden></p>
        </div>
        <label class="dc-switch">
          <input type="checkbox" role="switch" id="dc-t-${esc(id)}" data-id="${esc(id)}" aria-describedby="dc-d-${esc(id)} dc-n-${esc(id)}" ${item.soon ? 'disabled' : ''}>
          <span class="dc-slider" aria-hidden="true"></span>
        </label>
      </div>`;
  }

  function sectionHtml(key, extra = '') {
    const items = C().ITEMS.filter((it) => it.section === key);
    return `
      <section class="dc-section" id="dc-sec-${key}" aria-labelledby="dc-h-${key}">
        <header class="dc-sec-head">
          <h2 id="dc-h-${key}">${TH('data.sec.' + key)}</h2>
          <p>${TH('data.sec.' + key + 'Lead')}</p>
        </header>
        <div class="dc-rows">${items.map(rowHtml).join('')}</div>
        ${extra}
      </section>`;
  }

  // Ağ ve site izinleri: güvenli DNS, WebRTC, zararlı site listeleri ve site izin kayıtları.
  function networkHtml() {
    const secim = (id, key, options, current) => `
      <div class="dc-net-row">
        <label for="${id}">${TH(key)}</label>
        <select class="page-select" id="${id}">
          ${options.map(([v, t]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${t.startsWith('settings.') ? TH(t) : esc(t)}</option>`).join('')}
        </select>
      </div>`;
    return `
      <section class="dc-section" id="dc-sec-network" aria-labelledby="dc-h-network">
        <header class="dc-sec-head">
          <h2 id="dc-h-network">${TH('data.sec.network')}</h2>
          <p>${TH('data.sec.networkLead')}</p>
        </header>
        <div class="dc-net">
          ${secim('dc-secure-dns', 'settings.dns.label', SECURE_DNS_CHOICES, '')}
          <p class="dc-net-hint">${TH('settings.dns.hint')}</p>
          ${secim('dc-webrtc', 'settings.webrtc.label', WEBRTC_OPTIONS, '')}
          <p class="dc-net-hint">${TH('settings.webrtc.hint')}</p>
        </div>
        <div class="dc-net-block">
          <h3>${TH('settings.threat.title')}</h3>
          <div id="dc-threat-status" aria-live="polite"><p class="dc-net-hint">${TH('common.loading')}</p></div>
          <button type="button" class="page-btn sm" id="dc-threat-update">${TH('settings.threat.update')}</button>
          <p class="dc-net-hint">${TH('settings.threat.hint')}</p>
        </div>
        <div class="dc-net-block">
          <h3>${TH('settings.sitePerms.title')}</h3>
          <div id="dc-site-perms"><p class="dc-net-hint">${TH('common.loading')}</p></div>
          <button type="button" class="page-btn sm" id="dc-site-perm-reset">${TH('settings.sitePerms.reset')}</button>
        </div>
      </section>`;
  }

  function render() {
    const jump = [...C().SECTIONS, 'network', 'thirdParty', 'log'].map((k) =>
      `<button type="button" class="dc-jump-btn" data-target="dc-sec-${k}">${TH('data.sec.' + k)}</button>`).join('');
    const ulgenFoot = `
      <div class="dc-ulgen-foot">
        <p class="dc-callout" id="dc-ulgen-status">${TH('data.ulgen.local')}</p>
        <div class="dc-stored">
          <div>
            <div class="dc-stored-title">${TH('data.ulgen.stored')}</div>
            <div class="dc-stored-value" id="dc-ulgen-stored">${TH('data.ulgen.storedNone')}</div>
          </div>
          <button type="button" class="page-btn sm danger" id="dc-ulgen-delete" disabled>${TH('data.ulgen.delete')}</button>
        </div>
        <div class="dc-stored">
          <div>
            <div class="dc-stored-title">${TH('data.ulgen.pack')}</div>
            <div class="dc-stored-value" id="dc-ceviri-paket">${TH('data.ulgen.packUnknown')}</div>
          </div>
          <button type="button" class="page-btn sm danger" id="dc-ceviri-sil">${TH('data.ulgen.packDelete')}</button>
        </div>
      </div>`;
    return `
      <div class="page fade-up dc-page" id="data-page">
        <div class="page-head">
          <div>
            <h1>${TH('data.title')}</h1>
            <p class="page-sub dc-sub">${TH('data.subtitle')}</p>
          </div>
          <div class="right"><div class="dc-summary" id="dc-summary" aria-live="polite"></div></div>
        </div>
        <nav class="dc-jump" aria-label="${TH('data.jump')}">${jump}</nav>
        <p class="dc-toast" id="dc-toast" role="status" aria-live="polite"></p>
        ${sectionHtml('device')}
        ${sectionHtml('ilgezdi')}
        ${sectionHtml('account', `<p class="dc-foot-note" id="dc-account-note"></p>`)}
        ${sectionHtml('ulgen', ulgenFoot)}
        ${sectionHtml('sites')}
        ${networkHtml()}
        <section class="dc-section" id="dc-sec-thirdParty" aria-labelledby="dc-h-thirdParty">
          <header class="dc-sec-head">
            <h2 id="dc-h-thirdParty">${TH('data.sec.thirdParty')}</h2>
            <p>${TH('data.sec.thirdPartyLead')}</p>
          </header>
          <div class="dc-rows" id="dc-tp-rows"></div>
        </section>
        <section class="dc-section" id="dc-sec-log" aria-labelledby="dc-h-log">
          <header class="dc-sec-head">
            <h2 id="dc-h-log">${TH('data.sec.log')}</h2>
            <p>${TH('data.sec.logLead')}</p>
          </header>
          <div class="dc-log-bar">
            <span class="dc-verify" id="dc-verify" aria-live="polite"></span>
            <button type="button" class="page-btn sm" id="dc-log-verify">${TH('data.log.verify')}</button>
            <button type="button" class="page-btn sm" id="dc-log-export">${TH('data.log.export')}</button>
          </div>
          <div class="dc-log-wrap">
            <table class="dc-log">
              <thead><tr>
                <th scope="col">${TH('data.log.col.time')}</th>
                <th scope="col">${TH('data.log.col.item')}</th>
                <th scope="col">${TH('data.log.col.change')}</th>
                <th scope="col">${TH('data.log.col.source')}</th>
                <th scope="col">${TH('data.log.col.version')}</th>
              </tr></thead>
              <tbody id="dc-log-body"><tr><td colspan="5" class="dc-log-empty">${TH('common.loading')}</td></tr></tbody>
            </table>
          </div>
          <div class="page-more"><button type="button" class="page-btn" id="dc-log-more" hidden>${TH('data.log.more')}</button></div>
        </section>
      </div>`;
  }

  // ── Durumu ekrana yansıt ────────────────────────────────────────────────────
  function applyValues() {
    if (!state) return;
    const values = state.values || {};
    for (const item of C().ITEMS) {
      if (item.soon) continue;
      const input = document.getElementById('dc-t-' + item.id);
      if (!input) continue;
      const v = values[item.id];
      input.checked = v === true;
      const parentOn = !item.requires || values[item.requires] === true;
      input.disabled = !parentOn;
      const row = input.closest('.dc-row');
      row?.classList.toggle('dc-row-locked', !parentOn);
      row?.classList.toggle('dc-row-on', v === true);
      const note = document.getElementById('dc-n-' + item.id);
      if (note) {
        let text = '';
        if (!parentOn) text = T('data.requires', { name: itemTitle(C().BY_ID[item.requires]) });
        else if (item.tri && v === null) text = T('data.item.diagnostics.unasked');
        note.textContent = text;
        note.hidden = !text;
      }
    }
    // Özet: dışarıya veri gönderen özelliklerden kaçı açık
    const senders = C().ITEMS.filter((it) => C().sendsData(it));
    const on = senders.filter((it) => values[it.id] === true).length;
    const sum = document.getElementById('dc-summary');
    if (sum) sum.innerHTML = TH('data.summary', { on, total: senders.length }, {});
    renderThirdParty();
    renderAccountNote();
  }

  function renderAccountNote() {
    const el = document.getElementById('dc-account-note');
    if (!el) return;
    el.textContent = window.ilgezdiSync?.isActive?.() ? T('data.account.signedIn') : T('data.account.signedOut');
  }

  function renderThirdParty() {
    const box = document.getElementById('dc-tp-rows');
    if (!box || !state) return;
    const names = C().SEARCH_ENGINE_NAMES;
    const dnsNames = C().DNS_PROVIDER_NAMES;
    const dns = state.secureDns;
    const dnsDesc = dns === 'off' ? T('data.tp.dnsOff')
      : dns === 'automatic' ? T('data.tp.dnsAuto')
      : T('data.tp.dnsDesc', { name: dnsNames[dns] || dns });
    const rows = [
      { id: 'search', title: T('data.tp.search'), value: names[state.searchEngine] || state.searchEngine, desc: T('data.tp.searchDesc', { name: names[state.searchEngine] || state.searchEngine }), tab: 'general' },
      // DNS seçimi artık bu sayfada (Ağ ve site izinleri); Ayarlar'a göndermek kısır döngü olurdu.
      { id: 'dns', title: T('data.tp.dns'), value: dns === 'off' ? T('settings.off') : dns === 'automatic' ? T('settings.dns.automatic') : (dnsNames[dns] || dns), desc: dnsDesc, hedef: 'dc-sec-network' },
      { id: 'pwned', title: T('data.tp.pwned'), value: T('data.tp.onDemand'), desc: T('data.tp.pwnedDesc'), tab: 'passwords' },
      { id: 'vpn', title: T('data.tp.vpn'), value: state.vpnEnabled ? T('data.log.on') : T('data.log.off'), desc: T('data.tp.vpnDesc'), vpn: true },
    ];
    box.innerHTML = rows.map((r) => `
      <div class="dc-row dc-row-info" data-tp="${esc(r.id)}">
        <div class="dc-row-text">
          <div class="dc-row-top"><span class="dc-row-title">${esc(r.title)}</span><span class="dc-tp-value">${esc(r.value)}</span></div>
          <p class="dc-row-desc">${esc(r.desc)}</p>
        </div>
        <button type="button" class="page-btn sm ghost dc-tp-change" data-tab="${esc(r.tab || '')}" data-hedef="${esc(r.hedef || '')}" ${r.vpn ? 'data-vpn="1"' : ''}>${TH('data.tp.change')}</button>
      </div>`).join('');
  }

  // ── Onay kayıtları ──────────────────────────────────────────────────────────
  function boolText(v) {
    if (v === true) return T('data.log.on');
    if (v === false) return T('data.log.off');
    return T('data.log.unset');
  }
  function sourceText(s) {
    const key = { 'data-center': 'dataCenter', settings: 'settings', sync: 'sync', reset: 'reset', 'first-run': 'firstRun', 'diag-dialog': 'diagDialog', ulgen: 'ulgen', migration: 'migration' }[s] || 'settings';
    return T('data.log.source.' + key);
  }
  function logRowHtml(e) {
    const I = window.ilgezdiI18n;
    const when = I.formatDate(e.at, { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + I.formatTime(e.at, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let item, change;
    if (e.type === 'baseline') {
      item = T('data.log.baseline');
      const vals = e.values || {};
      const ids = Object.keys(vals);
      const on = ids.filter((k) => vals[k] === true).length;
      change = T('data.log.baselineChange', { on, off: ids.length - on });
    } else {
      const it = C().BY_ID[e.id];
      item = it ? itemTitle(it) : String(e.id || '');
      change = null;
    }
    const changeHtml = change !== null
      ? esc(change)
      : `<span class="dc-from">${esc(boolText(e.from))}</span> <span aria-hidden="true">→</span> <span class="dc-to ${e.to === true ? 'is-on' : 'is-off'}">${esc(boolText(e.to))}</span>`;
    return `<tr>
      <td class="dc-log-time">${esc(when)}</td>
      <td>${esc(item)}</td>
      <td class="dc-log-change">${changeHtml}</td>
      <td>${esc(sourceText(e.source))}</td>
      <td class="dc-log-ver">${esc(e.app || '')}</td>
    </tr>`;
  }
  function renderLog() {
    const body = document.getElementById('dc-log-body');
    if (!body) return;
    body.innerHTML = logEntries.length
      ? logEntries.map(logRowHtml).join('')
      : `<tr><td colspan="5" class="dc-log-empty">${TH('data.log.empty')}</td></tr>`;
    const more = document.getElementById('dc-log-more');
    if (more) more.hidden = !(logEntries.length < logTotal);
  }
  async function loadLog(reset) {
    const before = !reset && logEntries.length ? logEntries[logEntries.length - 1].seq : null;
    let r = null;
    try { r = await sb().dataCenter.logList({ limit: LOG_PAGE, before }); } catch {}
    if (!r) return;
    logEntries = reset ? r.entries : logEntries.concat(r.entries);
    logTotal = r.total;
    renderLog();
  }
  async function refreshVerify() {
    const el = document.getElementById('dc-verify');
    if (!el) return;
    let v = null;
    try { v = await sb().dataCenter.logVerify(); } catch {}
    if (!v) { el.textContent = ''; return; }
    el.classList.toggle('is-broken', !v.ok);
    el.textContent = v.ok ? T('data.log.verifyOk', { count: v.count }) : T('data.log.verifyBroken', { line: (v.brokenAt || 0) + 1 });
  }

  // ── Olaylar ─────────────────────────────────────────────────────────────────
  let toastTimer = null;
  function toast(text, kind) {
    const el = document.getElementById('dc-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', kind === 'error');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  async function onToggle(input) {
    const id = input.dataset.id;
    const want = input.checked;
    input.disabled = true;
    let r = null;
    try { r = await sb().dataCenter.set(id, want); } catch {}
    if (!r || !r.ok) {
      input.checked = !want;
      input.disabled = false;
      if (r && r.error === 'requires') toast(T('data.requires', { name: itemTitle(C().BY_ID[r.requires]) }), 'error');
      else toast(T('data.saveFailed'), 'error');
      return;
    }
    state = r;
    applyValues();
    // Senkronlanan ayarlar ve senkron seçimleri hesaba hemen gitsin (kapatılan tür sunucudan silinir).
    const item = C().BY_ID[id];
    if (item && (item.section === 'account' || item.section === 'sites')) window.ilgezdiSync?.schedulePush?.();
    window.dispatchEvent(new CustomEvent('ilgezdi-data-changed', { detail: { changes: r.changes } }));
    toast(T('data.saved'));
    await Promise.all([loadLog(true), refreshVerify(), refreshUlgenData()]);
  }

  function bind() {
    const page = document.getElementById('data-page');
    if (!page || page.dataset.bound) return;
    page.dataset.bound = '1';
    page.addEventListener('change', (e) => {
      const input = e.target.closest?.('input[type="checkbox"][data-id]');
      if (input) onToggle(input);
    });
    page.addEventListener('click', async (e) => {
      const jumpBtn = e.target.closest?.('.dc-jump-btn');
      if (jumpBtn) {
        document.getElementById(jumpBtn.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const change = e.target.closest?.('.dc-tp-change');
      if (change) {
        if (change.dataset.vpn) document.getElementById('btn-vpn-panel')?.click();
        else if (change.dataset.hedef) document.getElementById(change.dataset.hedef)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.ilgezdiOpenSettings?.(change.dataset.tab || 'general');
        return;
      }
      if (e.target.closest?.('#dc-log-more')) { loadLog(false); return; }
      if (e.target.closest?.('#dc-ulgen-delete')) {
        let r = null;
        try { r = await sb().ulgen?.veriSil?.(); } catch {}
        if (r && r.ok) toast(T('data.ulgen.deleted')); else toast(T('data.saveFailed'), 'error');
        await refreshUlgenData();
        return;
      }
      // İndirilen çeviri dil paketini sil: izin kapatılınca motor zaten siliyor, bu düğme
      // izni açık tutup yalnız paketi kaldırmak isteyen için.
      if (e.target.closest?.('#dc-ceviri-sil')) {
        let r = null;
        try { r = await sb().ulgen?.ceviriSil?.(); } catch {}
        toast(r && r.ok ? T('data.ulgen.packDeleted') : T('data.ulgen.packNone'));
        await refreshUlgenData();
        return;
      }
      if (e.target.closest?.('#dc-log-verify')) { await refreshVerify(); return; }
      if (e.target.closest?.('#dc-log-export')) {
        let r = null;
        try { r = await sb().dataCenter.logExport(); } catch {}
        if (r && r.ok) toast(T('data.log.exported'));
        else if (r && !r.canceled) toast(T('data.saveFailed'), 'error');
      }
    });
  }

  // Ülgen'in bu cihazda sakladığı veriler (şu an yalnızca ilgi etiketleri; main/ulgen-motor.js).
  async function refreshUlgenData() {
    const value = document.getElementById('dc-ulgen-stored');
    const del = document.getElementById('dc-ulgen-delete');
    if (!value || !del) return;
    let d = null;
    try { d = await sb().ulgen?.veri?.(); } catch { d = null; }
    const tags = Array.isArray(d && d.ilgi) ? d.ilgi : [];
    value.textContent = tags.length
      ? T('data.ulgen.storedTags', { count: tags.length, tags: tags.slice(0, 8).map((t) => t.etiket).join(', ') })
      : T('data.ulgen.storedNone');
    del.disabled = !tags.length;

    // Dil paketi durumu: motor bildirirse kurulu/indirilmedi yazılır, bildirmezse
    // satır "bilinmiyor" kalır ve düğme yine de silmeyi dener (köprü eski olabilir).
    const paket = document.getElementById('dc-ceviri-paket');
    const sil = document.getElementById('dc-ceviri-sil');
    if (!paket || !sil) return;
    let durum = null;
    try { durum = await sb().ulgen?.durum?.(); } catch { durum = null; }
    const kurulu = durum && durum.ceviriPaket ? durum.ceviriPaket.kurulu : null;
    paket.textContent = kurulu === true ? T('data.ulgen.packYes')
      : kurulu === false ? T('data.ulgen.packNone')
      : T('data.ulgen.packUnknown');
    sil.disabled = kurulu === false;
  }

  // ── Ağ ve site izinleri ─────────────────────────────────────────────────────
  // Ayarlar › Gizlilik sekmesinden buraya taşındı. Buradaki iki seçim katalog öğesi
  // değil (açık/kapalı değil, sağlayıcı seçimi); onay kaydı üretmez, doğrudan kaydedilir.
  async function initNetwork() {
    const dns = document.getElementById('dc-secure-dns');
    const rtc = document.getElementById('dc-webrtc');
    if (!dns || !rtc) return;
    let cfg = null;
    try { cfg = await sb().getConfig(); } catch {}
    dns.value = (cfg && cfg.secureDns) || 'automatic';
    rtc.value = (cfg && cfg.webrtcPolicy) || 'default_public_interface_only';
    dns.addEventListener('change', async () => {
      await sb().saveConfig({ secureDns: dns.value }).catch(() => null);
      toast(T('data.net.saved'));
    });
    rtc.addEventListener('change', async () => {
      await sb().saveConfig({ webrtcPolicy: rtc.value }).catch(() => null);
      toast(T('data.net.saved'));
    });
    document.getElementById('dc-site-perm-reset')?.addEventListener('click', async () => {
      const r = await sb().site?.resetPermissions?.().catch(() => null);
      if (r && r.ok) toast(T('settings.sitePerms.resetDone'));
      sitePermsList();
    });
    document.getElementById('dc-threat-update')?.addEventListener('click', threatUpdate);
    if (!threatSubscribed) {
      threatSubscribed = true;
      sb().threats?.onStatus?.((st) => { if (document.getElementById('dc-threat-status')) threatStatus(st); });
    }
    await Promise.all([sitePermsList(), threatLoad()]);
  }

  async function sitePermsList() {
    const box = document.getElementById('dc-site-perms');
    if (!box) return;
    let list = [];
    try { list = (await sb().site?.listPermissions?.()) || []; } catch {}
    box.replaceChildren();
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'dc-net-hint';
      p.textContent = T('settings.sitePerms.none');
      box.appendChild(p);
      return;
    }
    for (const izin of list) {
      const satir = document.createElement('div');
      satir.className = 'dc-perm';
      const metin = document.createElement('div');
      const baslik = document.createElement('div');
      baslik.className = 'dc-perm-origin';
      baslik.textContent = izin.origin.replace(/^https?:\/\//, '');
      const alt = document.createElement('div');
      alt.className = 'dc-net-hint';
      alt.textContent = izin.label + ' · ' + T(izin.decision === 'allow' ? 'settings.sitePerms.allowed' : 'settings.sitePerms.blocked');
      metin.append(baslik, alt);
      const sil = document.createElement('button');
      sil.type = 'button';
      sil.className = 'page-btn sm';
      sil.textContent = T('settings.sitePerms.remove');
      sil.addEventListener('click', async () => {
        const r = await sb().site?.setPermission?.(izin.origin, izin.permission, 'ask').catch(() => null);
        if (r && r.ok === false) toast(r.error || T('settings.sitePerms.removeFailed'), 'error');
        sitePermsList();
      });
      satir.append(metin, sil);
      box.appendChild(satir);
    }
  }

  // Zararlı site listelerinin durumu: kaynak başına kayıt sayısı, son denetim ve hata.
  // Hata metni ağdan gelebildiği için kutu textContent ile kurulur.
  let threatSubscribed = false;
  let lastThreat = null;

  async function threatLoad() {
    let st = null;
    try { st = await sb().threats?.status?.(); } catch {}
    threatStatus(st);
  }

  function threatStatus(st) {
    const box = document.getElementById('dc-threat-status');
    if (!box) return;
    lastThreat = st || lastThreat;
    box.replaceChildren();
    const satir = (cls, text, renk) => {
      const d = document.createElement('div');
      d.className = cls;
      if (renk) d.style.color = renk;
      d.textContent = text;
      return d;
    };
    if (!st) { box.appendChild(satir('dc-net-hint', T('settings.threat.statusFailed'), 'var(--danger)')); return; }
    const sayi = (n) => window.ilgezdiI18n.formatNumber(n);
    for (const s of st.sources || []) {
      const kutu = document.createElement('div');
      kutu.className = 'dc-threat-src';
      const metin = (alan, yedek) => (window.ilgezdiI18n.has('threat.source.' + s.id + '.' + alan) ? T('threat.source.' + s.id + '.' + alan) : yedek);
      kutu.appendChild(satir('dc-perm-origin', metin('name', s.name)));
      const zaman = s.updatedAt ? window.ilgezdiI18n.formatDateTime(s.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) : '';
      kutu.appendChild(satir('dc-net-hint', s.entries
        ? `${T('settings.threat.entries', { count: s.entries, when: zaman })}${s.stale ? T('settings.threat.stale') : ''}${st.updating ? T('settings.threat.updating') : ''}`
        : (st.updating ? T('settings.threat.downloading') : T('settings.threat.notYet'))));
      if (s.covers) kutu.appendChild(satir('dc-net-hint', metin('covers', s.covers) + (s.license ? T('settings.threat.license', { license: metin('license', s.license) }) : '')));
      if (s.lastError) kutu.appendChild(satir('dc-net-hint', T('settings.threat.lastError', { error: s.lastError }), 'var(--danger)'));
      box.appendChild(kutu);
    }
    if (!(st.sources || []).length) box.appendChild(satir('dc-net-hint', T('settings.threat.notYet')));
    if (st.blockedPages || st.blockedResources) {
      box.appendChild(satir('dc-net-hint', T('settings.threat.blockedSession', { pages: Number(st.blockedPages) || 0, resources: Number(st.blockedResources) || 0 })));
    }
  }

  async function threatUpdate(e) {
    const btn = e.currentTarget;
    const eski = btn.textContent;
    const once = lastThreat;
    btn.disabled = true;
    btn.textContent = T('pwAudit.checking');
    let st = null;
    try { st = await sb().threats?.updateNow?.(); } catch {}
    btn.disabled = false;
    btn.textContent = eski;
    threatStatus(st);
    if (!st) return;
    const sayi = (n) => window.ilgezdiI18n.formatNumber(n);
    const degisti = !once || st.sources.some((s) => {
      const b = once.sources.find((x) => x.id === s.id);
      return !b || b.updatedAt !== s.updatedAt || b.lastError !== s.lastError;
    });
    if (!st.enabled) toast(T('settings.threat.disabledToast'));
    else if (st.sources.some((s) => s.lastError)) toast(T('settings.threat.someFailed'), 'error');
    else if (!degisti) toast(T('settings.threat.recent'));
    else toast(T('settings.threat.checked', { counts: st.sources.map((s) => sayi(s.entries)).join(' + ') }));
  }

  async function init() {
    bind();
    try { state = await sb().dataCenter.state(); } catch { state = null; }
    applyValues();
    await Promise.all([loadLog(true), refreshVerify(), refreshUlgenData(), initNetwork()]);
    const target = pendingSection;
    pendingSection = null;
    if (target) document.getElementById('dc-sec-' + target)?.scrollIntoView({ block: 'start' });
  }

  // Başka yerden (Ayarlar, Ülgen paneli) sayfayı belirli bir bölümde açar. Sayfa artık
  // kenar panelinde de açılabildiği için "açık mı" sorusu DOM'dan sorulur.
  let pendingSection = null;
  function open(section) {
    pendingSection = SECTION_KEYS[section] || (['log', 'thirdParty', 'network'].includes(section) ? section : null);
    if (document.getElementById('data-page')) {
      const target = pendingSection;
      pendingSection = null;
      if (target) document.getElementById('dc-sec-' + target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    document.getElementById('sb-data')?.click();
  }

  // Ayarlar'dan ya da senkrondan gelen değişiklik: sayfa açıksa yeniden okunur.
  async function refreshIfOpen() {
    if (!document.getElementById('data-page')) return;
    try { state = await sb().dataCenter.state(); } catch { return; }
    applyValues();
    await Promise.all([loadLog(true), refreshVerify()]);
  }
  window.addEventListener('ilgezdi-settings-saved', refreshIfOpen);
  window.addEventListener('ilgezdi-sync-applied', refreshIfOpen);

  window.ilgezdiDataCenter = { render, init, open };
})();
