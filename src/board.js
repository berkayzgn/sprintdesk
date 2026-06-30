// ============================================================
// BOARD — Kanban board (listeler + kartlar + DnD)
// ============================================================
import { state, setState, commitDrop } from './state.js';
import { getCardView, ICONS } from './helpers.js';
import { PEOPLE } from './data.js';

// Extra icon
const PLUS16 = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;

export function renderBoard(container) {
  const s = state;
  const q = (s.search || '').trim().toLowerCase();

  // ---- Topbar ----
  const topbar = container.querySelector('#topbar');
  if (!topbar.__built) {
    topbar.__built = true;
    topbar.innerHTML = `
      <div class="topbar-left">
        <div class="board-title-row">
          <h1 id="board-title">Ürün Lansmanı</h1>
          <button class="star-btn" title="Yıldızla">${ICONS.star}</button>
        </div>
        <div class="divider-v"></div>
        <div class="members-row" id="members-row"></div>
      </div>
      <div class="topbar-right">
        <div class="search-box">
          ${ICONS.search}
          <input id="search-input" placeholder="Kart ara…" value="${escHtml(s.search)}">
        </div>
        <button class="filter-btn" title="Filtrele">${ICONS.filter}</button>
        <button class="invite-btn">${ICONS.invite} Davet Et</button>
      </div>
    `;

    topbar.querySelector('#search-input').addEventListener('input', e => setState({ search: e.target.value }));

    // Members
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
    // Update search input value if changed externally
    const inp = topbar.querySelector('#search-input');
    if (inp && inp.value !== s.search) inp.value = s.search;
  }

  // ---- Empty / Board ----
  const emptyEl  = container.querySelector('#empty-state');
  const boardEl  = container.querySelector('#board-area');

  if (s.showEmpty) {
    emptyEl.classList.remove('hidden');
    boardEl.classList.add('hidden');
    renderEmptyState(emptyEl);
    return;
  }

  emptyEl.classList.add('hidden');
  boardEl.classList.remove('hidden');
  renderBoardArea(boardEl, s, q);
}

function renderEmptyState(el) {
  if (el.__built) return;
  el.__built = true;
  el.innerHTML = `
    <div class="empty-illustration">
      <div class="empty-col">
        <div class="empty-card" style="height:30px"></div>
        <div class="empty-card" style="height:42px"></div>
      </div>
      <div class="empty-col">
        <div class="empty-card" style="height:42px"></div>
      </div>
      <div class="empty-col-add">
        ${ICONS.plus18}
      </div>
    </div>
    <h2 class="empty-title">Bu board henüz boş</h2>
    <p class="empty-desc">İlk listeni oluşturarak işleri organize etmeye başla. Backlog, Yapılacaklar ve Tamamlandı ile başlamak yaygın bir yöntemdir.</p>
    <div class="empty-actions">
      <button class="btn-primary" id="empty-create-btn">${ICONS.plus18} İlk listeni oluştur</button>
      <button class="btn-secondary">Şablondan başla</button>
    </div>
  `;
  el.querySelector('#empty-create-btn').addEventListener('click', () => setState({ showEmpty: false }));
}

