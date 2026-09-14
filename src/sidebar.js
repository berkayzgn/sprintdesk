// ============================================================
// SIDEBAR — Masaüstü sidebar bileşeni
// ============================================================
import { state, setState, deleteBoard } from './state.js';
import { PEOPLE } from './data.js';
import { escHtml, compactQuery, ICONS } from './helpers.js';
import { openSettings, closeSettings } from './settings.js';

const EDIT_ICON = ICONS.edit13;
const TRASH_ICON = ICONS.trash13;
const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const X_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

export function renderSidebar(container) {
  const s = state;
  const compact = compactQuery.matches;
  const expanded = compact || s.sideExpanded;
  const w = compact ? '' : (expanded ? '258px' : '74px');

  // Sidebar'ı ilgilendirmeyen state değişikliklerinde DOM'a dokunma: hem
  // gereksiz iş hem de çekmece geçiş animasyonunu bozuyor
  const key = JSON.stringify([s.boards, s.activeBoardId, s.editingBoardId, expanded, compact, s.userEmail]);
  if (container.__key === key) return;
  container.__key = key;
  const boards = s.boards || [];
  const activeId = s.activeBoardId;
  const editingId = s.editingBoardId;

  container.innerHTML = `
    <aside id="sidebar" style="${w ? `width:${w}` : ''}">
      <div class="sidebar-header">
        <span class="workspace-icon">A</span>
        ${expanded ? `
          <div class="workspace-info">
            <div class="workspace-name">KYNC</div>
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
                  <input id="edit-board-inp" value="${escHtml(b.name)}" style="flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:13px;font-weight:600;color:var(--text)">
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

      <div class="sidebar-footer ${expanded ? '' : 'is-collapsed'}">
        <button class="sidebar-user-btn" id="sidebar-user-btn" title="Profile git">
          <span class="avatar" style="width:34px;height:34px;font-size:12.5px;font-weight:700">AY</span>
          ${expanded ? `
            <div class="user-info">
              <div class="user-name">${PEOPLE.ay.name}</div>
              <div class="user-email">${escHtml(state.userEmail || '')}</div>
            </div>
          ` : ''}
        </button>
        <button class="icon-btn" id="sidebar-settings-btn" title="Ayarlar" aria-label="Ayarlar">${ICONS.sliders}</button>
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
      navOpen: false,
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
      deleteBoard(btn.dataset.id);
    });
  });

  // Yeni board
  container.querySelector('#add-board-btn').addEventListener('click', () => setState({ newBoardModal: true, navOpen: false }));

  // Profil
  container.querySelector('#sidebar-user-btn').addEventListener('click', () => setState({ profileOpen: true, navOpen: false }));

  // Ayarlar (tema)
  closeSettings(); // sidebar yeniden çizildiyse eski çapaya bağlı popover kalmasın
  const settingsBtn = container.querySelector('#sidebar-settings-btn');
  settingsBtn.addEventListener('click', e => { e.stopPropagation(); openSettings(settingsBtn); });
}
