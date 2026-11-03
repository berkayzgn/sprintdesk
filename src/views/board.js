/**
 * Kanban board: üst çubuk, listeler, kartlar ve sürükle-bırak.
 * Input'lar uncontrolled: yazarken setState çağrılmaz, değer commit anında DOM'dan okunur.
 */
import { state, setState, getActiveBoard, getActiveLists } from '../core/state.js';
import {
  getCardView,
  descText,
  escHtml,
  cssColor,
  labelStyle,
  boardMembers,
  collectImages,
  restoreImages,
  captureDrafts,
  compactQuery,
  ICONS,
} from '../lib/helpers.js';
import {
  moveCard,
  createCard,
  updateCard,
  deleteCard,
  createList,
  renameList as saveListName,
  deleteList as removeList,
  canEdit,
  toggleStar,
} from '../core/store.js';
import { openMembersPopover, closeMembersPopover, refreshMembersPopover } from '../components/membersPopover.js';
import { openFilterPopover, closeFilterPopover, cardMatchesFilters, activeFilterCount } from '../components/filters.js';
import { renderListView } from './listView.js';
import { confirmDialog } from '../components/dialog.js';
import { headerActionsHTML } from './notifications.js';
import { boardSkeleton, rowsSkeleton } from '../components/skeleton.js';

const VIEW_BOARD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="14" rx="1.5"/><rect x="14" y="3" width="7" height="9" rx="1.5"/></svg>`;
const VIEW_LIST = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/></svg>`;

const STAR_FILLED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z"/></svg>`;

const PLUS16 = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const CHECK12 = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const EDIT_ICON = ICONS.edit13;
const TRASH_ICON = ICONS.trash13;

const CARD_COLORS = ['#360185', '#FBC02D', '#10CAB9', '#FE6ABF'];
const MAX_TOPBAR_AVATARS = 5;
const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_BLUR_DELAY_MS = 120;
const MENU_OFFSET_PX = 6;
const LIST_MENU_WIDTH = 190;
const CARD_MENU_WIDTH = 200;

// innerHTML temizlenirken Chrome odaktaki input için blur gönderir; bu blur kaydet isteği değildir.
let rebuilding = false;

// Sürükleme durumu bilerek state'te değil: re-render sürüklenen kartı DOM'dan siler ve dragend hiç gelmez.
let dragCardId = null;
let dropTarget = null; // { listId, beforeCardId }
const dropIndicator = document.createElement('div');
dropIndicator.className = 'drop-indicator';

function endDrag() {
  document.body.classList.remove('is-dragging-card');
  document.querySelector('.card.dragging')?.classList.remove('dragging');
  dropIndicator.remove();
  dragCardId = null;
  dropTarget = null;
}

// Liste dışına çıkınca göstergeyi gizle; orada bırakılırsa hiçbir şey olmaz
document.addEventListener('dragover', e => {
  if (dragCardId && !e.target.closest?.('.list')) {
    dropIndicator.remove();
    dropTarget = null;
  }
});

export function renderBoard(container) {
  renderTopbar(container.querySelector('#topbar'));

  const emptyEl = container.querySelector('#empty-state');
  const boardEl = container.querySelector('#board-area');

  // Board listesi ya da aktif board'un içeriği henüz yüklenmedi
  if (!state.boardsLoaded || (getActiveBoard() && !state.listsByBoard[state.activeBoardId])) {
    emptyEl.classList.remove('hidden');
    boardEl.classList.add('hidden');
    renderEmptyState(emptyEl, 'loading');
    return;
  }

  if (!getActiveBoard()) {
    emptyEl.classList.remove('hidden');
    boardEl.classList.add('hidden');
    renderEmptyState(emptyEl, 'no-board');
    return;
  }

  // "Liste ekle" formu açıksa boş board'da da board alanı gösterilir
  const isEmpty = getActiveLists().length === 0 && !state.addingList;

  if (isEmpty) {
    emptyEl.classList.remove('hidden');
    boardEl.classList.add('hidden');
    renderEmptyState(emptyEl, canEdit() ? 'no-lists' : 'no-lists-readonly');
    return;
  }

  emptyEl.classList.add('hidden');
  boardEl.classList.remove('hidden');
  const listMode = state.viewMode === 'list';
  boardEl.classList.toggle('is-list-view', listMode);
  if (listMode) {
    renderListView(boardEl);
    return;
  }
  boardEl.onclick = boardEl.onkeydown = boardEl.onchange = null;
  renderBoardArea(boardEl);
}

