// ============================================================
// FILTERS — Board kart filtreleri (üye, etiket, tarih)
// ============================================================
// Aynı grup içinde seçenekler VEYA, gruplar arası VE ile birleşir:
// "Mert veya Selin'e atanmış" VE "Acil etiketli". Filtreler cihaza özel
// ve geçicidir; board değişince sıfırlanır.
// ============================================================
import { state, setState, getActiveBoard } from './state.js';
import { cssColor, escHtml, boardMembers, ICONS } from './helpers.js';
import { parseISODate } from './dates.js';

export const NO_FILTERS = { members: [], labels: [], due: [] };

const DUE_OPTIONS = [
  { id: 'overdue', name: 'Tarihi geçmiş' },
  { id: 'week',    name: 'Bu hafta içinde' },
  { id: 'none',    name: 'Tarihsiz' },
];

const CHECK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

export function activeFilterCount(f = state.filters) {
  return f.members.length + f.labels.length + f.due.length;
}

function dueMatches(card, kinds) {
  if (!kinds.length) return true;
  const due = parseISODate(card.dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  return kinds.some(k => {
    if (k === 'none') return !due;
    if (!due || card.dueComplete) return false;
    if (k === 'overdue') return due < today;
    if (k === 'week') return due >= today && due <= inWeek;
    return false;
  });
}

/** Kart aktif filtrelere uyuyor mu */
export function cardMatchesFilters(card, f = state.filters) {
  if (f.members.length) {
    const people = new Set([...card.assignees, ...card.checklist.map(i => i.assignee).filter(Boolean)]);
    if (!f.members.some(id => people.has(id))) return false;
  }
  if (f.labels.length && !f.labels.some(id => card.labels.includes(id))) return false;
  return dueMatches(card, f.due);
}

// ---------- Popover ----------

let active = null;

export function closeFilterPopover() {
  if (!active) return;
  active.cleanup();
  active.el.remove();
  active = null;
}

export function openFilterPopover(anchor) {
  if (active) { closeFilterPopover(); return; }
  const board = getActiveBoard();
  if (!board) return;

  const el = document.createElement('div');
  el.className = 'member-picker filter-popover';
  document.body.appendChild(el);

  const option = (group, id, content, selected) => `
    <button type="button" class="member-picker-item ${selected ? 'is-selected' : ''}" data-group="${group}" data-id="${escHtml(id)}" aria-pressed="${selected}">
      ${content}
      <span class="member-picker-check">${CHECK}</span>
    </button>`;

  const render = () => {
    const f = state.filters;
    const me = state.userId;
    const members = boardMembers(board);
    const labels = Object.values(state.labelsByBoard[board.id] || {});
    el.innerHTML = `
      <div class="member-picker-head">
        <span>Filtrele</span>
        <button type="button" class="member-picker-close" aria-label="Kapat">${ICONS.x}</button>
      </div>
      <div class="filter-scroll">
        <div class="member-picker-label">Üyeler</div>
        <div class="member-picker-list">
          ${members.map(m => option('members', m.id, `
            <span class="member-picker-avatar" style="background:${cssColor(m.color)}">${escHtml(m.initials)}</span>
            <span class="member-picker-name">${escHtml(m.id === me ? `${m.name} (ben)` : m.name)}</span>`, f.members.includes(m.id))).join('')}
        </div>
        ${labels.length ? `
          <div class="member-picker-label">Etiketler</div>
          <div class="member-picker-list">
            ${labels.map(l => option('labels', l.id, `<span class="label-swatch" style="background:${cssColor(l.color)}">${escHtml(l.name)}</span>`, f.labels.includes(l.id))).join('')}
          </div>` : ''}
        <div class="member-picker-label">Tarih</div>
        <div class="member-picker-list">
          ${DUE_OPTIONS.map(d => option('due', d.id, `<span class="member-picker-name">${d.name}</span>`, f.due.includes(d.id))).join('')}
        </div>
      </div>
      <button type="button" class="filter-clear" ${activeFilterCount() ? '' : 'disabled'}>Filtreleri temizle</button>
    `;
  };
  render();

  el.addEventListener('click', e => {
    if (e.target.closest('.member-picker-close')) { closeFilterPopover(); return; }
    if (e.target.closest('.filter-clear')) { setState({ filters: NO_FILTERS }); render(); return; }
    const opt = e.target.closest('[data-group]');
    if (!opt) return;
    const { group, id } = opt.dataset;
    const current = state.filters[group];
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    const scroll = el.querySelector('.filter-scroll').scrollTop;
    setState({ filters: { ...state.filters, [group]: next } });
    render();
    el.querySelector('.filter-scroll').scrollTop = scroll;
  });

  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, m = 12;
  el.style.top = `${r.bottom + 8}px`;
  el.style.left = `${Math.max(m, Math.min(r.right - w, window.innerWidth - w - m))}px`;

  const onDocDown = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeFilterPopover(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeFilterPopover(); } };
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
