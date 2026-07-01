// İlgezdi — Browser shell + main app

const { useState: uS, useEffect: uE, useRef: uR } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "otuken",
  "runesEnabled": true,
  "viewMode": "desktop",
  "currentScreen": "newtab"
}/*EDITMODE-END*/;

const SCREENS = {
  newtab: { title: 'Yeni Sekme', rune: '𐰉𐰽 𐱅', url: 'ilgezdi://yeni-sekme' },
  welcome: { title: 'İlgezdi\'ye Hoş Geldin', rune: '𐰚𐰢 𐱅𐰉', url: 'ilgezdi://kar%C5%9F%C4%B1lama' },
  webpage: { title: 'Bilge Kağan — Wikipedia', rune: '𐰋𐰠𐰏𐰀', url: 'tr.wikipedia.org/wiki/Bilge_Kağan' },
  history: { title: 'Geçmiş', rune: '𐰚𐰠 𐰚𐰢', url: 'ilgezdi://geçmiş' },
  bookmarks: { title: 'Yer İmleri', rune: '𐰉𐰠 𐰢𐱅', url: 'ilgezdi://yer-imleri' },
  downloads: { title: 'İndirilenler', rune: '𐰒𐰠 𐱅𐰢', url: 'ilgezdi://indirilenler' },
  discover: { title: 'Keşfet', rune: '𐰚𐰽𐱃', url: 'ilgezdi://keşfet' },
  settings: { title: 'Ayarlar', rune: '𐰕𐰉 𐱅𐰍', url: 'ilgezdi://ayarlar' },
};

