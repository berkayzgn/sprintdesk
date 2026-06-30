// ============================================================
// SIDEBAR — Masaüstü sidebar bileşeni
// ============================================================
import { state, setState } from './state.js';
import { PEOPLE } from './data.js';
import { escHtml, ICONS } from './helpers.js';

const EDIT_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`;
const TRASH_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const X_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

export function renderSidebar(container) {
  const s = state;
  const expanded = s.sideExpanded;
  const w = expanded ? '258px' : '74px';
  const boards = s.boards || [];
  const activeId = s.activeBoardId;
  const editingId = s.editingBoardId;

  container.innerHTML = `
    <aside id="sidebar" style="width:${w};transition:width .2s">
      <div class="sidebar-header">
        <span class="workspace-icon">A</span>
        ${expanded ? `
          <div class="workspace-info">
            <div class="workspace-name">Acme Studio</div>
            <div class="workspace-plan">Premium çalışma alanı</div>
          </div>` : ''}
      </div>

      <div class="sidebar-nav">
        ${expanded ? `<div class="sidebar-section-label">Boards</div>` : ''}
        <div class="sidebar-boards" id="sidebar-boards">
          ${boards.map(b => {
            const isActive = b.id === activeId;
            const isEditing = b.id === editingId;

            if (isEditing && expanded) {
              return `
                <div class="board-btn active" style="gap:6px;padding:6px 8px">
                  <span class="board-dot" style="background:${b.color};flex-shrink:0"></span>
                  <input id="edit-board-inp" value="${escHtml(b.name)}" style="flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:13px;font-weight:600;color:var(--text,#1a1d2e)">
                  <button class="board-action-btn confirm-edit" data-id="${b.id}" title="Kaydet">${CHECK_ICON}</button>
                  <button class="board-action-btn cancel-edit" title="İptal">${X_ICON}</button>
                </div>
              `;
            }

            return `
              <div class="board-btn-row ${isActive ? 'active-row' : ''}">
                <button class="board-btn ${isActive ? 'active' : ''} board-select" data-id="${b.id}" style="flex:1;min-width:0">
                  <span class="board-dot" style="background:${b.color}"></span>
                  ${expanded ? `<span class="board-name">${escHtml(b.name)}</span>` : ''}
                </button>
                ${expanded ? `
                  <div class="board-actions">
                    <button class="board-action-btn edit-board-btn" data-id="${b.id}" title="İsim değiştir">${EDIT_ICON}</button>
                    <button class="board-action-btn delete-board-btn" data-id="${b.id}" title="Sil">${TRASH_ICON}</button>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <button class="add-board-btn" id="add-board-btn">
          ${ICONS.plus}
          ${expanded ? `<span style="white-space:nowrap">Yeni Board</span>` : ''}
        </button>
      </div>

      <div class="sidebar-footer">
        <button class="sidebar-user-btn" id="sidebar-user-btn" title="Profile git">
          <span class="avatar" style="width:34px;height:34px;font-size:12.5px;font-weight:700">AY</span>
          ${expanded ? `
            <div class="user-info">
              <div class="user-name">${PEOPLE.ay.name}</div>
              <div class="user-email">ayse@acmestudio.io</div>
            </div>
          ` : ''}
        </button>
        ${expanded ? `<button class="icon-btn">${ICONS.sliders}</button>` : ''}
      </div>
    </aside>
  `;

  // Board seç — geçici UI durumlarını temizle
  container.querySelectorAll('.board-select').forEach(btn => {
    btn.addEventListener('click', () => setState({
      activeBoardId: btn.dataset.id,
      addingList: false,
      addingCardFor: null,
      openCardId: null,
      search: '',
    }));
  });

  // Edit başlat
  container.querySelectorAll('.edit-board-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setState({ editingBoardId: btn.dataset.id });
    });
  });

  // Edit onayla
  const confirmBtn = container.querySelector('.confirm-edit');
  if (confirmBtn) {
    const inp = container.querySelector('#edit-board-inp');
    const save = () => {
      const name = (inp?.value || '').trim();
      if (!name) return;
      setState({
        boards: state.boards.map(b => b.id === confirmBtn.dataset.id ? { ...b, name } : b),
        editingBoardId: null,
      });
    };
    confirmBtn.addEventListener('click', save);
    inp?.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setState({ editingBoardId: null }); });
    inp?.focus();
  }

  // Edit iptal
  container.querySelector('.cancel-edit')?.addEventListener('click', () => setState({ editingBoardId: null }));

  // Sil
  container.querySelectorAll('.delete-board-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const remaining = state.boards.filter(b => b.id !== id);
      setState({
        boards: remaining,
        activeBoardId: state.activeBoardId === id ? (remaining[0]?.id || null) : state.activeBoardId,
      });
    });
  });

  // Yeni board
  container.querySelector('#add-board-btn').addEventListener('click', () => setState({ newBoardModal: true }));

  // Profil
  container.querySelector('#sidebar-user-btn').addEventListener('click', () => setState({ profileOpen: true }));
}
