// ============================================================
// MEMBER PICKER — Board üyelerinden kişi seçme popover'ı
// ============================================================
// Popover body'ye eklenir; böylece seçim sonrası modal yeniden çizilse de
// açık kalır (çoklu seçimde) ve konumu çapadan bağımsız korunur.
// ============================================================
import { cssColor, escHtml, ICONS } from './helpers.js';

const CHECK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

let active = null; // { el, cleanup }

export function closeMemberPicker() {
  if (!active) return;
  active.cleanup();
  active.el.remove();
  active = null;
}

/**
 * @param {HTMLElement} anchor
 * @param {object} opts
 * @param {string} opts.title
 * @param {{id: string, name: string, initials: string, color: string}[]} opts.members
 * @param {string[]} opts.selected
 * @param {boolean} [opts.multiple]  true: kart üyeleri (açık kalır), false: tek kişi (seçince kapanır)
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

  const renderList = () => {
    const q = search.value.trim().toLocaleLowerCase('tr');
    const visible = members.filter(m => !q || m.name.toLocaleLowerCase('tr').includes(q));
    list.innerHTML = visible.length
      ? visible.map(m => `
          <button type="button" class="member-picker-item ${current.has(m.id) ? 'is-selected' : ''}" data-id="${escHtml(m.id)}" role="option" aria-selected="${current.has(m.id)}">
            <span class="member-picker-avatar" style="background:${cssColor(m.color)}">${escHtml(m.initials)}</span>
            <span class="member-picker-name">${escHtml(m.name)}</span>
            <span class="member-picker-check">${CHECK}</span>
          </button>`).join('')
      : `<div class="member-picker-empty">Eşleşen üye yok</div>`;
  };
  renderList();

  list.addEventListener('click', e => {
    const item = e.target.closest('.member-picker-item');
    if (!item) return;
    const id = item.dataset.id;
    if (multiple) {
      current.has(id) ? current.delete(id) : current.add(id);
    } else {
      current = current.has(id) ? new Set() : new Set([id]);
    }
    renderList();
    onChange([...current]);
    if (!multiple) closeMemberPicker();
  });
  search.addEventListener('input', renderList);
  el.querySelector('.member-picker-close').addEventListener('click', closeMemberPicker);

  // Konum: çapanın altı, sığmazsa üstü
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, m = 12;
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - m && r.top - 8 - h >= m) top = r.top - 8 - h;
  el.style.top = `${Math.max(m, Math.min(top, window.innerHeight - h - m))}px`;
  el.style.left = `${Math.max(m, Math.min(r.left, window.innerWidth - w - m))}px`;

  const onDocDown = e => {
    if (el.contains(e.target) || anchor.contains(e.target)) return;
    closeMemberPicker();
  };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeMemberPicker(); } };
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
