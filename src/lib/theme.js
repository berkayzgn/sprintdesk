/** Açık / koyu tema CSS değişkenleri */

// Marka renkleri her iki temada ortak
const BRAND = {
  purple: '#360185',
  yellow: '#FBC02D',
  teal: '#10CAB9',
  pink: '#FE6ABF',
};

const BRAND_VARS = {
  '--brand-purple': BRAND.purple,
  '--brand-yellow': BRAND.yellow,
  '--brand-teal': BRAND.teal,
  '--brand-pink': BRAND.pink,
};

function themeVars(theme) {
  if (theme === 'dark')
    return {
      ...BRAND_VARS,
      '--canvas': '#0b0c13',
      '--sidebar-bg': '#121120',
      '--sidebar-fg': 'rgba(255,255,255,.62)',
      '--sidebar-fg-strong': '#f1f2fa',
      '--sidebar-active': 'rgba(155,109,255,.16)',
      '--sidebar-active-fg': '#dccbff',
      '--sidebar-border': 'rgba(255,255,255,.07)',
      '--topbar-bg': '#15161f',
      '--surface': '#1a1c26',
      '--list-bg': '#15161f',
      '--list-border': '1px solid transparent',
      '--card-bg': '#1f212b',
      '--card-border': '1px solid #272935',
      '--card-shadow': '0 1px 2px rgba(0,0,0,.45)',
      '--card-shadow-hover': '0 3px 12px rgba(0,0,0,.45)',
      '--text': '#e9eaf4',
      '--text-muted': '#9296b3',
      '--text-subtle': '#6b6f8c',
      '--accent': '#9b6dff',
      '--accent-strong': '#7c3aed',
      '--accent-soft': 'rgba(155,109,255,.16)',
      '--border': '#272935',
      '--radius': '12px',
      '--chip-bg': '#23252f',
      '--count-bg': 'rgba(255,255,255,.08)',
      '--addlist-bg': 'rgba(255,255,255,.03)',
      '--scrim': 'rgba(0,0,0,.62)',
    };

  return {
    ...BRAND_VARS,
    '--canvas': '#eceef6',
    '--sidebar-bg': '#ffffff',
    '--sidebar-fg': '#6b7090',
    '--sidebar-fg-strong': '#191b2c',
    '--sidebar-active': '#ece4f7',
    '--sidebar-active-fg': '#360185',
    '--sidebar-border': '#ececf3',
    '--topbar-bg': '#ffffff',
    '--surface': '#ffffff',
    '--list-bg': '#e7e9f2',
    '--list-border': '1px solid transparent',
    '--card-bg': '#ffffff',
    '--card-border': '1px solid transparent',
    '--card-shadow': '0 1px 2px rgba(16,24,40,.09),0 1px 3px rgba(16,24,40,.06)',
    '--card-shadow-hover': '0 3px 10px rgba(16,24,40,.10)',
    '--text': '#191b2c',
    '--text-muted': '#6b7090',
    '--text-subtle': '#9296b3',
    '--accent': '#360185',
    '--accent-strong': '#2a0166',
    '--accent-soft': '#ece4f7',
    '--border': '#e6e7f0',
    '--radius': '12px',
    '--chip-bg': '#f2f3f8',
    '--count-bg': 'rgba(120,120,150,.12)',
    '--addlist-bg': 'rgba(255,255,255,.45)',
    '--scrim': 'rgba(17,18,32,.45)',
  };
}

export function applyTheme(el, theme) {
  for (const [name, value] of Object.entries(themeVars(theme))) {
    el.style.setProperty(name, value);
  }
}
