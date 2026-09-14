// ============================================================
// BOARD — Kanban board (topbar + listeler + kartlar + DnD)
// ============================================================
// Render kuralı: yazma sırasında ASLA setState çağrılmaz. Input'lar
// "uncontrolled" — değerleri yalnızca submit/commit anında DOM'dan
// okunur. Böylece re-render yalnızca ayrık eylemlerde olur ve hiçbir
// zaman aktif yazımı bölmez (focus korunur).
// ============================================================
import { state, setState, moveCard, getActiveBoard, getActiveLists, setActiveLists } from './state.js';
import { getCardView, escHtml, newId, boardMembers, collectImages, restoreImages, compactQuery, ICONS } from './helpers.js';

const PLUS16 = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const EDIT_ICON = ICONS.edit13;
const TRASH_ICON = ICONS.trash13;

// ---- Sürükle-bırak ----
// Sürükleme durumu bilerek state'te DEĞİL: her dragenter'da tüm uygulamayı
// yeniden çizmek sürüklenen elementi DOM'dan siliyor, tarayıcı da bu yüzden
// dragend göndermeyip kartı "sürükleniyor" halinde bırakabiliyordu.
// Gösterge tek bir element olarak DOM'da taşınır.
let dragCardId = null;
let dropTarget = null;   // { listId, beforeCardId }
const dropIndicator = document.createElement('div');
dropIndicator.className = 'drop-indicator';

function endDrag() {
  document.body.classList.remove('is-dragging-card');
  document.querySelector('.card.dragging')?.classList.remove('dragging');
  dropIndicator.remove();
  dragCardId = null;
  dropTarget = null;
}

// Liste dışına çıkınca göstergeyi gizle (bırakılırsa hiçbir şey olmasın)
document.addEventListener('dragover', e => {
  if (dragCardId && !e.target.closest?.('.list')) { dropIndicator.remove(); dropTarget = null; }
});

export function renderBoard(container) {
  renderTopbar(container.querySelector('#topbar'));

  const emptyEl = container.querySelector('#empty-state');
  const boardEl = container.querySelector('#board-area');

  if (!getActiveBoard()) {
    emptyEl.classList.remove('hidden');
    boardEl.classList.add('hidden');
    renderEmptyState(emptyEl, 'no-board');
    return;
  }

  // Aktif board'un hiç listesi yoksa (yeni board) empty state göster —
  // ama kullanıcı "liste ekle" formunu açtıysa board alanına geç
  const isEmpty = getActiveLists().length === 0 && !state.addingList;

  if (isEmpty) {
    emptyEl.classList.remove('hidden');
    boardEl.classList.add('hidden');
    renderEmptyState(emptyEl, 'no-lists');
    return;
  }

  emptyEl.classList.add('hidden');
  boardEl.classList.remove('hidden');
  renderBoardArea(boardEl);
}

// ---- Topbar ----
function renderTopbar(topbar) {
  const active = getActiveBoard();
  const title = active ? active.name : 'Board yok';

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
      .addEventListener('click', () => (compactQuery.matches
        ? setState({ navOpen: !state.navOpen })
        : setState({ sideExpanded: !state.sideExpanded })));

  } else {
    // Başlığı aktif board'a göre güncelle
    const titleEl = topbar.querySelector('#board-title');
    if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
    // Arama kutusu odakta değilse senkronla
    const inp = topbar.querySelector('#search-input');
    if (inp && document.activeElement !== inp && inp.value !== state.search) inp.value = state.search;
  }
  renderTopbarMembers(topbar.querySelector('#members-row'), active);
}

/** Board üyeleri (en fazla 5 avatar + fazlası) */
function renderTopbarMembers(row, board) {
  const members = boardMembers(board);
  const key = members.map(m => m.id).join(',');
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  const shown = members.slice(0, 5);
  row.innerHTML = shown.map(p =>
    `<span class="member-avatar" style="background:${p.color}" title="${escHtml(p.name)}">${escHtml(p.initials)}</span>`
  ).join('') + (members.length > shown.length ? `<span class="member-overflow">+${members.length - shown.length}</span>` : '');
  row.title = members.map(m => m.name).join(', ');
}

