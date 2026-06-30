// ============================================================
// BOARD — Kanban board (topbar + listeler + kartlar + DnD)
// ============================================================
// Render kuralı: yazma sırasında ASLA setState çağrılmaz. Input'lar
// "uncontrolled" — değerleri yalnızca submit/commit anında DOM'dan
// okunur. Böylece re-render yalnızca ayrık eylemlerde olur ve hiçbir
// zaman aktif yazımı bölmez (focus korunur).
// ============================================================
import { state, setState, commitDrop, getActiveBoard, getActiveLists, setActiveLists } from './state.js';
import { getCardView, escHtml, ICONS } from './helpers.js';
import { PEOPLE } from './data.js';

const PLUS16 = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const EDIT_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`;
const TRASH_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

export function renderBoard(container) {
  renderTopbar(container.querySelector('#topbar'));

  const emptyEl = container.querySelector('#empty-state');
  const boardEl = container.querySelector('#board-area');

  // Aktif board'un hiç listesi yoksa (yeni board) empty state göster —
  // ama kullanıcı "liste ekle" formunu açtıysa board alanına geç
  const isEmpty = getActiveLists().length === 0 && !state.addingList;

  if (isEmpty) {
    emptyEl.classList.remove('hidden');
    boardEl.classList.add('hidden');
    renderEmptyState(emptyEl);
    return;
  }

  emptyEl.classList.add('hidden');
  boardEl.classList.remove('hidden');
  renderBoardArea(boardEl);
}

// ---- Topbar ----
function renderTopbar(topbar) {
  const active = getActiveBoard();
  const title = active ? active.name : 'Board';

  if (!topbar.__built) {
    topbar.__built = true;
    topbar.innerHTML = `
      <div class="topbar-left">
        <button class="sidebar-toggle topbar-menu-btn" id="topbar-menu-btn" title="Menü">${ICONS.menu}</button>
        <div class="board-title-row">
          <h1 id="board-title">${escHtml(title)}</h1>
          <button class="star-btn" title="Yıldızla">${ICONS.star}</button>
        </div>
        <div class="divider-v"></div>
        <div class="members-row" id="members-row"></div>
      </div>
      <div class="topbar-right">
        <div class="search-box">
          ${ICONS.search}
          <input id="search-input" placeholder="Kart ara…" value="${escHtml(state.search)}">
        </div>
        <button class="filter-btn" title="Filtrele">${ICONS.filter}</button>
        <button class="invite-btn">${ICONS.invite} Davet Et</button>
      </div>
    `;

    // Arama: yazarken state'i bölmemek için debounce
    const searchInp = topbar.querySelector('#search-input');
    let searchTimer;
    searchInp.addEventListener('input', e => {
      clearTimeout(searchTimer);
      const val = e.target.value;
      searchTimer = setTimeout(() => setState({ search: val }), 200);
    });

    topbar.querySelector('#topbar-menu-btn')
      .addEventListener('click', () => setState({ sideExpanded: !state.sideExpanded }));

    const membersRow = topbar.querySelector('#members-row');
    [PEOPLE.ay, PEOPLE.mk, PEOPLE.sb, PEOPLE.ec].forEach(p => {
      const sp = document.createElement('span');
      sp.className = 'member-avatar';
      sp.style.background = p.color;
      sp.title = p.name;
      sp.textContent = p.initials;
      membersRow.appendChild(sp);
    });
    const overflow = document.createElement('span');
    overflow.className = 'member-overflow';
    overflow.textContent = '+3';
    membersRow.appendChild(overflow);
  } else {
    // Başlığı aktif board'a göre güncelle
    const titleEl = topbar.querySelector('#board-title');
    if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
    // Arama kutusu odakta değilse senkronla
    const inp = topbar.querySelector('#search-input');
    if (inp && document.activeElement !== inp && inp.value !== state.search) inp.value = state.search;
  }
}

// ---- Empty state ----
function renderEmptyState(el) {
  if (el.__built) return;
  el.__built = true;
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
      <button class="btn-secondary">Şablondan başla</button>
    </div>
  `;
  el.querySelector('#empty-create-btn').addEventListener('click', () => setState({ addingList: true }));
}

