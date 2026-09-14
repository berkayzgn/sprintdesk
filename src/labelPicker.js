// ============================================================
// LABEL PICKER — Karta etiket ekle/çıkar, etiket oluştur/düzenle/sil
// ============================================================
// memberPicker ile aynı desen: body'ye eklenen popover. Liste her
// değişiklikte state'ten yeniden çizilir (başka üyenin eklediği etiket
// de görünür); arama kutusu ve düzenleme formu DOM'da tutulur.
// ============================================================
import { state } from './state.js';
import { escHtml, ICONS } from './helpers.js';
import { findCard, toggleCardLabel, createLabel, updateLabel, deleteLabel } from './store.js';

export const LABEL_COLORS = ['#8b5cf6', '#6366f1', '#0ea5a3', '#10b981', '#f59e0b', '#f97316', '#f43f5e', '#64748b'];

const CHECK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

let active = null;

export function closeLabelPicker() {
  if (!active) return;
  active.cleanup();
  active.el.remove();
  active = null;
}

/** Açıksa state değişince içeriği tazele (render döngüsünden çağrılır) */
export function refreshLabelPicker() {
  active?.render();
}

export function openLabelPicker(anchor, cardId) {
  const sameAnchor = active && active.cardId === cardId;
  closeLabelPicker();
  if (sameAnchor) return;

  let editingId = null;   // düzenlenen etiket, 'new' = yeni etiket formu
  let draftColor = LABEL_COLORS[0];

  const el = document.createElement('div');
  el.className = 'member-picker label-picker';
  el.innerHTML = `
    <div class="member-picker-head">
      <span>Etiketler</span>
      <button type="button" class="member-picker-close" aria-label="Kapat">${ICONS.x}</button>
    </div>
    <div class="label-picker-body"></div>
  `;
  document.body.appendChild(el);
  const body = el.querySelector('.label-picker-body');

  const colorRow = selected => `
    <div class="label-color-row">
      ${LABEL_COLORS.map(c => `<button type="button" class="label-color ${c === selected ? 'is-selected' : ''}" data-color="${c}" style="background:${c}" aria-label="Renk ${c}"></button>`).join('')}
    </div>`;

  const editForm = label => `
    <form class="label-edit-form" data-id="${label ? escHtml(label.id) : 'new'}">
      <input class="member-picker-search label-name-inp" placeholder="Etiket adı" maxlength="40" value="${escHtml(label?.name || '')}">
      ${colorRow(draftColor)}
      <div class="label-edit-actions">
        ${label ? `<button type="button" class="label-delete">Sil</button>` : ''}
        <span style="flex:1"></span>
        <button type="button" class="label-cancel">Vazgeç</button>
        <button type="submit" class="invite-submit">${label ? 'Kaydet' : 'Oluştur'}</button>
      </div>
    </form>`;

  const render = () => {
    const card = findCard(cardId);
    if (!card) { closeLabelPicker(); return; }
    const labels = Object.values(state.labelsByBoard[state.activeBoardId] || {});

    // Düzenleme formundaki yazıyı yeniden çizimde kaybetme
    const typed = body.querySelector('.label-name-inp')?.value;

    body.innerHTML = `
      <div class="member-picker-list">
        ${labels.length ? labels.map(l => editingId === l.id ? editForm(l) : `
          <div class="label-row">
            <button type="button" class="member-picker-item label-toggle ${card.labels.includes(l.id) ? 'is-selected' : ''}" data-id="${escHtml(l.id)}" aria-pressed="${card.labels.includes(l.id)}">
              <span class="label-swatch" style="background:${l.color}">${escHtml(l.name)}</span>
              <span class="member-picker-check">${CHECK}</span>
            </button>
            <button type="button" class="label-edit-btn" data-id="${escHtml(l.id)}" title="Düzenle" aria-label="${escHtml(l.name)} etiketini düzenle">${ICONS.edit13}</button>
          </div>`).join('') : '<div class="member-picker-empty">Bu board\'da etiket yok</div>'}
      </div>
      ${editingId === 'new' ? editForm(null) : `<button type="button" class="label-new-btn">${ICONS.plus} Yeni etiket</button>`}
    `;

    const nameInp = body.querySelector('.label-name-inp');
    if (nameInp) {
      if (typed !== undefined) nameInp.value = typed;
      nameInp.focus();
    }
  };

  body.addEventListener('click', e => {
    const toggle = e.target.closest('.label-toggle');
    if (toggle) { toggleCardLabel(cardId, toggle.dataset.id); render(); return; }

    const edit = e.target.closest('.label-edit-btn');
    if (edit) {
      editingId = edit.dataset.id;
      draftColor = state.labelsByBoard[state.activeBoardId]?.[editingId]?.color || LABEL_COLORS[0];
      body.innerHTML = ''; // eski formun yazısı taşınmasın
      render();
      return;
    }
    if (e.target.closest('.label-new-btn')) {
      editingId = 'new';
      draftColor = LABEL_COLORS[0];
      body.innerHTML = '';
      render();
      return;
    }
    const color = e.target.closest('.label-color');
    if (color) {
      draftColor = color.dataset.color;
      body.querySelectorAll('.label-color').forEach(b => b.classList.toggle('is-selected', b === color));
      return;
    }
    if (e.target.closest('.label-cancel')) { editingId = null; body.innerHTML = ''; render(); return; }
    if (e.target.closest('.label-delete')) {
      deleteLabel(editingId);
      editingId = null;
      body.innerHTML = '';
      render();
    }
  });

  body.addEventListener('submit', e => {
    e.preventDefault();
    const name = body.querySelector('.label-name-inp').value.trim();
    if (editingId === 'new') createLabel(name, draftColor);
    else updateLabel(editingId, { name, color: draftColor });
    editingId = null;
    body.innerHTML = '';
    render();
  });

  body.addEventListener('keydown', e => {
    if (e.key === 'Escape' && editingId) { e.stopPropagation(); editingId = null; body.innerHTML = ''; render(); }
  });

  el.querySelector('.member-picker-close').addEventListener('click', closeLabelPicker);
  render();

  // Konum: çapanın altı, sığmazsa üstü
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, m = 12;
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - m && r.top - 8 - h >= m) top = r.top - 8 - h;
  el.style.top = `${Math.max(m, Math.min(top, window.innerHeight - h - m))}px`;
  el.style.left = `${Math.max(m, Math.min(r.left, window.innerWidth - w - m))}px`;

  const onDocDown = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeLabelPicker(); };
  const onKey = e => { if (e.key === 'Escape' && !editingId) { e.stopPropagation(); closeLabelPicker(); } };
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);

  active = {
    el, cardId, render,
    cleanup: () => {
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
    },
  };
}