function renderTopbar(topbar) {
  const active = getActiveBoard();
  const title = active ? active.name : 'Board yok';

  if (!topbar.__built) {
    topbar.__built = true;
    topbar.innerHTML = `
      <div class="topbar-left">
        <button class="topbar-menu-btn" id="topbar-menu-btn"></button>
        <div class="board-title-row">
          <h1 id="board-title">${escHtml(title)}</h1>
          <button class="star-btn" id="star-btn" title="Yıldızla" aria-pressed="false">${ICONS.star}</button>
          <span class="readonly-badge hidden" id="readonly-badge" title="Bu board'da izleyici rolündesin">Sadece görüntüleme</span>
        </div>
        <div class="divider-v"></div>
        <button type="button" class="members-row" id="members-row" title="Üyeler"></button>
        <button class="invite-btn" id="members-btn" title="Üyeler ve davet" aria-label="Üyeler ve davet">${ICONS.userPlus}</button>
      </div>
      <div class="topbar-right">
        <div class="view-switch" id="view-switch" role="radiogroup" aria-label="Görünüm">
          <button type="button" class="view-option" data-view="board" role="radio" title="Pano görünümü (Kanban)">${VIEW_BOARD}<span>Pano</span></button>
          <button type="button" class="view-option" data-view="list" role="radio" title="Liste görünümü (tablo)">${VIEW_LIST}<span>Liste</span></button>
        </div>
        <button type="button" class="filter-btn" id="filter-btn" title="Filtrele" aria-label="Filtrele">
          ${ICONS.filter}<span class="filter-btn-label">Filtre</span><span class="filter-count hidden" id="filter-count"></span>
        </button>
        <div class="search-box" id="search-box">
          <button type="button" class="search-toggle" id="search-toggle" title="Kart ara" aria-label="Kart ara">${ICONS.search}</button>
          <input id="search-input" placeholder="Kart ara…" value="${escHtml(state.search)}" aria-label="Kart ara">
          <button type="button" class="search-close" id="search-close" title="Aramayı kapat" aria-label="Aramayı kapat">${ICONS.x}</button>
        </div>
        ${headerActionsHTML()}
      </div>
    `;

    // Arama açıkken üst çubuktaki diğer butonlar gizlenir
    const searchInp = topbar.querySelector('#search-input');
    const openSearch = () => {
      topbar.classList.add('is-searching');
      searchInp.focus();
    };
    const closeSearch = () => {
      topbar.classList.remove('is-searching');
      if (searchInp.value) {
        searchInp.value = '';
        setState({ search: '' });
      }
    };
    topbar.querySelector('#search-toggle').addEventListener('click', openSearch);
    topbar.querySelector('#search-close').addEventListener('click', closeSearch);
    searchInp.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
        searchInp.blur();
      }
    });
    // Boşken odak kaybında kapanır; yazılı aramada açık kalır
    searchInp.addEventListener('blur', () =>
      setTimeout(() => {
        if (!searchInp.value && !topbar.querySelector('#search-box').contains(document.activeElement))
          topbar.classList.remove('is-searching');
      }, SEARCH_BLUR_DELAY_MS),
    );
    let searchTimer;
    searchInp.addEventListener('input', e => {
      clearTimeout(searchTimer);
      const val = e.target.value;
      searchTimer = setTimeout(() => setState({ search: val }), SEARCH_DEBOUNCE_MS);
    });

    const openMembers = e => {
      e.stopPropagation();
      if (state.activeBoardId) openMembersPopover(topbar.querySelector('#members-btn'), state.activeBoardId);
    };
    topbar.querySelector('#members-btn').addEventListener('click', openMembers);
    topbar.querySelector('#members-row').addEventListener('click', openMembers);
    topbar.querySelector('#view-switch').addEventListener('click', e => {
      const opt = e.target.closest('.view-option');
      if (opt && opt.dataset.view !== state.viewMode)
        setState({ viewMode: opt.dataset.view, addingCardFor: null, editingCardId: null });
    });
    topbar.querySelector('#filter-btn').addEventListener('click', e => {
      e.stopPropagation();
      openFilterPopover(e.currentTarget);
    });
    topbar.querySelector('#star-btn').addEventListener('click', () => {
      if (state.activeBoardId) toggleStar(state.activeBoardId);
    });

    topbar.querySelector('#topbar-menu-btn').addEventListener('click', () => {
      if (compactQuery.matches) setState({ navOpen: !state.navOpen });
      else setState({ sideExpanded: !state.sideExpanded });
    });
  } else {
    const titleEl = topbar.querySelector('#board-title');
    if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
    // Odaktaki arama kutusunun değeri ezilmez
    const inp = topbar.querySelector('#search-input');
    if (inp && document.activeElement !== inp && inp.value !== state.search) inp.value = state.search;
    if (state.search) topbar.classList.add('is-searching');
  }
  renderTopbarMembers(topbar.querySelector('#members-row'), active);
  syncMenuButton(topbar.querySelector('#topbar-menu-btn'));

  // Board değişince önceki board'un popover'ları kapanır
  if (topbar.__boardId !== state.activeBoardId) {
    topbar.__boardId = state.activeBoardId;
    closeMembersPopover();
    closeFilterPopover();
  }
  refreshMembersPopover();

  for (const id of ['#star-btn', '#members-btn', '#filter-btn', '#view-switch'])
    topbar.querySelector(id).classList.toggle('hidden', !active);
  topbar.querySelectorAll('.view-option').forEach(b => {
    const on = b.dataset.view === (state.viewMode === 'list' ? 'list' : 'board');
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  const star = topbar.querySelector('#star-btn');
  const starred = !!active?.starred;
  if (star.getAttribute('aria-pressed') !== String(starred)) {
    star.setAttribute('aria-pressed', String(starred));
    star.classList.toggle('is-starred', starred);
    star.innerHTML = starred ? STAR_FILLED : ICONS.star;
    star.title = starred ? 'Yıldızı kaldır' : 'Yıldızla';
  }
  topbar.querySelector('#readonly-badge').classList.toggle('hidden', !active || canEdit(active));

  const count = activeFilterCount();
  const countEl = topbar.querySelector('#filter-count');
  countEl.textContent = count || '';
  countEl.classList.toggle('hidden', !count);
  topbar.querySelector('#filter-btn').classList.toggle('is-active', count > 0);
}

/** Masaüstünde sidebar'ı daraltır/genişletir, dar ekranda çekmeceyi açar */
function syncMenuButton(btn) {
  const compact = compactQuery.matches;
  const label = compact ? 'Menü' : state.sideExpanded ? 'Kenar çubuğunu daralt' : 'Kenar çubuğunu genişlet';
  const mode = compact ? 'menu' : 'panel';
  if (btn.dataset.mode !== mode) {
    btn.dataset.mode = mode;
    btn.innerHTML = ICONS[mode];
  }
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', String(compact ? !!state.navOpen : !!state.sideExpanded));
}

function renderTopbarMembers(row, board) {
  const members = boardMembers(board);
  const key = members.map(m => m.id).join(',');
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  const shown = members.slice(0, MAX_TOPBAR_AVATARS);
  row.innerHTML =
    shown
      .map(
        p =>
          `<span class="member-avatar" data-user-id="${escHtml(p.id)}" style="background:${cssColor(p.color)}" title="${escHtml(p.name)}">${escHtml(p.initials)}</span>`,
      )
      .join('') +
    (members.length > shown.length ? `<span class="member-overflow">+${members.length - shown.length}</span>` : '');
  row.title = members.map(m => m.name).join(', ');
}

function renderEmptyState(el, variant) {
  const key = variant === 'loading' ? `loading-${state.viewMode}` : variant;
  if (el.__variant === key) return;
  el.__variant = key;
  el.classList.toggle('is-loading', variant === 'loading');

  if (variant === 'loading') {
    el.innerHTML = state.viewMode === 'list' ? `<div class="skel-lv">${rowsSkeleton(6)}</div>` : boardSkeleton();
    return;
  }

  if (variant === 'no-lists-readonly') {
    el.innerHTML = `
      <h2 class="empty-title">Bu board henüz boş</h2>
      <p class="empty-desc">Bu board'da izleyici rolündesin; listeler eklendiğinde burada görünecek.</p>
    `;
    return;
  }

  if (variant === 'no-board') {
    el.innerHTML = `
      <h2 class="empty-title">Henüz bir board yok</h2>
      <p class="empty-desc">Yeni bir board oluşturarak başla.</p>
      <div class="empty-actions">
        <button class="btn-primary" id="empty-create-board-btn">${ICONS.plus18} Board oluştur</button>
      </div>
    `;
    el.querySelector('#empty-create-board-btn').addEventListener('click', () => setState({ newBoardModal: true }));
    return;
  }

  el.innerHTML = `
    <div class="empty-illustration">
      <div class="empty-col"><div class="empty-card" style="height:30px"></div><div class="empty-card" style="height:42px"></div></div>
      <div class="empty-col"><div class="empty-card" style="height:42px"></div></div>
      <div class="empty-col-add">${ICONS.plus18}</div>
    </div>
    <h2 class="empty-title">Bu board henüz boş</h2>
    <p class="empty-desc">İlk listeni oluşturarak işleri organize etmeye başla.</p>
    <div class="empty-actions">
      <button class="btn-primary" id="empty-create-btn">${ICONS.plus18} İlk listeni oluştur</button>
    </div>
  `;
  el.querySelector('#empty-create-btn').addEventListener('click', () => setState({ addingList: true }));
}

/** Tam re-render; yazım sırasında tetiklenmez */
function renderBoardArea(boardEl) {
  const q = (state.search || '').trim().toLowerCase();
  const editable = canEdit();
  const filtering = !!q || activeFilterCount() > 0;
  boardEl.classList.toggle('is-readonly', !editable);

  const { scrollLeft, scrollTop } = boardEl;
  // Sürükleme sırasında gelen render kaynak kartı siler; sürüklemeyi temiz bitir
  if (dragCardId) endDrag();

  const oldImages = collectImages(boardEl);
  const restoreDrafts = captureDrafts(
    boardEl,
    '.add-card-ta, .add-list-inp, .list-title-input, .card-title-input',
    el =>
      `${el.className}|${el.closest('[data-list-id]')?.dataset.listId || ''}|${el.closest('[data-before-id]')?.dataset.beforeId || ''}|${el.closest('[data-card-id]')?.dataset.cardId || ''}`,
  );
  rebuilding = true;
  boardEl.innerHTML = '';
  rebuilding = false;

  getActiveLists().forEach(list => {
    const cards = list.cards
      .filter(
        c =>
          (!q || c.title.toLowerCase().includes(q) || descText(c.desc).toLowerCase().includes(q)) &&
          cardMatchesFilters(c),
      )
      .map(c => {
        const v = getCardView(c, list.id);
        v.editing = editable && state.editingCardId === c.id;
        v.editable = editable;
        return v;
      });

    const isAddingCard = editable && state.addingCardFor === list.id;
    // Araya eklemede form hedef kartın üstünde açılır; kart filtreyle gizliyse sona düşer
    const inlineBeforeId =
      isAddingCard && cards.some(c => c.id === state.addingCardBefore) ? state.addingCardBefore : null;
    const footerForm = isAddingCard && !inlineBeforeId;

    const isEditingList = editable && state.editingListId === list.id;

    const section = document.createElement('section');
    section.className = 'list';
    section.dataset.listId = list.id;
    section.innerHTML = `
      <div class="list-header">
        ${
          isEditingList
            ? `<input class="list-title-input" value="${escHtml(list.title)}">`
            : `<h3 class="list-title">${escHtml(list.title)}</h3>`
        }
        <span class="list-count" ${filtering ? `title="${cards.length} / ${list.cards.length} kart gösteriliyor"` : ''}>${filtering ? `${cards.length}/${list.cards.length}` : list.cards.length}</span>
        <span class="list-spacer"></span>
        ${editable ? `<button class="list-menu-btn" title="Liste menüsü">${ICONS.dots}</button>` : ''}
      </div>
      <div class="list-cards" data-list-id="${list.id}">
        ${cards
          .map(
            (c, i) =>
              (c.id === inlineBeforeId
                ? buildAddCardFormHTML(c.id)
                : editable
                  ? buildInserterHTML(c.id, i === 0)
                  : '') + buildCardHTML(c),
          )
          .join('')}
      </div>
      ${editable ? `<div class="list-footer">${footerForm ? buildAddCardFormHTML(null) : buildFooterHTML(list)}</div>` : ''}
    `;
    boardEl.appendChild(section);

    attachListHeaderEvents(section, list, isEditingList);
    attachCardEvents(section, list);
    attachAddCardEvents(section, list);
  });

  const addListCol = document.createElement('div');
  addListCol.className = 'add-list-col';

  if (!editable) {
    // İzleyici liste ekleyemez
  } else if (state.addingList) {
    addListCol.innerHTML = `
      <div class="add-list-form">
        <input class="add-list-inp" placeholder="Liste başlığı…">
        <div class="add-list-actions">
          <button class="btn-add-list submit-list-btn">Liste ekle</button>
          <button class="btn-cancel cancel-list-btn">${ICONS.x}</button>
        </div>
      </div>
    `;
    boardEl.appendChild(addListCol);
    const inp = addListCol.querySelector('.add-list-inp');
    inp.focus();
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitAddList(inp);
      if (e.key === 'Escape') setState({ addingList: false });
    });
    addListCol.querySelector('.submit-list-btn').addEventListener('click', () => submitAddList(inp));
    addListCol.querySelector('.cancel-list-btn').addEventListener('click', () => setState({ addingList: false }));
  } else {
    addListCol.innerHTML = `<button class="add-list-trigger" id="add-list-trigger-btn">${ICONS.plus18} Yeni liste ekle</button>`;
    boardEl.appendChild(addListCol);
    addListCol.querySelector('#add-list-trigger-btn').addEventListener('click', () => setState({ addingList: true }));
  }

  restoreImages(boardEl, oldImages);
  restoreDrafts();
  boardEl.scrollLeft = scrollLeft;
  boardEl.scrollTop = scrollTop;
}

