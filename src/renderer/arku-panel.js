/**
 * İlgezdi — Arku Uzak Masaüstü eklenti paneli
 * arku-panel.js
 *
 * Arku'yu sekmede açar; ana süreçteki arku-manager'ın bulduğu güncellemeleri
 * gösterir ve KULLANICI ONAYIYLA uygular (eklenti güncelleme mantığı).
 */

'use strict';

(function () {
  const sb = window.secureBrowser;
  let arkuInfo = null;

  const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('tr-TR') : '—';

  function arkuBuildPanel() {
    const panel = document.getElementById('panel-arku');
    if (!panel) return;
    panel.innerHTML = `
      <div class="panel-header">
        <h2>🖥 Arku Uzak Masaüstü</h2>
        <button class="panel-close" data-panel="arku">✕</button>
      </div>
      <div class="panel-body">

        <div class="arku-hero">
          <div class="arku-hero-icon">🖥</div>
          <p class="arku-hero-text">Sunucusuz, uçtan uca şifreli P2P uzak masaüstü.
          Ekranınızı paylaşın veya bir cihaza bağlanın — tarayıcıdan çıkmadan.</p>
          <button id="btn-arku-open" class="arku-open-btn">Arku'yu Aç</button>
        </div>

        <!-- Güncelleme bildirimi (yalnızca yeni sürüm varken görünür) -->
        <div id="arku-update-card" class="arku-update-card hidden">
          <div class="arku-update-title">⬆ Güncelleme hazır: <span id="arku-new-ver"></span></div>
          <p class="arku-update-desc">Onay verdiğinizde açık Arku sekmeleri yeni sürümle yenilenir. Aktif bir uzak bağlantınız varsa kesilir.</p>
          <div class="arku-update-actions">
            <button id="btn-arku-apply" class="arku-apply-btn">Şimdi Güncelle</button>
            <button id="btn-arku-later" class="btn-secondary">Daha Sonra</button>
          </div>
        </div>

        <div class="vpn-section-title">Sürüm</div>
        <div class="arku-ver-row"><span>Kurulu sürüm</span><span id="arku-ver-installed" class="arku-ver-val">—</span></div>
        <div class="arku-ver-row"><span>Son sürüm</span><span id="arku-ver-latest" class="arku-ver-val">—</span></div>
        <div class="arku-ver-row"><span>Son denetim</span><span id="arku-ver-checked" class="arku-ver-val">—</span></div>
        <button id="btn-arku-check" class="btn-secondary" style="margin-top:10px">🔄 Güncellemeleri Denetle</button>
        <div id="arku-check-note" class="arku-note hidden"></div>

      </div>
    `;

    document.getElementById('btn-arku-open')?.addEventListener('click', async () => {
      const url = (await sb.arku?.getUrl?.()) || 'https://arku-remote.vercel.app';
      sb.newTab(url);
      window.ilgezdiCloseAllPanels?.();
    });

    document.getElementById('btn-arku-check')?.addEventListener('click', async () => {
      const note = document.getElementById('arku-check-note');
      if (note) { note.textContent = 'Denetleniyor…'; note.classList.remove('hidden'); }
      arkuInfo = await sb.arku?.checkUpdate?.();
      arkuRender();
      if (note) {
        note.textContent = arkuInfo?.updateAvailable
          ? 'Yeni sürüm bulundu.'
          : 'Arku güncel.';
        setTimeout(() => note.classList.add('hidden'), 4000);
      }
    });

    document.getElementById('btn-arku-apply')?.addEventListener('click', async () => {
      arkuInfo = await sb.arku?.applyUpdate?.();
      arkuRender();
      arkuSetBadge(false);
      const note = document.getElementById('arku-check-note');
      if (note) {
        note.textContent = 'Güncellendi. Açık Arku sekmeleri yenilendi.';
        note.classList.remove('hidden');
        setTimeout(() => note.classList.add('hidden'), 5000);
      }
    });

    document.getElementById('btn-arku-later')?.addEventListener('click', () => {
      document.getElementById('arku-update-card')?.classList.add('hidden');
    });
  }

  function arkuRender() {
    if (!arkuInfo) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('arku-ver-installed', arkuInfo.installedVersion ? 'v' + arkuInfo.installedVersion : '—');
    set('arku-ver-latest',    arkuInfo.latestVersion    ? 'v' + arkuInfo.latestVersion    : '—');
    set('arku-ver-checked',   fmtTime(arkuInfo.lastCheckAt));
    set('arku-new-ver',       arkuInfo.latestVersion ? 'v' + arkuInfo.latestVersion : '');
    document.getElementById('arku-update-card')
      ?.classList.toggle('hidden', !arkuInfo.updateAvailable);
  }

  function arkuSetBadge(on) {
    document.getElementById('btn-arku')?.classList.toggle('has-update', !!on);
  }

  async function arkuOpenPanel() {
    arkuInfo = await sb.arku?.getInfo?.();
    arkuRender();
  }

  function arkuInit() {
    arkuBuildPanel();

    // Sidebar butonu — diğer panellerle aynı aç/kapa davranışı
    document.getElementById('btn-arku')?.addEventListener('click', () => {
      const panel = document.getElementById('panel-arku');
      if (!panel) return;
      if (panel.classList.contains('visible')) {
        window.ilgezdiCloseAllPanels?.();
      } else {
        window.ilgezdiCloseAllPanels?.();
        panel.classList.remove('hidden');
        requestAnimationFrame(() => panel.classList.add('visible'));
        document.getElementById('btn-arku')?.classList.add('active');
        sb?.panelOpened(true);
        arkuOpenPanel();
      }
    });

    // Arka plan denetimi yeni sürüm bulduğunda: rozet + sistem bildirimi.
    // Kurulum KULLANICI onayı olmadan yapılmaz.
    sb.arku?.onUpdateAvailable?.((info) => {
      arkuInfo = info;
      arkuSetBadge(true);
      arkuRender();
      sb.showNotification?.(
        'Arku güncellemesi hazır',
        `v${info.latestVersion} yayınlandı. Uygulamak için kenar çubuğundaki Arku panelini açın.`
      );
    });

    console.log('[İlgezdi] Arku eklentisi hazır');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arkuInit);
  } else {
    arkuInit();
  }
})();
