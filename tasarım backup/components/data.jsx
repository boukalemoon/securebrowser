// İlgezdi — Browser shell + page screens

const { useState, useMemo, useEffect, useRef } = React;

// === Sample data ===
const SAMPLE_TABS = [
  { id: 't1', title: 'Yeni Sekme', rune: '𐰉𐰽', favicon: 'logo', screen: 'newtab' },
  { id: 't2', title: 'Bilge Kağan Yazıtları — Wikipedia', rune: '𐰋𐰠𐰏𐰀', favicon: 'W', faviconColor: '#000', screen: 'webpage' },
  { id: 't3', title: 'Türk Tarih Kurumu', rune: '𐱅𐰜', favicon: 'T', faviconColor: '#b85c3a', screen: 'webpage' },
];

const QUICK_LINKS = [
  { name: 'Atlas', sub: 'Harita', color: '#3a6db5', letter: 'A' },
  { name: 'Boy', sub: 'Mail', color: '#b85c3a', letter: 'B' },
  { name: 'Kurgan', sub: 'Bulut', color: '#5a7a4a', letter: 'K' },
  { name: 'Otağ', sub: 'Forum', color: '#8a4a7a', letter: 'O' },
  { name: 'Tamga', sub: 'Sosyal', color: '#c89540', letter: 'T' },
  { name: 'Yıldız', sub: 'Astronomi', color: '#4a5a8a', letter: 'Y' },
  { name: 'Damga', sub: 'Dosya', color: '#7a4a3a', letter: 'D' },
  { name: 'Arşiv', sub: 'Tarih', color: '#3a5a4a', letter: 'A' },
];

const SAMPLE_NEWS = [
  { cat: 'TARİH', read: '8 dk', title: 'Orhun Yazıtları: Türk Tarihinin Mihenk Taşı', body: 'Bilge Kağan ve Kül Tigin yazıtlarının çözülmesi 19. yüzyılın sonlarında bilim dünyasında devrim yarattı.', feature: true },
  { cat: 'KEŞİF', read: '4 dk', title: 'Sibirya Bozkırlarında Yeni Kurgan Bulundu' },
  { cat: 'KÜLTÜR', read: '6 dk', title: 'Demir Devri Atlı Göçebe Sanatı' },
  { cat: 'DİL', read: '5 dk', title: 'Göktürkçe Alfabe ve 38 Harf' },
  { cat: 'EFSANE', read: '3 dk', title: 'Ergenekon Destanı: Kurttan Türeyiş' },
];

const SAMPLE_BOOKMARKS = {
  'Sık Kullanılan': [
    { title: 'TÜBİTAK', url: 'tubitak.gov.tr', color: '#2a5aa0', letter: 'T' },
    { title: 'Bilge Kağan Yazıtları', url: 'orhunyazit.com', color: '#b85c3a', letter: 'B' },
    { title: 'Türkiye Cumhuriyeti', url: 'turkiye.gov.tr', color: '#c8102e', letter: 'T' },
    { title: 'TDK Sözlük', url: 'sozluk.gov.tr', color: '#1a4a8a', letter: 'S' },
    { title: 'Atatürk Kültür', url: 'akmb.gov.tr', color: '#8a4a3a', letter: 'A' },
    { title: 'Türk Tarih Kurumu', url: 'ttk.gov.tr', color: '#5a3a2a', letter: 'T' },
  ],
  'Tarih': [
    { title: 'Anadolu Medeniyetleri', url: 'anatolianmuseum.org', color: '#7a4a2a', letter: 'A' },
    { title: 'İstanbul Arkeoloji', url: 'arkmuze.gov.tr', color: '#4a3a7a', letter: 'İ' },
    { title: 'Kül Tigin Müzesi', url: 'kultigin.mn', color: '#3a5a4a', letter: 'K' },
  ],
  'Eğitim': [
    { title: 'Khan Academy TR', url: 'khanacademy.org.tr', color: '#1a8a4a', letter: 'K' },
    { title: 'Coursera', url: 'coursera.org', color: '#1a5aaa', letter: 'C' },
    { title: 'EBA', url: 'eba.gov.tr', color: '#0a6a8a', letter: 'E' },
  ],
};

const SAMPLE_HISTORY = [
  { day: 'Bugün — 28 Nisan', items: [
    { title: 'Bilge Kağan Yazıtları — Wikipedia', url: 'tr.wikipedia.org/wiki/Bilge_Kağan', time: '14:32', color: '#000', letter: 'W' },
    { title: 'Orhun Abideleri | TDK', url: 'tdk.gov.tr/orhun-abideleri', time: '14:18', color: '#1a4a8a', letter: 'T' },
    { title: 'Türk Tarih Kurumu — Yayınlar', url: 'ttk.gov.tr/yayinlar', time: '11:42', color: '#5a3a2a', letter: 'T' },
    { title: 'Göktürk Alfabesi Çevirici', url: 'gokturkce.app', color: '#3a5a8a', time: '10:15', letter: 'G' },
  ]},
  { day: 'Dün — 27 Nisan', items: [
    { title: 'Ergenekon Destanı Üzerine', url: 'destanlar.com/ergenekon', time: '21:08', color: '#7a3a2a', letter: 'E' },
    { title: 'Atlı Göçebe Kültürü', url: 'arkeoloji.org/atli-gocebe', time: '20:14', color: '#5a4a3a', letter: 'A' },
    { title: 'Kurganlar — Sibirya', url: 'kurgan.ru', color: '#3a5a4a', time: '19:45', letter: 'K' },
    { title: 'Tamga Sembolleri', url: 'tamga.org', color: '#a8742a', time: '15:22', letter: 'T' },
  ]},
  { day: '26 Nisan Pazartesi', items: [
    { title: 'Türk Mitolojisi: Umay Ana', url: 'mitoloji.tr/umay', time: '23:01', color: '#8a4a7a', letter: 'U' },
    { title: 'Bozkurt Efsanesi', url: 'efsane.gov.tr/bozkurt', time: '17:55', color: '#3a3a3a', letter: 'B' },
  ]},
];

