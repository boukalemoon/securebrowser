// İlgezdi — SVG Icons (line style, currentColor)
const Icon = ({ name, size = 16, stroke = 1.6 }) => {
  const props = {
    width: size, height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };
  switch (name) {
    case 'back': return <svg {...props}><path d="M15 18l-6-6 6-6"/></svg>;
    case 'fwd': return <svg {...props}><path d="M9 18l6-6-6-6"/></svg>;
    case 'reload': return <svg {...props}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>;
    case 'home': return <svg {...props}><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>;
    case 'star': return <svg {...props}><path d="M12 3l2.7 6 6.3.5-4.8 4.2 1.5 6.3L12 16.8 6.3 20l1.5-6.3L3 9.5 9.3 9z"/></svg>;
    case 'star-fill': return <svg {...props} fill="currentColor" stroke="none"><path d="M12 3l2.7 6 6.3.5-4.8 4.2 1.5 6.3L12 16.8 6.3 20l1.5-6.3L3 9.5 9.3 9z"/></svg>;
    case 'compass': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M16 8l-2.5 5.5L8 16l2.5-5.5L16 8z" fill="currentColor"/></svg>;
    case 'history': return <svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>;
    case 'download': return <svg {...props}><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>;
    case 'gear': return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    case 'menu': return <svg {...props}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
    case 'dots': return <svg {...props} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>;
    case 'plus': return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'close': return <svg {...props}><path d="M18 6L6 18M6 6l12 12"/></svg>;
    case 'lock': return <svg {...props}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
    case 'search': return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case 'shield': return <svg {...props}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg>;
    case 'bookmark': return <svg {...props}><path d="M6 3h12v18l-6-4-6 4z"/></svg>;
    case 'folder': return <svg {...props}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
    case 'eye': return <svg {...props}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'eye-off': return <svg {...props}><path d="M17 17.5A10 10 0 0 1 12 19C6 19 2 12 2 12a18 18 0 0 1 4-5"/><path d="M9.9 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3 4"/><path d="M3 3l18 18"/></svg>;
    case 'wallet': return <svg {...props}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h3"/></svg>;
    case 'sparkles': return <svg {...props}><path d="M12 3l1.5 4 4 1.5-4 1.5L12 14l-1.5-4-4-1.5 4-1.5z"/><path d="M19 14l.7 1.5L21 16l-1.3.5L19 18l-.7-1.5L17 16l1.3-.5z"/></svg>;
    case 'tent': return <svg {...props}><path d="M3 20l9-15 9 15z"/><path d="M12 5v15"/><path d="M9 20l3-3 3 3"/></svg>;
    case 'wolf': return <svg {...props} fill="currentColor" stroke="none">
      <path d="M3 8l2-3 2 2.5 2-2 1.5 2L13 5l1.5 2.5L17 5l2 3 1.5 4-2 1-1 4-2 1-1-2-2 1-2-1-1 2-2-1-1-4-2-1z"/>
    </svg>;
    case 'arrow-right': return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case 'pause': return <svg {...props} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>;
    case 'check': return <svg {...props}><path d="M5 12l5 5L20 7"/></svg>;
    case 'flame': return <svg {...props}><path d="M12 2s4 5 4 9a4 4 0 1 1-8 0c0-2 1-3 1-3s-2 2-2 5a6 6 0 1 0 12 0c0-5-7-11-7-11z"/></svg>;
    case 'globe': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    case 'language': return <svg {...props}><path d="M3 5h12M9 3v2M11 5s-1 6-7 9"/><path d="M5 10c0 4 5 5 7 5"/><path d="M14 21l5-12 5 12M16 17h6"/></svg>;
    case 'palette': return <svg {...props}><path d="M12 3a9 9 0 0 0 0 18c1 0 2-.7 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.2 1-2.2 2.2-2.2H17a4 4 0 0 0 4-4c0-3.7-4-7-9-7z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/></svg>;
    case 'pin': return <svg {...props}><path d="M12 22v-7"/><path d="M9 4h6l-1 7 3 2v2H7v-2l3-2z"/></svg>;
    case 'image': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>;
    default: return null;
  }
};

window.Icon = Icon;
