/**
 * Merkezi reaktif state. Sunucu verisi yalnızca bellekte tutulur (bkz. store.js);
 * localStorage'a sadece cihaza özel görünüm tercihleri yazılır.
 */

const listeners = new Set();

const STORAGE_KEY = 'kynctask.prefs.v1';
const PERSIST_KEYS = ['theme', 'sideExpanded', 'activeBoardId', 'viewMode'];

function loadPersisted() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(PERSIST_KEYS.filter(k => k in parsed).map(k => [k, parsed[k]]));
  } catch {
    return {};
  }
}

function savePersisted(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(PERSIST_KEYS.map(k => [k, s[k]]))));
  } catch {
    /* tercih kaydı kritik değil */
  }
}

/** Oturum kapanınca sıfırlanan veri alanları */
export function emptyData() {
  return {
    boardsLoaded: false,
    boards: [], // [{ id, name, color, createdBy, myRole, members: [userId] }]
    people: {}, // userId -> { id, name, initials, color, email }
    labelsByBoard: {}, // boardId -> { labelId: { id, name, color } }
    listsByBoard: {}, // boardId -> [{ id, title, position, cards: [...] }] (yüklenmemişse yok)
  };
}

export const state = {
  theme: 'light',
  sideExpanded: true,
  viewMode: 'board', // 'board' | 'list'
  navOpen: false, // dar ekranda sidebar çekmecesi
  openCardId: null,
  search: '',
  filters: { members: [], labels: [], due: [] },
  // Form metinleri state'te değil DOM'da tutulur (render'da focus kaybolmasın)
  addingCardFor: null, // listId
  addingCardBefore: null, // cardId; null = sona
  addingList: false,
  editingBoardId: null,
  editingListId: null,
  editingCardId: null,
  newBoardModal: false,
  profileOpen: false,
  usersOpen: false,
  page: 'boards', // 'boards' | 'community' | 'calendar' | 'notes' | 'notifications' | 'performance'
  // Oturum (bkz. auth.js)
  authReady: false,
  authed: false,
  userId: null,
  userEmail: '',
  userName: '',
  isAdmin: false,
  mustChangePassword: false,
  activeBoardId: null,
  ...emptyData(),
  ...loadPersisted(),
};

export function getActiveBoard() {
  return state.boards.find(b => b.id === state.activeBoardId) || null;
}

/** Yüklenmemişse boş dizi */
export function getActiveLists() {
  return (state.activeBoardId && state.listsByBoard[state.activeBoardId]) || [];
}

/** Yalnızca belleği günceller, sunucuya yazmaz */
export function setActiveLists(lists) {
  if (!getActiveBoard()) return;
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