// ---- Board area (tam re-render — yazım sırasında tetiklenmez) ----
function renderBoardArea(boardEl) {
  const q = (state.search || '').trim().toLowerCase();
  boardEl.innerHTML = '';

  getActiveLists().forEach(list => {
    const cards = list.cards
      .filter(c => !q || c.title.toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q))
      .map(c => getCardView(c, list.id, state.drag, state.over));

    const isAddingCard = state.addingCardFor === list.id;
    const showEndIndicator = !!(state.drag && state.over && state.over.listId === list.id && !state.over.beforeCardId);

    const isEditingList = state.editingListId === list.id;

    const section = document.createElement('section');
    section.className = 'list';
    section.dataset.listId = list.id;
    section.innerHTML = `
      <div class="list-header">
        ${isEditingList
          ? `<input class="list-title-input" value="${escHtml(list.title)}">`
          : `<h3 class="list-title">${escHtml(list.title)}</h3>`}
        <span class="list-count">${list.cards.length}</span>
        <span class="list-spacer"></span>
        <button class="list-menu-btn" title="Liste menüsü">${ICONS.dots}</button>
      </div>
      <div class="list-cards" data-list-id="${list.id}">
        ${cards.map(buildCardHTML).join('')}
        ${showEndIndicator ? '<div class="drop-indicator"></div>' : ''}
      </div>
      <div class="list-footer">${buildFooterHTML(list, isAddingCard)}</div>
    `;
    boardEl.appendChild(section);

    attachListHeaderEvents(section, list, isEditingList);
    attachCardEvents(section, list);
    attachFooterEvents(section, list, isAddingCard);
  });

  // ---- Yeni Liste kolonu ----
  const addListCol = document.createElement('div');
  addListCol.className = 'add-list-col';

  if (state.addingList) {
    addListCol.innerHTML = `
      <div class="add-list-form">
        <input class="add-list-inp" placeholder="Liste başlığı…">
        <div class="add-list-actions">
          <button class="btn-add-list submit-list-btn">Liste Ekle</button>
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
    addListCol.innerHTML = `<button class="add-list-trigger" id="add-list-trigger-btn">${ICONS.plus18} Yeni Liste Ekle</button>`;
    boardEl.appendChild(addListCol);
    addListCol.querySelector('#add-list-trigger-btn').addEventListener('click', () => setState({ addingList: true }));
  }
}

// ---- HTML builder'ları ----
function buildFooterHTML(list, isAddingCard) {
  if (isAddingCard) {
    return `
      <div class="add-card-form">
        <textarea class="add-card-ta" rows="2" placeholder="Kart başlığı gir…"></textarea>
        <div class="add-card-actions">
          <button class="btn-add submit-card-btn">Ekle</button>
          <button class="btn-cancel cancel-card-btn">${ICONS.x}</button>
        </div>
      </div>
    `;
  }
  return `<button class="add-card-btn" data-list-id="${list.id}">${PLUS16} Kart Ekle</button>`;
}

function buildCardHTML(card) {
  const coverHTML = card.hasCover ? `<div class="card-cover"><img src="${card.cover}" alt=""></div>` : '';
  const labelsHTML = card.hasLabels
    ? `<div class="card-labels">${card.labels.map(lb => `<span class="label-pill" title="${escHtml(lb.name)}" style="background:${lb.color}"></span>`).join('')}</div>`
    : '';
  const dueHTML = card.hasDue ? `<span class="due-badge" style="${card.dueStyle}">${ICONS.clock} ${escHtml(card.dueLabel)}</span>` : '';
  const checkHTML = card.hasChecklist ? `<span class="checklist-badge" style="${card.checklistStyle}">${ICONS.check14} ${card.checklistLabel}</span>` : '';
  const commentHTML = card.hasComments ? `<span class="comment-badge">${ICONS.chat14} ${card.commentCount}</span>` : '';
  const attachHTML = card.hasAttach ? `<span class="attach-badge">${ICONS.attach14} ${card.attachCount}</span>` : '';
  const assigneesHTML = card.assignees.length
    ? `<div class="assignees-row">${card.assignees.map(p => `<span class="card-avatar" style="background:${p.color}" title="${escHtml(p.name)}">${p.initials}</span>`).join('')}</div>`
    : '';
  const metaHTML = card.hasMeta ? `
    <div class="card-meta">
      ${dueHTML}${card.hasDesc ? `<span class="meta-icon">${ICONS.desc15}</span>` : ''}${checkHTML}${commentHTML}${attachHTML}
      <span class="meta-spacer"></span>
      ${assigneesHTML}
    </div>` : '';

  return `
    <div class="card ${card.dragging ? 'dragging' : ''}" draggable="true" data-card-id="${card.id}" data-list-id="${card.listId}">
      ${card.showIndicator ? '<div class="drop-indicator"></div>' : ''}
      ${coverHTML}
      <div class="card-body">
        ${labelsHTML}
        <div class="card-title-row">
          <div class="card-title">${escHtml(card.title)}</div>
          <div class="card-quick-actions">
            <button class="card-qa-btn card-edit-btn" title="Düzenle">${EDIT_ICON}</button>
            <button class="card-qa-btn card-delete-btn" title="Sil">${TRASH_ICON}</button>
          </div>
        </div>
        ${metaHTML}
      </div>
    </div>
  `;
}

// ---- Liste başlığı: inline edit + "..." menüsü ----
function attachListHeaderEvents(section, list, isEditingList) {
  // Inline isim düzenleme (uncontrolled — commit on Enter/blur)
  if (isEditingList) {
    const inp = section.querySelector('.list-title-input');
    inp?.focus();
    inp?.select();
    const commit = () => {
      const name = (inp.value || '').trim();
      if (name) renameList(list.id, name);
      else setState({ editingListId: null });
    };
    inp?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') setState({ editingListId: null });
    });
    inp?.addEventListener('blur', commit);
    return;
  }

  // "..." menüsü — transient popover (state'i kirletmeden DOM'da)
  const menuBtn = section.querySelector('.list-menu-btn');
  menuBtn?.addEventListener('click', e => {
    e.stopPropagation();
    // Zaten açık bir menü varsa kapat
    const existing = document.querySelector('.list-menu-popover');
    const wasForThis = existing && existing.dataset.listId === list.id;
    existing?.remove();
    if (wasForThis) return;

    const menu = document.createElement('div');
    menu.className = 'list-menu-popover';
    menu.dataset.listId = list.id;
    menu.innerHTML = `
      <button class="list-menu-item" data-act="rename">${EDIT_ICON} İsmi Değiştir</button>
      <button class="list-menu-item danger" data-act="delete">${TRASH_ICON} Listeyi Sil</button>
    `;
    document.body.appendChild(menu);

    // Konumlandır (butonun altına)
    const r = menuBtn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.min(r.left, window.innerWidth - 190)}px`;

    menu.querySelector('[data-act="rename"]').addEventListener('click', () => {
      menu.remove();
      setState({ editingListId: list.id });
    });
    menu.querySelector('[data-act="delete"]').addEventListener('click', () => {
      menu.remove();
      deleteList(list.id);
    });

    // Dışarı tıklayınca kapat
    setTimeout(() => {
      const closeMenu = ev => {
        if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
      };
      document.addEventListener('click', closeMenu);
    }, 0);
  });
}