const Browser = ({ tweaks, setTweak, embedded = false }) => {
  const [tabs, setTabs] = uS(SAMPLE_TABS);
  const [activeId, setActiveId] = uS('t1');
  const [screen, setScreen] = uS(tweaks.currentScreen || 'newtab');
  const [menuOpen, setMenuOpen] = uS(false);
  const [addressBarValue, setAddressBarValue] = uS('');
  const [history, setHistory] = uS(['newtab']);
  const [historyIdx, setHistoryIdx] = uS(0);
  const [bookmarked, setBookmarked] = uS(false);
  const [reloading, setReloading] = uS(false);

  const navigate = (s) => {
    if (s === screen) return;
    const next = history.slice(0, historyIdx + 1).concat(s);
    setHistory(next);
    setHistoryIdx(next.length - 1);
    setScreen(s);
    setMenuOpen(false);
    setBookmarked(false);
    // Update active tab title
    setTabs((prev) => prev.map(t => t.id === activeId ? { ...t, title: SCREENS[s].title, rune: SCREENS[s].rune, screen: s } : t));
  };

  const back = () => { if (historyIdx > 0) { const i = historyIdx - 1; setHistoryIdx(i); setScreen(history[i]); } };
  const fwd = () => { if (historyIdx < history.length - 1) { const i = historyIdx + 1; setHistoryIdx(i); setScreen(history[i]); } };
  const reload = () => { setReloading(true); setTimeout(() => setReloading(false), 600); };

  uE(() => {
    setAddressBarValue(SCREENS[screen]?.url || '');
  }, [screen]);

  const handleAddrSubmit = (e) => {
    e.preventDefault();
    const v = addressBarValue.toLowerCase();
    if (v.includes('wiki') || v.includes('http') || v.includes('.com') || v.includes('.gov') || v.includes('.org')) {
      navigate('webpage');
    } else if (v.includes('geçmiş') || v.includes('gecmis') || v.includes('history')) {
      navigate('history');
    } else if (v.includes('yer') || v.includes('bookmark')) {
      navigate('bookmarks');
    } else if (v.includes('ayar') || v.includes('setting')) {
      navigate('settings');
    } else if (v.includes('keşf') || v.includes('kesf') || v.includes('discover')) {
      navigate('discover');
    } else if (v.includes('indir') || v.includes('download')) {
      navigate('downloads');
    } else {
      navigate('webpage');
    }
  };

  const addTab = () => {
    const id = 't' + (Date.now());
    const newTab = { id, title: 'Yeni Sekme', rune: '𐰉𐰽', favicon: 'logo', screen: 'newtab' };
    setTabs([...tabs, newTab]);
    setActiveId(id);
    setScreen('newtab');
    setHistory(['newtab']);
    setHistoryIdx(0);
  };

  const closeTab = (id, e) => {
    e.stopPropagation();
    const idx = tabs.findIndex(t => t.id === id);
    const next = tabs.filter(t => t.id !== id);
    if (next.length === 0) {
      addTab(); return;
    }
    setTabs(next);
    if (id === activeId) {
      const newActive = next[Math.min(idx, next.length - 1)];
      setActiveId(newActive.id);
      setScreen(newActive.screen);
    }
  };

  const switchTab = (id) => {
    const t = tabs.find(x => x.id === id);
    if (!t) return;
    setActiveId(id);
    setScreen(t.screen);
    setHistory([t.screen]);
    setHistoryIdx(0);
  };

  const renderScreen = () => {
    switch (screen) {
      case 'welcome': return <Welcome onStart={() => navigate('newtab')}/>;
      case 'newtab': return <NewTab onSearch={(q) => navigate('webpage')}/>;
      case 'webpage': return <Webpage/>;
      case 'history': return <HistoryPage/>;
      case 'bookmarks': return <Bookmarks/>;
      case 'downloads': return <Downloads/>;
      case 'discover': return <Discover/>;
      case 'settings': return <Settings theme={tweaks.theme} setTheme={(t) => setTweak('theme', t)} runesEnabled={tweaks.runesEnabled} setRunesEnabled={(v) => setTweak('runesEnabled', v)}/>;
      default: return <NewTab/>;
    }
  };

  const showRunes = tweaks.runesEnabled;

  return (
    <div className="browser-shell" data-theme={tweaks.theme} style={embedded ? { borderRadius: 12, overflow: 'hidden' } : undefined}>
      {/* Title bar with traffic lights + tabs */}
      <div className="titlebar">
        <div className="traffic-lights">
          <button className="dot close"></button>
          <button className="dot min"></button>
          <button className="dot max"></button>
        </div>
        <div className="tab-strip">
          {tabs.map(t => (
            <div key={t.id} className={`tab ${t.id === activeId ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
              <div className="favicon"><TabFavicon favicon={t.favicon} color={t.faviconColor}/></div>
              <div className="title-row">
                <span className="title">{t.title}</span>
                {showRunes && <span className="rune-sub">{t.rune}</span>}
              </div>
              <div className="tab-close" onClick={(e) => closeTab(t.id, e)}><Icon name="close" size={11}/></div>
            </div>
          ))}
          <button className="tab-add" onClick={addTab} title="Yeni sekme"><Icon name="plus" size={14}/></button>
        </div>
        <div className="window-actions">
          <button className="icon-btn"><Icon name="search" size={14}/></button>
          <button className="icon-btn"><Icon name="dots" size={14}/></button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="brand-mark">
          <BrandMark size={28}/>
          <Wordmark size={13}/>
        </div>
        <button className="nav-btn" onClick={back} disabled={historyIdx === 0}><Icon name="back" size={16}/></button>
        <button className="nav-btn" onClick={fwd} disabled={historyIdx >= history.length - 1}><Icon name="fwd" size={16}/></button>
        <button className={`nav-btn ${reloading ? 'reloading' : ''}`} onClick={reload}>
          <span style={{ display: 'inline-block', animation: reloading ? 'spin-slow 0.6s linear' : 'none' }}>
            <Icon name="reload" size={15}/>
          </span>
        </button>
        <button className="nav-btn" onClick={() => navigate('newtab')}><Icon name="home" size={16}/></button>

        <form className="address-bar" onSubmit={handleAddrSubmit} style={{ flex: 1 }}>
          <span className="lock"><Icon name="lock" size={12}/></span>
          <input
            value={addressBarValue}
            onChange={(e) => setAddressBarValue(e.target.value)}
            placeholder="Bir adres yaz veya İlgezdi ile ara…"
          />
          <div className="addr-actions">
            {showRunes && (
              <span style={{ fontFamily: 'var(--font-rune)', fontSize: 10, color: 'var(--rune)', letterSpacing: 2, marginRight: 6, opacity: 0.7 }}>
                {SCREENS[screen]?.rune}
              </span>
            )}
            <button type="button" className="addr-btn" onClick={() => setBookmarked(!bookmarked)} title="Yer imi">
              <Icon name={bookmarked ? 'star-fill' : 'star'} size={14}/>
            </button>
            <button type="button" className="addr-btn"><Icon name="shield" size={14}/></button>
            <button type="button" className="addr-btn"><Icon name="sparkles" size={14}/></button>
          </div>
        </form>

        <button className="nav-btn"><Icon name="download" size={16}/></button>
        <button className={`nav-btn ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" size={16}/></button>
      </div>

      {/* Bookmarks bar */}
      <div className="bookmarks-bar">
        {SAMPLE_BOOKMARKS['Sık Kullanılan'].slice(0, 6).map((b, i) => (
          <div className="bookmark-chip" key={i} onClick={() => navigate('webpage')}>
            <span className="chip-favicon" style={{ background: b.color }}>{b.letter}</span>
            {b.title}
          </div>
        ))}
        <div className="bookmark-chip"><Icon name="folder" size={12}/> Tarih</div>
        <div className="bookmark-chip"><Icon name="folder" size={12}/> Eğitim</div>
      </div>

      {/* Main */}
      <div className="main">
        <aside className="sidebar">
          <button className={`sidebar-btn ${screen === 'newtab' ? 'active' : ''}`} onClick={() => navigate('newtab')} title="Anasayfa">
            <Icon name="home" size={18}/>
          </button>
          <button className={`sidebar-btn ${screen === 'bookmarks' ? 'active' : ''}`} onClick={() => navigate('bookmarks')} title="Yer İmleri">
            <Icon name="star" size={18}/>
          </button>
          <button className={`sidebar-btn ${screen === 'history' ? 'active' : ''}`} onClick={() => navigate('history')} title="Geçmiş">
            <Icon name="history" size={18}/>
          </button>
          <button className={`sidebar-btn ${screen === 'downloads' ? 'active' : ''}`} onClick={() => navigate('downloads')} title="İndirilenler">
            <Icon name="download" size={18}/>
          </button>
          <div className="sidebar-divider"></div>
          <button className={`sidebar-btn ${screen === 'discover' ? 'active' : ''}`} onClick={() => navigate('discover')} title="Keşfet">
            <Icon name="compass" size={18}/>
          </button>
          <button className="sidebar-btn" title="Gizli Otağ"><Icon name="shield" size={18}/></button>
          <div className="sidebar-foot">
            <button className={`sidebar-btn ${screen === 'welcome' ? 'active' : ''}`} onClick={() => navigate('welcome')} title="Karşılama"><Icon name="sparkles" size={18}/></button>
            <button className={`sidebar-btn ${screen === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')} title="Ayarlar"><Icon name="gear" size={18}/></button>
          </div>
        </aside>

        <div className="content">
          <div className="content-scroll" key={screen}>
            {renderScreen()}
          </div>
        </div>

        <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} onNav={navigate}/>
      </div>

      {/* Status bar */}
      <div className="statusbar">
        <span><Icon name="lock" size={10}/> &nbsp;Güvenli</span>
        <span>·</span>
        <span>{addressBarValue}</span>
        <span className="rune-stripe">𐱅𐰢 𐰉 𐰽 𐱆 𐰚 𐰢 𐱅 𐰉 𐰍 𐰢 · 𐰋𐰠𐰏𐰀 𐰚𐰢 𐱅𐰉𐰍 · 𐱅𐰢𐰍 𐰉𐰽𐱃</span>
        <span>İlgezdi 1.0 · Bilge</span>
      </div>
    </div>
  );
};

window.Browser = Browser;