function buildAddCardFormHTML(beforeCardId) {
  return `
    <div class="add-card-form ${beforeCardId ? 'is-inline' : ''}" data-before-id="${beforeCardId ? escHtml(beforeCardId) : ''}">
      <textarea class="add-card-ta" rows="2" placeholder="Kart başlığı gir…"></textarea>
      <div class="add-card-actions">
        <button class="btn-add submit-card-btn">Ekle</button>
        <button class="btn-cancel cancel-card-btn">${ICONS.x}</button>
      </div>
    </div>
  `;
}

/** Kartın üstündeki ince "+" çizgisi; tıklanınca o noktaya kart eklenir */
function buildInserterHTML(beforeCardId, isTop) {
  return `
    <button type="button" class="card-inserter ${isTop ? 'is-top' : ''}" data-before-id="${escHtml(beforeCardId)}" title="Buraya kart ekle" aria-label="Buraya kart ekle">
      <span class="card-inserter-plus">${PLUS16}</span>
    </button>
  `;
}

function buildFooterHTML(list) {
  return `<button class="add-card-btn" data-list-id="${list.id}">${PLUS16} Kart ekle</button>`;
}

function buildCardHTML(card) {
  const coverHTML = card.hasCover
    ? `<div class="card-cover">${card.cover ? `<img src="${escHtml(card.cover)}" alt="">` : ''}</div>`
    : '';
  const dueHTML = card.hasDue
    ? `<span class="due-badge" style="${card.dueStyle}">${ICONS.clock} ${escHtml(card.dueLabel)}</span>`
    : '';
  const checkHTML = card.hasChecklist
    ? `<span class="checklist-badge" style="${card.checklistStyle}">${ICONS.check14} ${card.checklistLabel}</span>`
    : '';
  const commentHTML = card.hasComments ? `<span class="comment-badge">${ICONS.chat14} ${card.commentCount}</span>` : '';
  const attachHTML = card.hasAttach ? `<span class="attach-badge">${ICONS.attach14} ${card.attachCount}</span>` : '';
  const assigneesHTML = card.assignees.length
    ? `<div class="assignees-row">${card.assignees.map(p => `<span class="card-avatar" data-user-id="${escHtml(p.id)}" style="background:${cssColor(p.color)}" title="${escHtml(p.name)}">${escHtml(p.initials)}</span>`).join('')}</div>`
    : '';
  const metaHTML = card.hasMeta
    ? `
    <div class="card-meta">
      ${dueHTML}${card.hasDesc ? `<span class="meta-icon">${ICONS.desc15}</span>` : ''}${checkHTML}${commentHTML}${attachHTML}
      <span class="meta-spacer"></span>
      ${assigneesHTML}
    </div>`
    : '';

  const colorStrip = card.color
    ? `<div class="card-color-strip" style="background:${cssColor(card.color)}"></div>`
    : '';
  const labelsHTML = card.hasLabels
    ? `<div class="card-labels">${card.labels.map(l => `<span class="card-label ${l.name ? '' : 'is-empty'}" style="${labelStyle(l.color)}" title="${escHtml(l.name)}">${escHtml(l.name)}</span>`).join('')}</div>`
    : '';
  const titleHTML = card.editing
    ? `<input class="card-title-input" value="${escHtml(card.title)}">`
    : `<div class="card-title">${escHtml(card.title)}</div>`;

  // İzleyici tiki yalnızca tamamlanmış kartlarda, salt okunur görür
  const completeLabel = card.completed ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle';
  const completeHTML = card.editable
    ? `<button type="button" class="card-complete-btn ${card.completed ? 'is-done' : ''}" aria-pressed="${card.completed}" title="${completeLabel}" aria-label="${completeLabel}">${CHECK12}</button>`
    : card.completed
      ? `<span class="card-complete-btn is-done" title="Tamamlandı">${CHECK12}</span>`
      : '';

  return `
    <div class="card ${card.completed ? 'is-completed' : ''}" draggable="${card.editable && !card.editing ? 'true' : 'false'}" data-card-id="${card.id}" data-list-id="${card.listId}">
      ${colorStrip}
      ${coverHTML}
      <div class="card-body">
        ${labelsHTML}
        <div class="card-title-row">
          ${card.editing ? '' : completeHTML}
          ${titleHTML}
          ${card.editable ? `<button class="card-qa-btn card-menu-btn" title="Kart menüsü">${ICONS.dots}</button>` : ''}
        </div>
        ${metaHTML}
      </div>
    </div>
  `;
}

