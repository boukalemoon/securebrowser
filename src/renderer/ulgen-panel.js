/**
 * İlgezdi — Ülgen yan paneli (yerel asistan).
 *
 * Motor ana süreçte çalışır (src/main/ulgen-motor.js): AĞA ÇIKMAZ, dil modeli
 * kullanmaz. Bu dosya yalnız arayüzdür; motora dar köprüden (`secureBrowser.ulgen`)
 * ulaşır ve kendisi hiçbir ağ isteği yapmaz, hiçbir şey saklamaz.
 *
 * Güvenlik:
 *   · Sayfadan ve geçmişten gelen HER metin textContent ile basılır (innerHTML yok).
 *   · Sabit iskelet TH() ile kaçışlanır. Satır içi olay işleyicisi yok (CSP).
 *   · Arama/sekme açma yalnız kullanıcı düğmeye basınca ana sürece gider.
 * İzinler Veri ve Gizlilik'tedir; panel yalnız okur ve yönlendirir.
 */

'use strict';

function injectUlgenStyles() {
  if (document.getElementById('ilgezdi-ulgen-style')) return;
  const s = document.createElement('style');
  s.id = 'ilgezdi-ulgen-style';
  s.textContent = `
    .ulgen-body { display:flex; flex-direction:column; gap:12px; padding:14px 16px; }
    .ulgen-hero { text-align:center; padding:12px 10px 2px; }
    .ulgen-hero-icon { font-size:28px; line-height:1; }
    .ulgen-hero-sub { font-size:12px; color:var(--text-muted); margin-top:6px; }
    .ulgen-note { font-size:12px; line-height:1.5; color:var(--text-secondary); background:var(--bg-soft,rgba(255,255,255,.03));
                  border:1px solid var(--border-color); border-radius:10px; padding:10px 12px; }
    .ulgen-chips { display:flex; flex-wrap:wrap; gap:7px; }
    .ulgen-chip { font-size:11.5px; color:var(--ink); border:1px solid var(--border-color); border-radius:999px;
                  padding:6px 11px; background:none; cursor:pointer; }
    .ulgen-chip:hover, .ulgen-chip.active { border-color:var(--accent,#6aa9ff); }
    .ulgen-chip[disabled] { opacity:.5; cursor:not-allowed; }
    .ulgen-log { display:flex; flex-direction:column; gap:10px; }
    .ulgen-msg { font-size:12.5px; line-height:1.55; border-radius:10px; padding:9px 11px; }
    .ulgen-msg.biz { background:var(--bg-soft,rgba(255,255,255,.04)); border:1px solid var(--border-color); }
    .ulgen-msg.siz { align-self:flex-end; max-width:85%; background:rgba(106,169,255,.12); }
    .ulgen-msg h4 { margin:0 0 6px; font-size:12.5px; }
    .ulgen-msg ul { margin:0; padding-left:18px; }
    .ulgen-msg li { margin:3px 0; }
    .ulgen-foot { font-size:11px; color:var(--text-muted); margin-top:6px; }
    .ulgen-row { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
    .ulgen-link { background:none; border:none; padding:0; color:var(--accent,#6aa9ff); cursor:pointer; text-align:left; font:inherit; }
    .ulgen-ask { display:flex; gap:8px; align-items:center; }
    .ulgen-ask input { flex:1; }
    .ulgen-ask input[disabled], .ulgen-ask button[disabled] { opacity:.6; cursor:not-allowed; }
  `;
  document.head.appendChild(s);
}

const ulgen = { mod: null, durum: null, mesgul: false };
const U = () => window.secureBrowser && window.secureBrowser.ulgen;

function el(etiket, sinif, metin) {
  const e = document.createElement(etiket);
  if (sinif) e.className = sinif;
  if (metin != null) e.textContent = metin;
  return e;
}

function mesaj(kim, ...cocuklar) {
  const log = document.getElementById('ulgen-log');
  if (!log) return null;
  const m = el('div', 'ulgen-msg ' + kim);
  for (const c of cocuklar) if (c) m.appendChild(typeof c === 'string' ? el('div', null, c) : c);
  log.appendChild(m);
  m.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return m;
}

function dugme(metin, tik, sinif = 'btn-secondary') {
  const b = el('button', sinif, metin);
  b.type = 'button';
  b.addEventListener('click', tik);
  return b;
}

