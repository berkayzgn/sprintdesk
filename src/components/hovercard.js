/** [data-user-id] taşıyan öğelerin üzerine gelince açılan kişi kartı. */
import { state } from '../core/state.js';
import { escHtml, cssColor } from '../lib/helpers.js';
import { person, openChat } from '../core/social.js';

const SHOW_DELAY = 350;
// Fare hedeften karta geçebilsin diye kapanma gecikmeli
const HIDE_DELAY = 220;
const GAP = 8;
const VIEWPORT_MARGIN = 10;

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
  card.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(hide, HIDE_DELAY);
  });

  // Hedefin altında ortalı; sığmazsa üstünde
  const r = target.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = card;
  let top = r.bottom + GAP;
  if (top + h > window.innerHeight - VIEWPORT_MARGIN) top = r.top - GAP - h;
  const centered = r.left + r.width / 2 - w / 2;
  card.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
  card.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(centered, window.innerWidth - w - VIEWPORT_MARGIN))}px`;
}

export function initHovercards() {
  // Dokunmatik cihazlarda hover yok
  if (!window.matchMedia('(hover: hover)').matches) return;
  document.addEventListener('mouseover', e => {
    const target = e.target.closest?.('[data-user-id]');
    if (!target || target.closest('.hovercard') || target.closest('#dm-dock')) return;
    if (target === currentTarget) {
      clearTimeout(hideTimer);
      return;
    }
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      if (target.isConnected && target.matches(':hover')) show(target);
    }, SHOW_DELAY);
  });
  document.addEventListener('mouseout', e => {
    const target = e.target.closest?.('[data-user-id]');
    if (!target) return;
    if (target.contains(e.relatedTarget)) return;
    clearTimeout(showTimer);
    if (target === currentTarget) hideTimer = setTimeout(hide, HIDE_DELAY);
  });
  document.addEventListener(
    'pointerdown',
    e => {
      if (card && !card.contains(e.target)) hide();
    },
    true,
  );
  window.addEventListener('scroll', hide, true);
}
