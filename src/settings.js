// ============================================================
// SETTINGS — Sidebar'daki ayarlar popover'ı (yalnızca yöneticiye: kullanıcılar).
// Tema üst çubuktaki anahtarda, bildirim ayarları Bildirimler sayfasında.
// ============================================================
import { state, setState } from './state.js';
import { ICONS } from './helpers.js';


const USERS = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

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
    ${state.isAdmin ? `
      <div class="settings-label">Yönetim</div>
      <button type="button" class="settings-row-btn" id="settings-users">${USERS}<span>Kullanıcılar</span></button>
    ` : ''}
  `;
  document.body.appendChild(el);

  el.querySelector('.settings-close').addEventListener('click', closeSettings);

  el.querySelector('#settings-users')?.addEventListener('click', () => {
    closeSettings();
    setState({ usersOpen: true, navOpen: false });
  });

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
