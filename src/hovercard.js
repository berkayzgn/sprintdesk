// ============================================================
// HOVERCARD — Bir kişinin avatarının üzerine gelince küçük kart
// ============================================================
// data-user-id taşıyan her öğe için çalışır (board üyeleri, kart kişileri,
// yorumlar, topluluk…). Kartta ad, e-posta ve "Mesaj gönder" düğmesi var.
// Fare karta geçebilsin diye kapanma kısa bir gecikmeyle olur.
// ============================================================
import { state } from './state.js';
import { escHtml, cssColor } from './helpers.js';
import { person, openChat } from './social.js';

const SHOW_DELAY = 350;
const HIDE_DELAY = 220;

let card = null;
let showTimer = null;
let hideTimer = null;
let currentTarget = null;

function hide() {
  clearTimeout(showTimer);
  card?.remove();
  card = null;
  currentTarget = null;
}

function show(target) {
  const id = target.dataset.userId;
  if (!id || !state.authed) return;
  const p = person(id);
  if (p.name === 'Bilinmeyen') return;
  hide();
  currentTarget = target;
  const isMe = id === state.userId;
  card = document.createElement('div');
  card.className = 'hovercard';
  card.setAttribute('role', 'dialog');
  card.innerHTML = `
    <div class="hc-top">
      <span class="hc-avatar" style="background:${cssColor(p.color)}">${escHtml(p.initials)}</span>
      <div class="hc-info">
        <div class="hc-name">${escHtml(p.name)}${isMe ? ' <span class="hc-me">(sen)</span>' : ''}</div>
        ${p.email ? `<div class="hc-email">${escHtml(p.email)}</div>` : ''}
        ${p.isAdmin ? '<span class="hc-badge">Yönetici</span>' : ''}
      </div>
    </div>
    ${isMe ? '' : `<button type="button" class="hc-msg">💬 Mesaj gönder</button>`}
  `;
  document.body.appendChild(card);
  card.querySelector('.hc-msg')?.addEventListener('click', e => {
    e.stopPropagation();
    hide();
    openChat(id);
  });
  card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  card.addEventListener('mouseleave', () => { hideTimer = setTimeout(hide, HIDE_DELAY); });

  const r = target.getBoundingClientRect();
  const w = card.offsetWidth, h = card.offsetHeight, m = 10;
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - m) top = r.top - 8 - h;
  card.style.top = `${Math.max(m, top)}px`;
  card.style.left = `${Math.max(m, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - m))}px`;
}

export function initHovercards() {
  // Yalnızca fareli cihazlarda: dokunmatikte hover yok
  if (!window.matchMedia('(hover: hover)').matches) return;
  document.addEventListener('mouseover', e => {
    const target = e.target.closest?.('[data-user-id]');
    if (!target || target.closest('.hovercard') || target.closest('#dm-dock')) return;
    if (target === currentTarget) { clearTimeout(hideTimer); return; }
    clearTimeout(showTimer);
    showTimer = setTimeout(() => { if (target.isConnected && target.matches(':hover')) show(target); }, SHOW_DELAY);
  });
  document.addEventListener('mouseout', e => {
    const target = e.target.closest?.('[data-user-id]');
    if (!target) return;
    if (target.contains(e.relatedTarget)) return;
    clearTimeout(showTimer);
    if (target === currentTarget) hideTimer = setTimeout(hide, HIDE_DELAY);
  });
  document.addEventListener('pointerdown', e => { if (card && !card.contains(e.target)) hide(); }, true);
  window.addEventListener('scroll', hide, true);
}