// ---- Empty state ----
function renderEmptyState(el, variant) {
  if (el.__variant === variant) return;
  el.__variant = variant;

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
      <button class="btn-secondary">Şablondan başla</button>
    </div>
  `;
  el.querySelector('#empty-create-btn').addEventListener('click', () => setState({ addingList: true }));
}

// ---- Board area (tam re-render — yazım sırasında tetiklenmez) ----
function renderBoardArea(boardEl) {
  const q = (state.search || '').trim().toLowerCase();

  // Tam re-render yatay/dikey scroll'u sıfırlamasın
  const { scrollLeft, scrollTop } = boardEl;
  // Sürükleme sürerken (ör. başka bir sebeple render) kaynak kart gidiyor
  if (dragCardId) endDrag();

  const oldImages = collectImages(boardEl);
  boardEl.innerHTML = '';

  getActiveLists().forEach(list => {
    const cards = list.cards
      .filter(c => !q || c.title.toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q))
      .map(c => {
        const v = getCardView(c, list.id);
        v.editing = state.editingCardId === c.id;
        return v;
      });

    const isAddingCard = state.addingCardFor === list.id;
    // Kart araya ekleniyorsa form o kartın üstünde, değilse listenin sonunda açılır
    // (hedef kart aramayla gizlenmişse de sona düşer)
    const inlineBeforeId = isAddingCard && cards.some(c => c.id === state.addingCardBefore)
      ? state.addingCardBefore
      : null;
    const footerForm = isAddingCard && !inlineBeforeId;

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
        ${cards.map((c, i) => (c.id === inlineBeforeId
          ? buildAddCardFormHTML(c.id)
          : buildInserterHTML(c.id, i === 0)) + buildCardHTML(c)).join('')}
      </div>
      <div class="list-footer">${footerForm ? buildAddCardFormHTML(null) : buildFooterHTML(list)}</div>
    `;
    boardEl.appendChild(section);

    attachListHeaderEvents(section, list, isEditingList);
    attachCardEvents(section, list);
    attachAddCardEvents(section, list);
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

  restoreImages(boardEl, oldImages);
  boardEl.scrollLeft = scrollLeft;
  boardEl.scrollTop = scrollTop;
}

// ---- HTML builder'ları ----
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

/** Kartın üstündeki ince "—— + ——" çizgisi: tıklanınca oraya kart ekler */
function buildInserterHTML(beforeCardId, isTop) {
  return `
    <button type="button" class="card-inserter ${isTop ? 'is-top' : ''}" data-before-id="${escHtml(beforeCardId)}" title="Buraya kart ekle" aria-label="Buraya kart ekle">
      <span class="card-inserter-plus">${PLUS16}</span>
    </button>
  `;
}

function buildFooterHTML(list) {
  return `<button class="add-card-btn" data-list-id="${list.id}">${PLUS16} Kart Ekle</button>`;
}