function renderBoardArea(boardEl, s, q) {
  // We re-render the full board area on each state change for simplicity
  boardEl.innerHTML = '';

  s.lists.forEach(list => {
    const cards = list.cards
      .filter(c => !q || c.title.toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q))
      .map(c => getCardView(c, list.id, s.drag, s.over));

    const section = document.createElement('section');
    section.className = 'list';
    section.dataset.listId = list.id;

    const showEndIndicator = !!(s.drag && s.over && s.over.listId === list.id && !s.over.beforeCardId);
    const isAddingCard = s.addingCardFor === list.id;

    section.innerHTML = `
      <div class="list-header">
        <h3 class="list-title">${escHtml(list.title)}</h3>
        <span class="list-count">${list.cards.length}</span>
        <span class="list-spacer"></span>
        <button class="list-menu-btn">${ICONS.dots}</button>
      </div>
      <div class="list-cards" data-list-id="${list.id}">
        ${cards.map(card => buildCardHTML(card)).join('')}
        ${showEndIndicator ? '<div class="drop-indicator"></div>' : ''}
      </div>
      <div class="list-footer">
        ${isAddingCard ? `
          <div class="add-card-form">
            <textarea class="add-card-ta" rows="2" placeholder="Kart başlığı gir…" autofocus>${escHtml(s.newCardTitle)}</textarea>
            <div class="add-card-actions">
              <button class="btn-add submit-card-btn" data-list-id="${list.id}">Ekle</button>
              <button class="btn-cancel cancel-card-btn">${ICONS.x}</button>
            </div>
          </div>
        ` : `
          <button class="add-card-btn" data-list-id="${list.id}">
            ${PLUS16} Kart Ekle
          </button>
        `}
      </div>
    `;

    boardEl.appendChild(section);

    // ---- Card events ----
    section.querySelectorAll('.card').forEach(cardEl => {
      cardEl.addEventListener('click', e => {
        if (!e.defaultPrevented) setState({ openCardId: cardEl.dataset.cardId, mobileMenuOpen: false });
      });
      cardEl.addEventListener('dragstart', e => {
        const cardId = cardEl.dataset.cardId;
        const fromListId = list.id;
        setState({ drag: { cardId, fromListId } });
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cardId); } catch (_) {}
      });
      cardEl.addEventListener('dragenter', e => {
        e.preventDefault(); e.stopPropagation();
        if (!state.drag) return;
        const beforeCardId = cardEl.dataset.cardId;
        if (!state.over || state.over.listId !== list.id || state.over.beforeCardId !== beforeCardId) {
          setState({ over: { listId: list.id, beforeCardId } });
        }
      });
      cardEl.addEventListener('dragend', () => setState({ drag: null, over: null }));
    });

    const cardsContainer = section.querySelector('.list-cards');
    cardsContainer.addEventListener('dragover', e => {
      if (state.drag) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (_) {} }
    });
    cardsContainer.addEventListener('dragenter', e => {
      if (!state.drag) return;
      if (!state.over || state.over.listId !== list.id) setState({ over: { listId: list.id, beforeCardId: null } });
    });
    cardsContainer.addEventListener('drop', e => {
      e.preventDefault();
      commitDrop();
    });

    // Add card
    if (isAddingCard) {
      const ta = section.querySelector('.add-card-ta');
      ta && ta.focus();
      ta && ta.addEventListener('input', e => setState({ newCardTitle: e.target.value }));
      ta && ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAddCard(list.id); }
        if (e.key === 'Escape') setState({ addingCardFor: null, newCardTitle: '' });
      });
      section.querySelector('.submit-card-btn')?.addEventListener('click', () => submitAddCard(list.id));
      section.querySelector('.cancel-card-btn')?.addEventListener('click', () => setState({ addingCardFor: null, newCardTitle: '' }));
    } else {
      section.querySelector('.add-card-btn')?.addEventListener('click', e => {
        setState({ addingCardFor: e.currentTarget.dataset.listId, newCardTitle: '' });
      });
    }
  });

  // ---- Add List ----
  const addListCol = document.createElement('div');
  addListCol.className = 'add-list-col';

  if (s.addingList) {
    addListCol.innerHTML = `
      <div class="add-list-form">
        <input class="add-list-inp" placeholder="Liste başlığı…" value="${escHtml(s.newListTitle)}">
        <div class="add-list-actions">
          <button class="btn-add-list submit-list-btn">Liste Ekle</button>
          <button class="btn-cancel cancel-list-btn">${ICONS.x}</button>
        </div>
      </div>
    `;
    boardEl.appendChild(addListCol);
    const inp = addListCol.querySelector('.add-list-inp');
    inp.focus();
    inp.addEventListener('input', e => setState({ newListTitle: e.target.value }));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitAddList();
      if (e.key === 'Escape') setState({ addingList: false, newListTitle: '' });
    });
    addListCol.querySelector('.submit-list-btn').addEventListener('click', submitAddList);
    addListCol.querySelector('.cancel-list-btn').addEventListener('click', () => setState({ addingList: false, newListTitle: '' }));
  } else {
    addListCol.innerHTML = `
      <button class="add-list-trigger" id="add-list-trigger-btn">
        ${ICONS.plus18} Yeni Liste Ekle
      </button>
    `;
    boardEl.appendChild(addListCol);
    addListCol.querySelector('#add-list-trigger-btn').addEventListener('click', () => setState({ addingList: true, newListTitle: '' }));
  }
}

function buildCardHTML(card) {
  const coverHTML = card.hasCover ? `<div class="card-cover"><img src="${card.cover}" alt=""></div>` : '';
  const labelsHTML = card.hasLabels
    ? `<div class="card-labels">${card.labels.map(lb => `<span class="label-pill" title="${lb.name}" style="background:${lb.color}"></span>`).join('')}</div>`
    : '';
  const dueHTML = card.hasDue
    ? `<span class="due-badge" style="${card.dueStyle}">${ICONS.clock} ${escHtml(card.dueLabel)}</span>`
    : '';
  const descHTML = card.hasDesc ? `<span class="meta-icon">${ICONS.desc15}</span>` : '';
  const checkHTML = card.hasChecklist
    ? `<span class="checklist-badge" style="${card.checklistStyle}">${ICONS.check14} ${card.checklistLabel}</span>`
    : '';
  const commentHTML = card.hasComments ? `<span class="comment-badge">${ICONS.chat14} ${card.commentCount}</span>` : '';
  const attachHTML = card.hasAttach ? `<span class="attach-badge">${ICONS.attach14} ${card.attachCount}</span>` : '';
  const assigneesHTML = card.assignees.length
    ? `<div class="assignees-row">${card.assignees.map(p => `<span class="card-avatar" style="background:${p.color}" title="${p.name}">${p.initials}</span>`).join('')}</div>`
    : '';
  const metaHTML = card.hasMeta ? `
    <div class="card-meta">
      ${dueHTML}${descHTML}${checkHTML}${commentHTML}${attachHTML}
      <span class="meta-spacer"></span>
      ${assigneesHTML}
    </div>` : '';

  return `
    <div class="card ${card.dragging ? 'dragging' : ''}"
         draggable="true"
         data-card-id="${card.id}"
         data-list-id="${card.listId}">
      ${card.showIndicator ? '<div class="drop-indicator"></div>' : ''}
      ${coverHTML}
      <div class="card-body">
        ${labelsHTML}
        <div class="card-title">${escHtml(card.title)}</div>
        ${metaHTML}
      </div>
    </div>
  `;
}

function submitAddCard(listId) {
  const t = (state.newCardTitle || '').trim();
  if (!t) return;
  const lists = state.lists.map(l =>
    l.id === listId
      ? { ...l, cards: [...l.cards, { id: 'c' + Date.now(), title: t, labels: [], assignees: [], desc: '', checklist: [], comments: [], attachments: [], due: null }] }
      : l
  );
  setState({ lists, newCardTitle: '' });
}

function submitAddList() {
  const t = (state.newListTitle || '').trim();
  if (!t) return;
  setState({
    lists: [...state.lists, { id: 'l' + Date.now(), title: t, cards: [] }],
    addingList: false,
    newListTitle: '',
  });
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
