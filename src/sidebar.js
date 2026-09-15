// ============================================================
// SIDEBAR — Masaüstü sidebar bileşeni
// ============================================================
import { state, setState } from './state.js';
import { selectBoard, renameBoard, deleteBoard, canAdmin, isOwner } from './store.js';
import { cssColor, escHtml, compactQuery, ICONS, currentUserDisplay, captureDrafts, initialsOf, readableTextOn } from './helpers.js';
import { openSettings, closeSettings } from './settings.js';

const EDIT_ICON = ICONS.edit13;
const TRASH_ICON = ICONS.trash13;
const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
// Sol üstteki çalışma alanı: rozetteki harf her zaman bu addan türetilir
const WORKSPACE_NAME = 'KYNC';

const X_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

/** Board'un rengi üzerinde baş harfi: daraltılmış sidebar'da da hangi board olduğu anlaşılsın */
function boardTile(b) {
  const bg = cssColor(b.color);
  return `<span class="board-tile" style="background:${bg};color:${readableTextOn(bg)}" aria-hidden="true">${escHtml(initialsOf(b.name).slice(0, 1))}</span>`;
}

export function renderSidebar(container) {
  const s = state;
  const compact = compactQuery.matches;
  const expanded = compact || s.sideExpanded;
  const w = compact ? '' : (expanded ? '256px' : '64px');

  // Sidebar'ı ilgilendirmeyen state değişikliklerinde DOM'a dokunma: hem
  // gereksiz iş hem de çekmece geçiş animasyonunu bozuyor
  const key = JSON.stringify([s.boards, s.activeBoardId, s.editingBoardId, expanded, compact, s.userEmail, s.userName, s.people[s.userId]]);
  if (container.__key === key) return;
  container.__key = key;
  // Yıldızlılar üstte; kendi aralarında oluşturulma sırası korunur
  const boards = [...(s.boards || [])].sort((a, b) => Number(!!b.starred) - Number(!!a.starred));
  const me = currentUserDisplay(s);
  const activeId = s.activeBoardId;
  const editingId = s.editingBoardId;

  // Board adı düzenlenirken board listesi sunucudan yenilenirse yazılan kaybolmasın
  const restoreDrafts = captureDrafts(container, '#edit-board-inp');
  container.innerHTML = `
    <aside id="sidebar" class="${expanded ? '' : 'is-collapsed'}" style="${w ? `width:${w}` : ''}">
      <div class="sidebar-header">
        <span class="workspace-icon" aria-hidden="true">${escHtml(initialsOf(WORKSPACE_NAME).slice(0, 1))}</span>
        ${expanded ? `
          <div class="workspace-info">
            <div class="workspace-name">${escHtml(WORKSPACE_NAME)}</div>
            <div class="workspace-plan">Çalışma alanı</div>
          </div>` : ''}
      </div>

      <nav class="sidebar-nav" aria-label="Board'lar">
        ${expanded ? `<div class="sidebar-section-label">Board'lar</div>` : ''}
        <div class="sidebar-boards" id="sidebar-boards">
          ${boards.map(b => {
            const isActive = b.id === activeId;
            const isEditing = b.id === editingId;

            if (isEditing && expanded) {
              return `
                <div class="board-btn-row active-row is-editing">
                  ${boardTile(b)}
                  <input id="edit-board-inp" class="board-edit-input" value="${escHtml(b.name)}" aria-label="Board adı">
                  <button class="board-action-btn confirm-edit" data-id="${b.id}" title="Kaydet">${CHECK_ICON}</button>
                  <button class="board-action-btn cancel-edit" title="İptal">${X_ICON}</button>
                </div>
              `;
            }

            return `
              <div class="board-btn-row ${isActive ? 'active-row' : ''}">
                <button class="board-btn ${isActive ? 'active' : ''} board-select" data-id="${b.id}"
                  ${expanded ? '' : `title="${escHtml(b.name)}"`} aria-label="${escHtml(b.name)}" ${isActive ? 'aria-current="page"' : ''}>
                  ${boardTile(b)}
                  ${expanded ? `<span class="board-name">${escHtml(b.name)}</span>${b.starred ? `<span class="board-star" title="Yıldızlı" aria-label="Yıldızlı">★</span>` : ''}` : ''}
                </button>
                ${expanded && canAdmin(b) ? `
                  <div class="board-actions">
                    <button class="board-action-btn edit-board-btn" data-id="${b.id}" title="Yeniden adlandır">${EDIT_ICON}</button>
                    ${isOwner(b) ? `<button class="board-action-btn delete-board-btn" data-id="${b.id}" title="Sil">${TRASH_ICON}</button>` : ''}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <button class="add-board-btn" id="add-board-btn" ${expanded ? '' : 'title="Yeni board"'} aria-label="Yeni board">
          ${ICONS.plus}
          ${expanded ? `<span>Yeni board</span>` : ''}
        </button>
      </nav>

      <div class="sidebar-footer">
        <button class="sidebar-user-btn" id="sidebar-user-btn" title="${expanded ? 'Hesap ve profil' : escHtml(me.name)}" aria-label="Hesap ve profil">
          <span class="avatar sidebar-avatar" ${me.color ? `style="background:${cssColor(me.color)}"` : ''}>${escHtml(me.initials)}</span>
          ${expanded ? `
            <div class="user-info">
              <div class="user-name">${escHtml(me.name)}</div>
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
    btn.addEventListener('click', () => selectBoard(btn.dataset.id));
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
      const board = state.boards.find(b => b.id === confirmBtn.dataset.id);
      if (name === board?.name) { setState({ editingBoardId: null }); return; }
      renameBoard(confirmBtn.dataset.id, name);
    };
    confirmBtn.addEventListener('click', save);
    inp?.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setState({ editingBoardId: null }); });
    inp?.focus();
  }
  restoreDrafts();

  // Edit iptal
  container.querySelector('.cancel-edit')?.addEventListener('click', () => setState({ editingBoardId: null }));

  // Sil
  container.querySelectorAll('.delete-board-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const board = state.boards.find(b => b.id === btn.dataset.id);
      // Geri alınamaz: tüm listeler, kartlar ve dosyalar da silinir
      if (!window.confirm(`"${board?.name}" board'u, içindeki tüm liste, kart ve dosyalarla birlikte silinecek. Emin misin?`)) return;
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