const SAMPLE_DOWNLOADS = [
  { name: 'Orhun_Yazitlari_Tam_Metin.pdf', src: 'ttk.gov.tr', size: '4.2 MB', pct: 100, ext: 'PDF' },
  { name: 'Bozkurt_Destani_Cilt_3.epub', src: 'destanlar.com', size: '1.8 MB', pct: 100, ext: 'EPUB' },
  { name: 'gokturk-alfabe.ttf', src: 'gokturkce.app', size: '120 KB', pct: 100, ext: 'TTF' },
  { name: 'Kurgan_Bulgular_2026.zip', src: 'arkeoloji.org', size: '24.5 MB', pct: 62, ext: 'ZIP' },
  { name: 'umay-ana-illustrasyon.png', src: 'mitoloji.tr', size: '3.1 MB', pct: 100, ext: 'PNG' },
];

// Tab favicon renderer
const TabFavicon = ({ favicon, color = '#888' }) => {
  if (favicon === 'logo') return <BrandMark size={14}/>;
  return (
    <span style={{
      width: 14, height: 14, borderRadius: 3, background: color, color: 'white',
      display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700,
    }}>{favicon}</span>
  );
};
window.TabFavicon = TabFavicon;

// === Side Menu ===
const SideMenu = ({ open, onClose, onNav }) => (
  <>
    <div className={`menu-backdrop ${open ? 'open' : ''}`} onClick={onClose}></div>
    <aside className={`side-menu ${open ? 'open' : ''}`}>
      <div className="side-menu-head">
        <div>
          <h3>İLGEZDİ</h3>
          <div className="runes-m">𐰋𐰽 𐱅𐰢</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>
      <div className="side-menu-list">
        <div className="menu-section-label">𐱅 · Gezinti</div>
        <div className="menu-item" onClick={() => onNav('newtab')}><div className="menu-ico"><Icon name="plus" size={14}/></div>Yeni Sekme<span className="menu-runes">𐰉𐰽</span></div>
        <div className="menu-item" onClick={() => onNav('history')}><div className="menu-ico"><Icon name="history" size={14}/></div>Geçmiş<span className="menu-runes">𐰚𐰞</span></div>
        <div className="menu-item" onClick={() => onNav('bookmarks')}><div className="menu-ico"><Icon name="star" size={14}/></div>Yer İmleri<span className="menu-runes">𐰉𐰠</span></div>
        <div className="menu-item" onClick={() => onNav('downloads')}><div className="menu-ico"><Icon name="download" size={14}/></div>İndirilenler<span className="menu-runes">𐰒𐰠</span></div>
        <div className="menu-divider"></div>
        <div className="menu-section-label">𐱆 · Araçlar</div>
        <div className="menu-item" onClick={() => onNav('discover')}><div className="menu-ico"><Icon name="compass" size={14}/></div>Keşfet<span className="menu-runes">𐰚𐰽</span></div>
        <div className="menu-item"><div className="menu-ico"><Icon name="shield" size={14}/></div>Gizli Otağ<span className="menu-runes">𐰍𐰕</span></div>
        <div className="menu-item"><div className="menu-ico"><Icon name="language" size={14}/></div>Rune Çevirici<span className="menu-runes">𐰉𐰽</span></div>
        <div className="menu-item"><div className="menu-ico"><Icon name="image" size={14}/></div>Ekran Görüntüsü<span className="menu-runes">𐰢𐰜</span></div>
        <div className="menu-divider"></div>
        <div className="menu-section-label">𐰢 · Sistem</div>
        <div className="menu-item" onClick={() => onNav('settings')}><div className="menu-ico"><Icon name="gear" size={14}/></div>Ayarlar<span className="menu-runes">𐰕𐰉</span></div>
        <div className="menu-item"><div className="menu-ico"><Icon name="palette" size={14}/></div>Tema Galerisi<span className="menu-runes">𐰉𐰕</span></div>
        <div className="menu-item"><div className="menu-ico"><Icon name="sparkles" size={14}/></div>İlgezdi Hakkında<span className="menu-runes">𐰉𐰽</span></div>
      </div>
    </aside>
  </>
);
window.SideMenu = SideMenu;

Object.assign(window, { SAMPLE_TABS, QUICK_LINKS, SAMPLE_NEWS, SAMPLE_BOOKMARKS, SAMPLE_HISTORY, SAMPLE_DOWNLOADS });