/** Satır içi isim düzenleme: Enter/blur kaydeder, Esc vazgeçer */
function bindInlineRename(inp, { original, save, cancel }) {
  inp.focus();
  inp.select();
  // Input DOM'dan kalkarken gelen blur ikinci kez kaydetmesin
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const name = (inp.value || '').trim();
    if (name && name !== original) save(name);
    else cancel();
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      committed = true;
      cancel();
    }
  });
  inp.addEventListener('blur', () => {
    if (!rebuilding) commit();
  });
}

/**
 * Butonun altında geçici "..." menüsü açar (state'e yazılmaz). Aynı sahibin
 * menüsü zaten açıksa kapatır ve null döner. Dışarı tıklanınca kapanır.
 */
function openPopoverMenu(anchor, { ownerKey, ownerId, html, width }) {
  const existing = document.querySelector('.list-menu-popover');
  const wasForThis = existing && existing.dataset[ownerKey] === ownerId;
  existing?.remove();
  if (wasForThis) return null;

  const menu = document.createElement('div');
  menu.className = 'list-menu-popover';
  menu.dataset[ownerKey] = ownerId;
  menu.innerHTML = html;
  document.body.appendChild(menu);

  const r = anchor.getBoundingClientRect();
  menu.style.top = `${r.bottom + MENU_OFFSET_PX}px`;
  menu.style.left = `${Math.min(r.left, window.innerWidth - width)}px`;

  // Açan tıklama bu dinleyiciye ulaşmasın diye bir tur ertelenir
  setTimeout(() => {
    const closeMenu = ev => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    document.addEventListener('click', closeMenu);
  }, 0);
  return menu;
}

