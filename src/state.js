// ============================================================
// STATE — Merkezi reaktif state yönetimi
// ============================================================
import { initialLists } from './data.js';

const listeners = new Set();

export const state = {
  theme: 'light',
  device: 'desktop',
  style: 'A',
  showEmpty: false,
  sideExpanded: true,
  mobileMenuOpen: false,
  mobileIndex: 0,
  openCardId: null,
  search: '',
  addingCardFor: null,
  newCardTitle: '',
  addingList: false,
  newListTitle: '',
  drag: null,
  over: null,
  newChecklistText: '',
  newCommentText: '',
  lists: initialLists(),
};

export function setState(partial) {
  Object.assign(state, partial);
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- Yardımcı mutasyonlar ----

export function updateCard(id, updater) {
  const lists = state.lists.map(l => ({
    ...l,
    cards: l.cards.map(c => {
      if (c.id !== id) return c;
      return typeof updater === 'function' ? updater(c) : { ...c, ...updater };
    }),
  }));
  setState({ lists });
}

export function commitDrop() {
  const { drag, over } = state;
  if (!drag || !over) { setState({ drag: null, over: null }); return; }

  let lists = state.lists.map(l => ({ ...l, cards: [...l.cards] }));
  let card = null;
  for (const l of lists) {
    const i = l.cards.findIndex(c => c.id === drag.cardId);
    if (i >= 0) { card = l.cards.splice(i, 1)[0]; break; }
  }
  if (!card) { setState({ drag: null, over: null }); return; }

  const tl = lists.find(l => l.id === over.listId);
  if (!tl) { setState({ drag: null, over: null }); return; }

  let idx = over.beforeCardId
    ? tl.cards.findIndex(c => c.id === over.beforeCardId)
    : tl.cards.length;
  if (idx < 0) idx = tl.cards.length;
  tl.cards.splice(idx, 0, card);
  setState({ lists, drag: null, over: null });
}
