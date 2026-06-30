// ============================================================
// STATE — Merkezi reaktif state yönetimi
// ============================================================
import { initialLists } from './data.js';

const listeners = new Set();

// ---- Kalıcı depolama (AsyncStorage benzeri, localStorage tabanlı) ----
const STORAGE_KEY = 'flowdesk.state.v1';
// Sadece kalıcı olması gereken alanlar (geçici UI state hariç)
const PERSIST_KEYS = ['theme', 'sideExpanded', 'lists'];

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePersisted(s) {
  try {
    const data = {};
    for (const k of PERSIST_KEYS) data[k] = s[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* depolama erişilemezse sessizce geç */
  }
}

const persisted = loadPersisted();

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
  ...persisted,
};

export function setState(partial) {
  Object.assign(state, partial);
  // Kalıcı alanlardan biri değiştiyse depolamaya yaz
  if (PERSIST_KEYS.some(k => k in partial)) savePersisted(state);
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
