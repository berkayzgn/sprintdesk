// ============================================================
// THEME — CSS değişken üretimi
// ============================================================

// Marka paleti — özelleştirme & tema renkleri (her iki temada ortak)
export const BRAND = {
  purple: '#360185',
  yellow: '#FBC02D',
  teal:   '#10CAB9',
  pink:   '#FE6ABF',
};

const BRAND_VARS = {
  '--brand-purple': BRAND.purple,
  '--brand-yellow': BRAND.yellow,
  '--brand-teal':   BRAND.teal,
  '--brand-pink':   BRAND.pink,
};

export function themeVars(theme, style) {
  const A = style === 'A';
  if (theme === 'dark') return {
    ...BRAND_VARS,
    '--canvas':           A ? '#0b0c13' : '#0d0e16',
    '--sidebar-bg':       A ? '#121120' : '#13141c',
    '--sidebar-fg':       'rgba(255,255,255,.62)',
    '--sidebar-fg-strong':'#f1f2fa',
    '--sidebar-active':   'rgba(129,140,248,.18)',
    '--sidebar-active-fg':'#c7cbff',
    '--sidebar-border':   'rgba(255,255,255,.07)',
    '--topbar-bg':        '#15161f',
    '--surface':          '#1a1c26',
    '--list-bg':          A ? '#15161f' : '#14151c',
    '--list-border':      A ? '1px solid transparent' : '1px solid #22242e',
    '--card-bg':          A ? '#1f212b' : '#1a1c24',
    '--card-border':      A ? '1px solid #272935' : '1px solid #24262f',
    '--card-shadow':      '0 1px 2px rgba(0,0,0,.45)',
    '--card-shadow-hover':'0 10px 26px rgba(0,0,0,.55)',
    '--text':             '#e9eaf4',
    '--text-muted':       '#9296b3',
    '--text-subtle':      '#6b6f8c',
    '--accent':           '#9b6dff',
    '--accent-strong':    '#7c3aed',
    '--accent-soft':      'rgba(155,109,255,.16)',
    '--border':           '#272935',
    '--radius':           A ? '12px' : '10px',
    '--chip-bg':          '#23252f',
    '--count-bg':         'rgba(255,255,255,.08)',
    '--addlist-bg':       'rgba(255,255,255,.03)',
    '--dock-bg':          '#08080d',
    '--dock-fg':          '#7e82a0',
    '--dock-title':       '#fff',
    '--dock-track':       'rgba(255,255,255,.06)',
    '--dock-border':      'rgba(255,255,255,.06)',
    '--scrim':            'rgba(0,0,0,.62)',
  };

  return {
    ...BRAND_VARS,
    '--canvas':           A ? '#eceef6' : '#f6f7fb',
    '--sidebar-bg':       '#ffffff',
    '--sidebar-fg':       '#6b7090',
    '--sidebar-fg-strong':'#191b2c',
    '--sidebar-active':   '#ece4f7',
    '--sidebar-active-fg':'#360185',
    '--sidebar-border':   '#ececf3',
    '--topbar-bg':        '#ffffff',
    '--surface':          '#ffffff',
    '--list-bg':          A ? '#e7e9f2' : '#eff0f6',
    '--list-border':      A ? '1px solid transparent' : '1px solid #e9eaf2',
    '--card-bg':          '#ffffff',
    '--card-border':      A ? '1px solid transparent' : '1px solid #ececf3',
    '--card-shadow':      A ? '0 1px 2px rgba(16,24,40,.09),0 1px 3px rgba(16,24,40,.06)' : '0 1px 2px rgba(16,24,40,.05)',
    '--card-shadow-hover':A ? '0 10px 22px rgba(16,24,40,.16)' : '0 8px 20px rgba(99,102,241,.13)',
    '--text':             '#191b2c',
    '--text-muted':       '#6b7090',
    '--text-subtle':      '#9296b3',
    '--accent':           '#360185',
    '--accent-strong':    '#2a0166',
    '--accent-soft':      '#ece4f7',
    '--border':           '#e6e7f0',
    '--radius':           A ? '12px' : '10px',
    '--chip-bg':          '#f2f3f8',
    '--count-bg':         'rgba(120,120,150,.12)',
    '--addlist-bg':       'rgba(255,255,255,.45)',
    '--dock-bg':          '#14131f',
    '--dock-fg':          '#9296b3',
    '--dock-title':       '#fff',
    '--dock-track':       'rgba(255,255,255,.07)',
    '--dock-border':      'rgba(255,255,255,.08)',
    '--scrim':            'rgba(17,18,32,.45)',
  };
}

/** CSS değişkenlerini bir DOM elementine uygular */
export function applyTheme(el, theme, style) {
  const vars = themeVars(theme, style);
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
  }
}
