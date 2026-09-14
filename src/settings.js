// ============================================================
// SETTINGS — Sidebar'daki ayarlar popover'ı (şimdilik görünüm/tema)
// ============================================================
import { state, setState } from './state.js';
import { ICONS } from './helpers.js';

const SUN = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const MOON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

let active = null;

export function closeSettings() {
  if (!active) return;
  active.cleanup();
  active.el.remove();
  active = null;
}

export function openSettings(anchor) {
  if (active) { closeSettings(); return; } // ikinci tıklama kapatır

  const el = document.createElement('div');
  el.className = 'settings-popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Ayarlar');
  el.innerHTML = `
    <div class="settings-head">
      <span>Ayarlar</span>
      <button type="button" class="settings-close" aria-label="Kapat">${ICONS.x}</button>
    </div>
    <div class="settings-label">Görünüm</div>
    <div class="theme-switch" role="radiogroup" aria-label="Tema">
      <button type="button" class="theme-option" data-theme="light" role="radio">${SUN}<span>Açık</span></button>
      <button type="button" class="theme-option" data-theme="dark" role="radio">${MOON}<span>Koyu</span></button>
    </div>
  `;
  document.body.appendChild(el);

  const syncActive = () => el.querySelectorAll('.theme-option').forEach(b => {
    const on = b.dataset.theme === state.theme;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  syncActive();

  el.querySelectorAll('.theme-option').forEach(b => b.addEventListener('click', () => {
    setState({ theme: b.dataset.theme });
    syncActive();
  }));
  el.querySelector('.settings-close').addEventListener('click', closeSettings);

  // Konum: butonun üstünde (sidebar altta), sığmazsa altında
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, m = 12;
  let top = r.top - 8 - h;
  if (top < m) top = r.bottom + 8;
  el.style.top = `${Math.max(m, Math.min(top, window.innerHeight - h - m))}px`;
  // Sağ kenarı butonla hizala → popover sidebar'ın içinde kalsın
  el.style.left = `${Math.max(m, Math.min(r.right - w, window.innerWidth - w - m))}px`;

  const onDocDown = e => {
    if (el.contains(e.target) || anchor.contains(e.target)) return;
    closeSettings();
  };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeSettings(); } };
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  active = {
    el,
    cleanup: () => {
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
    },
  };
}