function attachListHeaderEvents(section, list, isEditingList) {
  if (isEditingList) {
    const inp = section.querySelector('.list-title-input');
    if (inp) {
      bindInlineRename(inp, {
        original: list.title,
        save: name => renameList(list.id, name),
        cancel: () => setState({ editingListId: null }),
      });
    }
    return;
  }

  const menuBtn = section.querySelector('.list-menu-btn');
  menuBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const menu = openPopoverMenu(menuBtn, {
      ownerKey: 'listId',
      ownerId: list.id,
      width: LIST_MENU_WIDTH,
      html: `
        <button class="list-menu-item" data-act="rename">${EDIT_ICON} Yeniden adlandır</button>
        <button class="list-menu-item danger" data-act="delete">${TRASH_ICON} Listeyi sil</button>
      `,
    });
    if (!menu) return;

    menu.querySelector('[data-act="rename"]').addEventListener('click', () => {
      menu.remove();
      setState({ editingListId: list.id });
    });
    menu.querySelector('[data-act="delete"]').addEventListener('click', () => {
      menu.remove();
      deleteList(list.id);
    });
  });
}

function attachCardEvents(section, list) {
  section.querySelectorAll('.card').forEach(cardEl => {
    const cardId = cardEl.dataset.cardId;

    if (state.editingCardId === cardId) {
      const inp = cardEl.querySelector('.card-title-input');
      if (inp) {
        bindInlineRename(inp, {
          original: inp.defaultValue,
          save: name => renameCard(cardId, name),
          cancel: () => setState({ editingCardId: null }),
        });
        inp.addEventListener('click', e => e.stopPropagation());
      }
      return;
    }

    cardEl.querySelector('button.card-complete-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const card = list.cards.find(c => c.id === cardId);
      if (card) updateCard(cardId, { dueComplete: !card.dueComplete });
    });

    cardEl.addEventListener('click', e => {
      if (e.target.closest('.card-qa-btn, .card-complete-btn')) return;
      setState({ openCardId: cardId });
    });

    cardEl.querySelector('.card-menu-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      openCardMenu(e.currentTarget, cardId);
    });

    cardEl.addEventListener('dragstart', e => {
      dragCardId = cardId;
      document.body.classList.add('is-dragging-card');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cardId);
      } catch (_) {}
      // Tarayıcı sürükleme görüntüsünü aldıktan sonra soluklaştır
      setTimeout(() => cardEl.classList.add('dragging'), 0);
    });
    cardEl.addEventListener('dragend', endDrag);
  });

  // Tüm liste bırakma alanıdır; konum imlecin kart ortalarına göre bulunur
  section.addEventListener('dragover', e => {
    if (!dragCardId) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch (_) {}

    const container = section.querySelector('.list-cards');
    const next = [...container.querySelectorAll('.card')]
      .filter(el => el.dataset.cardId !== dragCardId)
      .find(el => {
        const r = el.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
    const beforeCardId = next ? next.dataset.cardId : null;

    if (
      dropTarget &&
      dropTarget.listId === list.id &&
      dropTarget.beforeCardId === beforeCardId &&
      dropIndicator.isConnected
    )
      return;
    dropTarget = { listId: list.id, beforeCardId };
    container.insertBefore(dropIndicator, next || null);
  });

  section.addEventListener('drop', e => {
    if (!dragCardId) return;
    e.preventDefault();
    const cardId = dragCardId;
    const target = dropTarget;
    endDrag();
    if (target) moveCard(cardId, target.listId, target.beforeCardId);
  });
}

function attachAddCardEvents(section, list) {
  const form = section.querySelector('.add-card-form');
  if (form) {
    const ta = form.querySelector('.add-card-ta');
    const beforeId = form.dataset.beforeId || null;
    const close = () => setState({ addingCardFor: null, addingCardBefore: null });
    ta.focus();
    // Başlık varsa kart eklenir ve form art arda ekleme için açık kalır
    const submit = () => {
      if (!ta.value.trim()) {
        close();
        return;
      }
      submitAddCard(list.id, beforeId, ta);
    };
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    // Formun butonları odağı çalmasın; dışarı tıklamada (blur) yazılan başlık kaydedilir
    form.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) e.preventDefault();
    });
    ta.addEventListener('blur', () => {
      if (rebuilding || !ta.isConnected) return;
      // Sekme/pencere değişiminde formu koru
      if (!document.hasFocus()) return;
      const t = ta.value.trim();
      if (t) {
        setState({ addingCardFor: null, addingCardBefore: null });
        createCard(list.id, beforeId, t);
      } else {
        close();
      }
    });
    form.querySelector('.submit-card-btn').addEventListener('click', submit);
    form.querySelector('.cancel-card-btn').addEventListener('click', close);
  }

  section.querySelector('.add-card-btn')?.addEventListener('click', () => {
    setState({ addingCardFor: list.id, addingCardBefore: null });
  });
  section.querySelectorAll('.card-inserter').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setState({ addingCardFor: list.id, addingCardBefore: btn.dataset.beforeId });
    });
  });
}

