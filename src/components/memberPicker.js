/** Board üyelerinden kişi seçme popover'ı. Body'ye eklenir, böylece modal yeniden çizilse de açık kalır. */
import { cssColor, escHtml, ICONS } from '../lib/helpers.js';

const GAP = 8;
const VIEWPORT_MARGIN = 12;

let active = null;

export function closeMemberPicker() {
  if (!active) return;
  active.cleanup();
  active.el.remove();
  active = null;
}

/**
 * @param {HTMLElement} anchor
 * @param {object} opts
 * @param {{id: string, name: string, initials: string, color: string}[]} opts.members
 * @param {string[]} opts.selected
 * @param {boolean} [opts.multiple] false ise tek kişi seçilir ve seçince kapanır
 * @param {(selectedIds: string[]) => void} opts.onChange
 */
export function openMemberPicker(anchor, { title, members, selected, multiple = true, onChange }) {
  const sameAnchor = active && active.anchor === anchor;
  closeMemberPicker();
  if (sameAnchor) return; // aynı butona ikinci tıklama kapatır

  let current = new Set(selected);
  const el = document.createElement('div');
  el.className = 'member-picker';
  el.innerHTML = `
    <div class="member-picker-head">
      <span>${escHtml(title)}</span>
      <button type="button" class="member-picker-close" aria-label="Kapat">${ICONS.x}</button>
    </div>
    <input class="member-picker-search" placeholder="Üye ara…" autocomplete="off">
    <div class="member-picker-label">Board üyeleri</div>
    <div class="member-picker-list" role="listbox" aria-multiselectable="${multiple}"></div>
  `;
  document.body.appendChild(el);

  const list = el.querySelector('.member-picker-list');
  const search = el.querySelector('.member-picker-search');

  const memberItem = m => {
    const selected = current.has(m.id);
    return `
          <button type="button" class="member-picker-item ${selected ? 'is-selected' : ''}" data-id="${escHtml(m.id)}" role="option" aria-selected="${selected}">
            <span class="member-picker-avatar" style="background:${cssColor(m.color)}">${escHtml(m.initials)}</span>
            <span class="member-picker-name">${escHtml(m.name)}</span>
            <span class="member-picker-check">${ICONS.tick}</span>
          </button>`;
  };
  const renderList = () => {
    const q = search.value.trim().toLocaleLowerCase('tr');
    const visible = members.filter(m => !q || m.name.toLocaleLowerCase('tr').includes(q));
    list.innerHTML = visible.length
      ? visible.map(memberItem).join('')
      : `<div class="member-picker-empty">Eşleşen üye yok</div>`;
  };
  renderList();

  list.addEventListener('click', e => {
    const item = e.target.closest('.member-picker-item');
    if (!item) return;
    const id = item.dataset.id;
    if (multiple) {
      if (current.has(id)) current.delete(id);
      else current.add(id);
    } else {
      current = current.has(id) ? new Set() : new Set([id]);
    }
    renderList();
    onChange([...current]);
    if (!multiple) closeMemberPicker();
  });
  search.addEventListener('input', renderList);
  el.querySelector('.member-picker-close').addEventListener('click', closeMemberPicker);

  // Çapanın altı, sığmazsa üstü
  const r = anchor.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = el;
  const m = VIEWPORT_MARGIN;
  let top = r.bottom + GAP;
  if (top + h > window.innerHeight - m && r.top - GAP - h >= m) top = r.top - GAP - h;
  el.style.top = `${Math.max(m, Math.min(top, window.innerHeight - h - m))}px`;
  el.style.left = `${Math.max(m, Math.min(r.left, window.innerWidth - w - m))}px`;

  const onDocDown = e => {
    if (el.contains(e.target) || anchor.contains(e.target)) return;
    closeMemberPicker();
  };
  const onKey = e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeMemberPicker();
    }
  };
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);

  active = {
    el,
    anchor,
    cleanup: () => {
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
    },
  };
  search.focus();
}
