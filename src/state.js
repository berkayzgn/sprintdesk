// ============================================================
// STATE — Merkezi reaktif state yönetimi
// ============================================================
import { initialLists, BOARDS as DEFAULT_BOARDS } from './data.js';

const listeners = new Set();

const STORAGE_KEY = 'flowdesk.state.v1';
const PERSIST_KEYS = ['theme', 'sideExpanded', 'listsByBoard', 'boards', 'activeBoardId', 'authed', 'userEmail'];

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
  } catch { /* sessiz geç */ }
}

const persisted = loadPersisted();

const defaultBoards = DEFAULT_BOARDS.map((b, i) => ({ ...b, id: 'b' + i }));

// Eski şema göçü: tek global `lists` → board-başına `listsByBoard`
let initialListsByBoard = persisted.listsByBoard;
if (!initialListsByBoard) {
  initialListsByBoard = {
    b0: persisted.lists || initialLists(),  // ilk board demo verisini alır
  };
}

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
  // UI-mod bayrakları (metin değerleri DOM'da tutulur, state'te değil — focus korunur)
  addingCardFor: null,    // hangi listeye kart ekleniyor
  addingList: false,      // yeni liste formu açık mı
  editingBoardId: null,   // sidebar inline board düzenleme
  editingListId: null,    // board içi liste adı düzenleme
  editingCardId: null,    // board içi kart adı düzenleme
  drag: null,
  over: null,
  newBoardModal: false,
  profileOpen: false,
  authed: false,                       // demo login durumu
  userEmail: 'ayse@acmestudio.io',
  boards: defaultBoards,
  activeBoardId: 'b0',
  ...persisted,
  // listsByBoard'u her zaman göç edilmiş değerle ezelim (persisted.lists eski olabilir)
  listsByBoard: initialListsByBoard,
};

/** Aktif board nesnesini döndürür */
export function getActiveBoard() {
  return (state.boards || []).find(b => b.id === state.activeBoardId) || state.boards[0] || null;
}

/** Aktif board'un listelerini döndürür (yoksa boş dizi) */
export function getActiveLists() {
  return state.listsByBoard[state.activeBoardId] || [];
}

/** Aktif board'un listelerini günceller */
export function setActiveLists(lists) {
  setState({
    listsByBoard: { ...state.listsByBoard, [state.activeBoardId]: lists },
  });
}

export function setState(partial) {
  Object.assign(state, partial);
  if (PERSIST_KEYS.some(k => k in partial)) savePersisted(state);
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- Yardımcı mutasyonlar (aktif board üzerinde çalışır) ----

export function updateCard(id, updater) {
  const lists = getActiveLists().map(l => ({
    ...l,
    cards: l.cards.map(c => {
      if (c.id !== id) return c;
      return typeof updater === 'function' ? updater(c) : { ...c, ...updater };
    }),
  }));
  setActiveLists(lists);
}

export function commitDrop() {
  const { drag, over } = state;
  if (!drag || !over) { setState({ drag: null, over: null }); return; }

  let lists = getActiveLists().map(l => ({ ...l, cards: [...l.cards] }));
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
  setState({
    listsByBoard: { ...state.listsByBoard, [state.activeBoardId]: lists },
    drag: null, over: null,
  });
}