function veriSayfasi() {
  window.ilgezdiCloseAllPanels?.();
  window.ilgezdiDataCenter?.open?.('ulgen');
}

const HATA = {
  izin_chat: 'ulgen.off', izin_history: 'ulgen.err.historyOff', gizli_pencere: 'ulgen.err.incognito',
  sayfa_yok: 'ulgen.err.noPage', makale_yok: 'ulgen.err.noArticle', sayfa_degisti: 'ulgen.err.navigated',
  sorgu_bos: 'ulgen.err.emptyQuery',
};

function yanitiGoster(r, istek) {
  if (!r || !r.ok) {
    const sebep = r && r.sebep;
    if (sebep === 'onay_gerek') {
      const m = mesaj('biz', T('ulgen.ask.page'));
      const satir = el('div', 'ulgen-row');
      satir.append(
        dugme(T('ulgen.ask.allow'), () => { satir.remove(); gonder({ ...istek, onay: true }, false); }, 'btn-primary'),
        dugme(T('ulgen.ask.cancel'), () => satir.remove()));
      m && m.appendChild(satir);
      return;
    }
    const m = mesaj('biz', T(HATA[sebep] || 'ulgen.err.generic'));
    if (m && (sebep === 'izin_chat' || sebep === 'izin_history')) {
      const satir = el('div', 'ulgen-row');
      satir.appendChild(dugme(T('ulgen.openData'), veriSayfasi));
      m.appendChild(satir);
    }
    return;
  }
  switch (r.tur) {
    case 'ozet': {
      const ul = el('ul');
      for (const c of r.cumleler || []) ul.appendChild(el('li', null, c));
      const m = mesaj('biz', el('h4', null, r.baslik || ''), ul,
        el('div', 'ulgen-foot', T('ulgen.sum.foot', { count: (r.cumleler || []).length, total: r.toplam || 0 })));
      if (m && r.etiket && r.etiket.length) m.appendChild(el('div', 'ulgen-foot', T('ulgen.sum.tags', { tags: r.etiket.join(', ') })));
      return;
    }
    case 'sayfada': {
      if (!r.sonuclar || !r.sonuclar.length) { mesaj('biz', T('ulgen.find.none', { q: r.sorgu })); return; }
      const ul = el('ul');
      for (const c of r.sonuclar) ul.appendChild(el('li', null, c));
      mesaj('biz', el('h4', null, T('ulgen.find.head', { q: r.sorgu })), ul);
      return;
    }
    case 'gecmis': {
      if (!r.sonuclar || !r.sonuclar.length) { mesaj('biz', T('ulgen.hist.none')); return; }
      const ul = el('ul');
      for (const s of r.sonuclar) {
        const li = el('li');
        li.appendChild(dugme(s.baslik, () => U()?.eylem({ tur: 'ac', url: s.url }), 'ulgen-link'));
        if (s.alan) li.appendChild(el('span', 'ulgen-foot', ' · ' + s.alan));
        ul.appendChild(li);
      }
      mesaj('biz', el('h4', null, T('ulgen.hist.head', { q: r.sorgu })), ul);
      return;
    }
    case 'web':
    case 'sorgu': {
      const satir = el('div', 'ulgen-row');
      satir.appendChild(dugme(T('ulgen.web.open'), () => U()?.eylem({ tur: 'ara', sorgu: r.sorgu }), 'btn-primary'));
      mesaj('biz', el('h4', null, T('ulgen.web.head')), el('div', null, r.sorgu), satir);
      return;
    }
    default:
      mesaj('biz', T('ulgen.help'));
  }
}

async function gonder(istek, yazdir = true) {
  const kopru = U();
  if (!kopru || ulgen.mesgul) return;
  if (yazdir && istek.metin) mesaj('siz', istek.metin);
  ulgen.mesgul = true;
  const bekle = mesaj('biz', T('ulgen.busy'));
  let r = null;
  try { r = await kopru.sor(istek); } catch { r = null; }
  bekle?.remove();
  ulgen.mesgul = false;
  yanitiGoster(r, istek);
}

function modSec(mod) {
  ulgen.mod = ulgen.mod === mod ? null : mod;
  document.querySelectorAll('.ulgen-chip[data-mod]').forEach((c) => c.classList.toggle('active', c.dataset.mod === ulgen.mod));
  const g = document.getElementById('ulgen-ask-input');
  if (g) {
    g.placeholder = T(ulgen.mod ? 'ulgen.ph.' + ulgen.mod : 'ulgen.placeholder');
    g.focus();
  }
}