function buildCardHTML(card) {
  const coverHTML = card.hasCover
    ? `<div class="card-cover">${card.cover ? `<img src="${escHtml(card.cover)}" alt="">` : ''}</div>`
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

  const colorStrip = card.color ? `<div class="card-color-strip" style="background:${card.color}"></div>` : '';
  const titleHTML = card.editing
    ? `<input class="card-title-input" value="${escHtml(card.title)}">`
    : `<div class="card-title">${escHtml(card.title)}</div>`;

  return `
    <div class="card" draggable="${card.editing ? 'false' : 'true'}" data-card-id="${card.id}" data-list-id="${card.listId}">
      ${colorStrip}
      ${coverHTML}
      <div class="card-body">
        <div class="card-title-row">
          ${titleHTML}
          <button class="card-qa-btn card-menu-btn" title="Kart menüsü">${ICONS.dots}</button>
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
    const isEditing = state.editingCardId === cardId;

    // Inline isim düzenleme
    if (isEditing) {
      const inp = cardEl.querySelector('.card-title-input');
      inp?.focus();
      inp?.select();
      const commit = () => {
        const name = (inp.value || '').trim();
        if (name) renameCard(cardId, name);
        else setState({ editingCardId: null });
      };
      inp?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') setState({ editingCardId: null });
      });
      inp?.addEventListener('blur', commit);
      inp?.addEventListener('click', e => e.stopPropagation());
      return; // düzenleme modunda diğer event'leri bağlama
    }

    cardEl.addEventListener('click', e => {
      if (e.target.closest('.card-qa-btn')) return;
      setState({ openCardId: cardId });
    });

    // 3-nokta menüsü: isim değiştir / renk / sil
    cardEl.querySelector('.card-menu-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      openCardMenu(e.currentTarget, cardId);
    });

    cardEl.addEventListener('dragstart', e => {
      dragCardId = cardId;
      document.body.classList.add('is-dragging-card');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cardId); } catch (_) {}
      // Sürükleme görüntüsü alındıktan sonra soluklaştır
      setTimeout(() => cardEl.classList.add('dragging'), 0);
    });
    cardEl.addEventListener('dragend', endDrag);
  });

  // Tüm liste bir bırakma alanı; konum imlecin kart ortalarına göre bulunur
  section.addEventListener('dragover', e => {
    if (!dragCardId) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}

    const container = section.querySelector('.list-cards');
    const next = [...container.querySelectorAll('.card')]
      .filter(el => el.dataset.cardId !== dragCardId)
      .find(el => {
        const r = el.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
    const beforeCardId = next ? next.dataset.cardId : null;

    if (dropTarget && dropTarget.listId === list.id && dropTarget.beforeCardId === beforeCardId && dropIndicator.isConnected) return;
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
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAddCard(list.id, beforeId, ta); }
      if (e.key === 'Escape') close();
    });
    form.querySelector('.submit-card-btn').addEventListener('click', () => submitAddCard(list.id, beforeId, ta));
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

// ---- Mutasyonlar ----
function deleteCard(cardId) {
  setActiveLists(getActiveLists().map(l => ({ ...l, cards: l.cards.filter(c => c.id !== cardId) })));
}

function renameCard(cardId, title) {
  setActiveLists(getActiveLists().map(l => ({
    ...l,
    cards: l.cards.map(c => c.id === cardId ? { ...c, title } : c),
  })));
  setState({ editingCardId: null });
}

function setCardColor(cardId, color) {
  setActiveLists(getActiveLists().map(l => ({
    ...l,
    cards: l.cards.map(c => c.id === cardId ? { ...c, color } : c),
  })));
}

// Kart "..." menüsü — transient popover (isim değiştir / renk / sil)
const CARD_COLORS = ['#360185', '#FBC02D', '#10CAB9', '#FE6ABF'];

function openCardMenu(btn, cardId) {
  const existing = document.querySelector('.list-menu-popover');
  const wasForThis = existing && existing.dataset.cardId === cardId;
  existing?.remove();
  if (wasForThis) return;

  const menu = document.createElement('div');
  menu.className = 'list-menu-popover';
  menu.dataset.cardId = cardId;
  menu.innerHTML = `
    <button class="list-menu-item" data-act="rename">${EDIT_ICON} İsmi Değiştir</button>
    <div class="card-color-row">
      ${CARD_COLORS.map(c => `<button class="card-color-swatch" data-color="${c}" style="background:${c}" title="Renk"></button>`).join('')}
      <button class="card-color-swatch none" data-color="" title="Renksiz">${ICONS.x}</button>
    </div>
    <button class="list-menu-item danger" data-act="delete">${TRASH_ICON} Kartı Sil</button>
  `;
  document.body.appendChild(menu);

  const r = btn.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6}px`;
  menu.style.left = `${Math.min(r.left, window.innerWidth - 200)}px`;

  menu.querySelector('[data-act="rename"]').addEventListener('click', () => {
    menu.remove();
    setState({ editingCardId: cardId });
  });
  menu.querySelector('[data-act="delete"]').addEventListener('click', () => {
    menu.remove();
    deleteCard(cardId);
  });
  menu.querySelectorAll('.card-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      menu.remove();
      setCardColor(cardId, sw.dataset.color || null);
    });
  });

  setTimeout(() => {
    const closeMenu = ev => {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
    };
    document.addEventListener('click', closeMenu);
  }, 0);
}

function renameList(listId, name) {
  setActiveLists(getActiveLists().map(l => l.id === listId ? { ...l, title: name } : l));
  setState({ editingListId: null });
}

function deleteList(listId) {
  setActiveLists(getActiveLists().filter(l => l.id !== listId));
  setState({ editingListId: null, addingCardFor: null });
}

function submitAddCard(listId, beforeCardId, taEl) {
  const t = (taEl?.value || '').trim();
  if (!t) return;
  const newCard = { id: newId('c'), title: t, labels: [], assignees: [], desc: '', checklist: [], comments: [], attachments: [], startAt: null, dueAt: null, dueComplete: false };
  setActiveLists(getActiveLists().map(l => {
    if (l.id !== listId) return l;
    const cards = [...l.cards];
    const idx = beforeCardId ? cards.findIndex(c => c.id === beforeCardId) : -1;
    cards.splice(idx < 0 ? cards.length : idx, 0, newCard);
    return { ...l, cards };
  }));
  setState({ addingCardFor: null, addingCardBefore: null });
}

function submitAddList(inpEl) {
  const t = (inpEl?.value || '').trim();
  if (!t) return;
  setActiveLists([...getActiveLists(), { id: newId('l'), title: t, cards: [] }]);
  setState({ addingList: false });
}
