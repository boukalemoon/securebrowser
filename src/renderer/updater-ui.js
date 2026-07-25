'use strict';

/**
 * İlgezdi — Güncelleme bildirim şeridi (renderer)
 *
 * Ana süreçteki auto-updater'dan 'updater-status' olaylarını dinler ve
 * uygulama içinde küçük, rahatsız etmeyen bir şerit gösterir:
 *   • available   → "Yeni sürüm X hazır" + [Güncelle] [Sonra]
 *   • downloading → indirme ilerlemesi (%)
 *   • downloaded  → "Hazır" + [Yeniden başlat & kur] [Sonra]
 * Otomatik indirme/kurulum YOKTUR — her adım kullanıcı onaylıdır.
 */

(function () {
  const up = window.secureBrowser && window.secureBrowser.updater;
  if (!up) return;

  let el = null;

  function injectStyles() {
    if (document.getElementById('ilgezdi-updater-style')) return;
    const s = document.createElement('style');
    s.id = 'ilgezdi-updater-style';
    s.textContent = `
#ilgezdi-updater{
  position:fixed;right:18px;bottom:18px;z-index:10000;
  width:340px;max-width:calc(100vw - 36px);
  background:var(--bg-elev,#141c2e);border:1px solid var(--line,#2a3550);
  border-radius:14px;padding:16px 18px 14px;
  box-shadow:0 20px 55px rgba(0,0,0,0.55);
  font-family:var(--font-ui,system-ui);color:var(--ink,#e6edf6);
  transform:translateY(140%);opacity:0;transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .35s;
}
#ilgezdi-updater.show{transform:translateY(0);opacity:1;}
#ilgezdi-updater .u-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
#ilgezdi-updater .u-ico{
  width:30px;height:30px;flex:none;border-radius:9px;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,var(--gold,#f0c674),var(--copper,#a8742a));color:#101a2c;
}
#ilgezdi-updater .u-title{font-size:13.5px;font-weight:700;letter-spacing:.3px;}
#ilgezdi-updater .u-ver{font-size:11px;color:var(--ink-mute,#8aa)}
#ilgezdi-updater .u-close{
  margin-left:auto;background:none;border:none;color:var(--ink-mute,#8aa);
  cursor:pointer;font-size:15px;padding:2px 4px;line-height:1;border-radius:6px;
}
#ilgezdi-updater .u-close:hover{color:var(--ink,#fff);}
#ilgezdi-updater .u-notes{
  font-size:11.5px;color:var(--ink-soft,#b9c6d8);line-height:1.5;
  max-height:76px;overflow:auto;margin:2px 0 12px;white-space:pre-wrap;
}
#ilgezdi-updater .u-actions{display:flex;gap:8px;}
#ilgezdi-updater .u-btn{
  flex:1;height:36px;border-radius:9px;border:none;cursor:pointer;
  font-size:12.5px;font-weight:700;font-family:inherit;transition:all .18s;
}
#ilgezdi-updater .u-btn.primary{
  background:linear-gradient(135deg,var(--gold,#f0c674),var(--copper,#a8742a));color:#101a2c;
}
#ilgezdi-updater .u-btn.primary:hover{transform:translateY(-1px);}
#ilgezdi-updater .u-btn.ghost{
  background:transparent;border:1px solid var(--line,#2a3550);color:var(--ink-soft,#b9c6d8);flex:0 0 auto;padding:0 14px;
}
#ilgezdi-updater .u-btn.ghost:hover{border-color:var(--gold,#f0c674);color:var(--gold,#f0c674);}
#ilgezdi-updater .u-btn:disabled{opacity:.6;cursor:wait;}
#ilgezdi-updater .u-bar{height:7px;border-radius:5px;background:var(--bg,#0c1220);overflow:hidden;margin:4px 0 6px;}
#ilgezdi-updater .u-bar-fill{height:100%;width:0;background:linear-gradient(90deg,var(--gold,#f0c674),var(--copper,#a8742a));transition:width .25s;}
#ilgezdi-updater .u-prog{font-size:11px;color:var(--ink-mute,#8aa);text-align:right;}
    `;
    document.head.appendChild(s);
  }

  function ensureEl() {
    if (el) return el;
    injectStyles();
    el = document.createElement('div');
    el.id = 'ilgezdi-updater';
    document.body.appendChild(el);
    return el;
  }

  function show()  { ensureEl(); requestAnimationFrame(() => el.classList.add('show')); }
  function hide()  { if (el) el.classList.remove('show'); }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderAvailable(version, notes) {
    ensureEl();
    el.innerHTML = `
      <div class="u-head">
        <span class="u-ico">⬆</span>
        <div>
          <div class="u-title">Yeni sürüm hazır</div>
          <div class="u-ver">Sürüm ${esc(version)}</div>
        </div>
        <button class="u-close" title="Sonra">✕</button>
      </div>
      ${notes ? `<div class="u-notes">${esc(notes)}</div>` : ''}
      <div class="u-actions">
        <button class="u-btn primary" data-act="download">Güncelle</button>
        <button class="u-btn ghost" data-act="later">Sonra</button>
      </div>`;
    wire();
    show();
  }

  function renderDownloading(percent) {
    ensureEl();
    el.innerHTML = `
      <div class="u-head">
        <span class="u-ico">⬇</span>
        <div><div class="u-title">İndiriliyor…</div></div>
        <button class="u-close" title="Gizle">✕</button>
      </div>
      <div class="u-bar"><div class="u-bar-fill" style="width:${percent}%"></div></div>
      <div class="u-prog">%${percent}</div>`;
    wire();
    show();
  }

  function renderDownloaded(version) {
    ensureEl();
    el.innerHTML = `
      <div class="u-head">
        <span class="u-ico">✓</span>
        <div>
          <div class="u-title">Güncelleme indirildi</div>
          <div class="u-ver">Sürüm ${esc(version)} kurulmaya hazır</div>
        </div>
        <button class="u-close" title="Sonra">✕</button>
      </div>
      <div class="u-actions">
        <button class="u-btn primary" data-act="install">Yeniden başlat & kur</button>
        <button class="u-btn ghost" data-act="later">Sonra</button>
      </div>`;
    wire();
    show();
  }

  function wire() {
    el.querySelector('.u-close')?.addEventListener('click', hide);
    el.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.getAttribute('data-act');
        if (act === 'later') { hide(); return; }
        if (act === 'download') {
          btn.disabled = true; btn.textContent = 'Başlatılıyor…';
          const r = await up.download();
          if (r && r.ok === false) {
            btn.disabled = false; btn.textContent = 'Yeniden dene';
          }
          return;
        }
        if (act === 'install') {
          btn.disabled = true; btn.textContent = 'Kapatılıyor…';
          await up.install();
        }
      });
    });
  }

  // Ana süreçten durum güncellemeleri
  up.onStatus((d) => {
    if (!d) return;
    switch (d.state) {
      case 'available':   renderAvailable(d.version, d.notes); break;
      case 'downloading': renderDownloading(d.percent || 0);   break;
      case 'downloaded':  renderDownloaded(d.version);         break;
      // 'checking' / 'none' / 'error' → sessiz (arka planda), şerit gösterme
    }
  });
})();
