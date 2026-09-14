// ============================================================
// STATE — Merkezi reaktif state yönetimi
// ============================================================
// Veri (board, liste, kart…) Supabase'den gelir ve yalnızca bellekte
// tutulur; okuma/yazma store.js'tedir. localStorage'da sadece cihaza özel
// görünüm tercihleri kalır.
// ============================================================

const listeners = new Set();

const STORAGE_KEY = 'flowdesk.prefs.v1';
const PERSIST_KEYS = ['theme', 'sideExpanded', 'activeBoardId'];

// Eski sürümlerin tarayıcıda tuttuğu demo verisini ve ek dosyalarını temizle
try {
  localStorage.removeItem('flowdesk.state.v1');
  indexedDB?.deleteDatabase('flowdesk-files');
} catch { /* depolama erişimi kapalı olabilir */ }

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
  } catch { /* tercih kaydı kritik değil */ }
}

/** Oturum kapanınca sıfırlanan veri alanları */
export function emptyData() {
  return {
    boardsLoaded: false,
    boards: [],          // [{ id, name, color, createdBy, myRole, members: [userId] }]
    people: {},          // userId -> { id, name, initials, color, email }
    labelsByBoard: {},   // boardId -> { labelId: { id, name, color } }
    listsByBoard: {},    // boardId -> [{ id, title, position, cards: [...] }] (yüklenmemişse yok)
  };
}

export const state = {
  theme: 'light',
  style: 'A',
  sideExpanded: true,
  navOpen: false,          // dar ekranda sidebar çekmecesi açık mı
  openCardId: null,
  search: '',
  filters: { members: [], labels: [], due: [] }, // bkz. filters.js
  // UI-mod bayrakları (metin değerleri DOM'da tutulur, state'te değil — focus korunur)
  addingCardFor: null,    // hangi listeye kart ekleniyor
  addingCardBefore: null, // kart hangi kartın önüne eklenecek (null = sona)
  addingList: false,      // yeni liste formu açık mı
  editingBoardId: null,   // sidebar inline board düzenleme
  editingListId: null,    // board içi liste adı düzenleme
  editingCardId: null,    // board içi kart adı düzenleme
  newBoardModal: false,
  profileOpen: false,
  // Oturum (bkz. auth.js)
  authReady: false,
  authed: false,
  userId: null,
  userEmail: '',
  userName: '',
  activeBoardId: null,
  ...emptyData(),
  ...loadPersisted(),
};

/** Aktif board nesnesini döndürür (board yoksa null) */
export function getActiveBoard() {
  return state.boards.find(b => b.id === state.activeBoardId) || null;
}

/** Aktif board'un listelerini döndürür (yoksa / yüklenmediyse boş dizi) */
export function getActiveLists() {
  return (state.activeBoardId && state.listsByBoard[state.activeBoardId]) || [];
}

/** Aktif board'un listelerini bellekte günceller (sunucuya yazmaz) */
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