function sor() {
  const g = document.getElementById('ulgen-ask-input');
  const metin = (g && g.value || '').trim();
  if (!metin) return;
  g.value = '';
  const TUR = { find: 'sayfada', history: 'gecmis', web: 'web' };
  gonder(ulgen.mod ? { tur: TUR[ulgen.mod], metin } : { metin });
}

async function durumuUygula() {
  const kopru = U();
  ulgen.durum = kopru ? await kopru.durum().catch(() => null) : null;
  const acik = !!(ulgen.durum && ulgen.durum.chat);
  document.getElementById('ulgen-off')?.classList.toggle('hidden', acik);
  for (const id of ['ulgen-ask-input', 'ulgen-ask-send']) {
    const e = document.getElementById(id);
    if (e) e.disabled = !acik;
  }
  document.querySelectorAll('.ulgen-chip').forEach((c) => { c.disabled = !acik; });
}

function ulgenBuildPanel() {
  const panel = document.getElementById('panel-ulgen');
  if (!panel) return;
  panel.innerHTML = `
    <div class="panel-header">
      <h2>${TH('ulgen.title')}</h2>
      <button class="panel-close" data-panel="ulgen" aria-label="${TH('common.closePanel')}">✕</button>
    </div>
    <div class="panel-body ulgen-body">
      <div class="ulgen-hero">
        <div class="ulgen-hero-icon" aria-hidden="true">✨</div>
        <div class="ulgen-hero-sub">${TH('ulgen.subtitle')}</div>
      </div>
      <div class="ulgen-note hidden" id="ulgen-off">${TH('ulgen.off')}
        <div class="ulgen-row"><button type="button" class="btn-secondary" id="ulgen-open-data">${TH('ulgen.openData')}</button></div>
      </div>
      <div class="ulgen-chips">
        <button type="button" class="ulgen-chip" id="ulgen-act-summary">${TH('ulgen.act.summary')}</button>
        <button type="button" class="ulgen-chip" data-mod="find">${TH('ulgen.act.find')}</button>
        <button type="button" class="ulgen-chip" data-mod="history">${TH('ulgen.act.history')}</button>
        <button type="button" class="ulgen-chip" data-mod="web">${TH('ulgen.act.web')}</button>
      </div>
      <div class="ulgen-log" id="ulgen-log" aria-live="polite"></div>
      <div class="ulgen-ask">
        <input type="text" id="ulgen-ask-input" maxlength="500" disabled placeholder="${TH('ulgen.placeholder')}" aria-label="${TH('ulgen.subtitle')}" />
        <button class="btn-secondary" id="ulgen-ask-send" disabled>${TH('feedback.send')}</button>
      </div>
      <p class="ulgen-note">${TH('ulgen.privacy')}</p>
      <p class="ulgen-note" id="ulgen-account-note">${TH('ulgen.account')}</p>
    </div>
  `;

  document.querySelector('[data-panel="ulgen"]')?.addEventListener('click', () => {
    window.ilgezdiCloseAllPanels?.();
  });
  document.getElementById('ulgen-open-data')?.addEventListener('click', veriSayfasi);
  document.getElementById('ulgen-act-summary')?.addEventListener('click', () => gonder({ tur: 'ozet', metin: T('ulgen.act.summary') }));
  document.querySelectorAll('.ulgen-chip[data-mod]').forEach((c) => c.addEventListener('click', () => modSec(c.dataset.mod)));
  document.getElementById('ulgen-ask-send')?.addEventListener('click', sor);
  document.getElementById('ulgen-ask-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sor(); });
}

function initUlgenPanel() {
  injectUlgenStyles();
  ulgenBuildPanel();

  document.getElementById('btn-ulgen')?.addEventListener('click', () => {
    const panel = document.getElementById('panel-ulgen');
    if (!panel) return;
    if (panel.classList.contains('visible')) {
      window.ilgezdiCloseAllPanels?.();
      return;
    }
    window.ilgezdiCloseAllPanels?.();
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('visible'));
    document.getElementById('btn-ulgen')?.classList.add('active');
    window.secureBrowser?.panelOpened(true);
    // İzin Veri ve Gizlilik'te değişmiş olabilir; her açılışta yeniden okunur.
    durumuUygula();
  });

  durumuUygula();
}

window.addEventListener('load', () => setTimeout(initUlgenPanel, 500));