function renameCard(cardId, title) {
  setState({ editingCardId: null });
  updateCard(cardId, { title });
}

function openCardMenu(btn, cardId) {
  const menu = openPopoverMenu(btn, {
    ownerKey: 'cardId',
    ownerId: cardId,
    width: CARD_MENU_WIDTH,
    html: `
      <button class="list-menu-item" data-act="rename">${EDIT_ICON} Yeniden adlandır</button>
      <div class="card-color-row">
        ${CARD_COLORS.map(c => `<button class="card-color-swatch" data-color="${c}" style="background:${c}" title="Renk"></button>`).join('')}
        <button class="card-color-swatch none" data-color="" title="Renksiz">${ICONS.x}</button>
      </div>
      <button class="list-menu-item danger" data-act="delete">${TRASH_ICON} Kartı sil</button>
    `,
  });
  if (!menu) return;

  menu.querySelector('[data-act="rename"]').addEventListener('click', () => {
    menu.remove();
    setState({ editingCardId: cardId });
  });
  menu.querySelector('[data-act="delete"]').addEventListener('click', async () => {
    menu.remove();
    const card = getActiveLists()
      .flatMap(l => l.cards)
      .find(c => c.id === cardId);
    const ok = await confirmDialog({
      title: 'Kart silinsin mi?',
      message: `"${card?.title || ''}" kartı; alt görevleri, yorumları ve dosyalarıyla birlikte silinecek.`,
      confirmText: 'Kartı sil',
      danger: true,
    });
    if (ok) deleteCard(cardId);
  });
  menu.querySelectorAll('.card-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      menu.remove();
      updateCard(cardId, { color: sw.dataset.color || null });
    });
  });
}

function renameList(listId, name) {
  setState({ editingListId: null });
  saveListName(listId, name);
}

async function deleteList(listId) {
  const list = getActiveLists().find(l => l.id === listId);
  const n = list?.cards.length || 0;
  const ok = await confirmDialog({
    title: `"${list?.title || ''}" listesi silinsin mi?`,
    message: n ? `İçindeki ${n} kart da silinecek. Bu işlem geri alınamaz.` : 'Liste silinecek.',
    confirmText: 'Listeyi sil',
    danger: true,
  });
  if (!ok) return;
  setState({ editingListId: null, addingCardFor: null });
  removeList(listId);
}

function submitAddCard(listId, beforeCardId, taEl) {
  const t = (taEl?.value || '').trim();
  if (!t) return;
  // Form açık kalır; araya eklemede sonraki kartlar da aynı noktaya eklenir
  taEl.value = '';
  createCard(listId, beforeCardId, t);
}

function submitAddList(inpEl) {
  const t = (inpEl?.value || '').trim();
  if (!t) return;
  setState({ addingList: false });
  createList(t);
}