// ---- Event bağlama ----
function attachCardEvents(section, list) {
  section.querySelectorAll('.card').forEach(cardEl => {
    const cardId = cardEl.dataset.cardId;

    cardEl.addEventListener('click', e => {
      if (e.target.closest('.card-qa-btn')) return;
      setState({ openCardId: cardId, mobileMenuOpen: false });
    });

    cardEl.querySelector('.card-edit-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      setState({ openCardId: cardId });
    });

    cardEl.querySelector('.card-delete-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      deleteCard(cardId);
    });

    cardEl.addEventListener('dragstart', e => {
      setState({ drag: { cardId, fromListId: list.id } });
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cardId); } catch (_) {}
    });
    cardEl.addEventListener('dragenter', e => {
      e.preventDefault(); e.stopPropagation();
      if (!state.drag) return;
      if (!state.over || state.over.listId !== list.id || state.over.beforeCardId !== cardId) {
        setState({ over: { listId: list.id, beforeCardId: cardId } });
      }
    });
    cardEl.addEventListener('dragend', () => setState({ drag: null, over: null }));
  });

  const cardsContainer = section.querySelector('.list-cards');
  cardsContainer.addEventListener('dragover', e => {
    if (state.drag) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (_) {} }
  });
  cardsContainer.addEventListener('dragenter', () => {
    if (!state.drag) return;
    if (!state.over || state.over.listId !== list.id) setState({ over: { listId: list.id, beforeCardId: null } });
  });
  cardsContainer.addEventListener('drop', e => { e.preventDefault(); commitDrop(); });
}

function attachFooterEvents(section, list, isAddingCard) {
  if (isAddingCard) {
    const ta = section.querySelector('.add-card-ta');
    ta?.focus();
    ta?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAddCard(list.id, ta); }
      if (e.key === 'Escape') setState({ addingCardFor: null });
    });
    section.querySelector('.submit-card-btn')?.addEventListener('click', () => submitAddCard(list.id, ta));
    section.querySelector('.cancel-card-btn')?.addEventListener('click', () => setState({ addingCardFor: null }));
  } else {
    section.querySelector('.add-card-btn')?.addEventListener('click', e => {
      setState({ addingCardFor: e.currentTarget.dataset.listId });
    });
  }
}

// ---- Mutasyonlar ----
function deleteCard(cardId) {
  setActiveLists(getActiveLists().map(l => ({ ...l, cards: l.cards.filter(c => c.id !== cardId) })));
}

function renameList(listId, name) {
  setActiveLists(getActiveLists().map(l => l.id === listId ? { ...l, title: name } : l));
  setState({ editingListId: null });
}

function deleteList(listId) {
  setActiveLists(getActiveLists().filter(l => l.id !== listId));
  setState({ editingListId: null, addingCardFor: null });
}

function submitAddCard(listId, taEl) {
  const t = (taEl?.value || '').trim();
  if (!t) return;
  const newCard = { id: 'c' + Date.now(), title: t, labels: [], assignees: [], desc: '', checklist: [], comments: [], attachments: [], due: null };
  setActiveLists(getActiveLists().map(l => l.id === listId ? { ...l, cards: [...l.cards, newCard] } : l));
  setState({ addingCardFor: null });
}

function submitAddList(inpEl) {
  const t = (inpEl?.value || '').trim();
  if (!t) return;
  setActiveLists([...getActiveLists(), { id: 'l' + Date.now(), title: t, cards: [] }]);
  setState({ addingList: false });
}
