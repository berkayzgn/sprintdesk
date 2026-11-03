/** Sidebar'daki yönetim popover'ı (yalnızca yöneticiye görünür). */
import { state, setState } from '../core/state.js';
import { ICONS } from '../lib/helpers.js';

const USERS_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

const POPOVER_MARGIN = 12;
const ANCHOR_GAP = 8;

let active = null;

export function closeSettings() {
  if (!active) return;
  active.cleanup();
  active.el.remove();
  active = null;
}

export function openSettings(anchor) {
  // İkinci tıklama kapatır
  if (active) {
    closeSettings();
    return;
  }

  const el = document.createElement('div');
  el.className = 'settings-popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Ayarlar');
  el.innerHTML = `
    <div class="settings-head">
      <span>Ayarlar</span>
      <button type="button" class="settings-close" aria-label="Kapat">${ICONS.x}</button>
    </div>
    ${
      state.isAdmin
        ? `
      <div class="settings-label">Yönetim</div>
      <button type="button" class="settings-row-btn" id="settings-users">${USERS_ICON}<span>Kullanıcılar</span></button>
    `
        : ''
    }
  `;
  document.body.appendChild(el);

  el.querySelector('.settings-close').addEventListener('click', closeSettings);

  el.querySelector('#settings-users')?.addEventListener('click', () => {
    closeSettings();
    setState({ usersOpen: true, navOpen: false });
  });

  // Butonun üstünde (sidebar altta), sığmazsa altında; sağ kenarı butona hizalı ki sidebar içinde kalsın
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const m = POPOVER_MARGIN;
  let top = r.top - ANCHOR_GAP - h;
  if (top < m) top = r.bottom + ANCHOR_GAP;
  el.style.top = `${Math.max(m, Math.min(top, window.innerHeight - h - m))}px`;
  el.style.left = `${Math.max(m, Math.min(r.right - w, window.innerWidth - w - m))}px`;

  const onDocDown = e => {
    if (el.contains(e.target) || anchor.contains(e.target)) return;
    closeSettings();
  };
  const onKey = e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeSettings();
    }
  };
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
