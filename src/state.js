// ============================================================
// STATE — Merkezi reaktif state yönetimi
// ============================================================
import { initialLists, BOARDS as DEFAULT_BOARDS, PEOPLE, CURRENT_USER_ID } from './data.js';
import { migrateDue } from './dates.js';

const listeners = new Set();

const STORAGE_KEY = 'flowdesk.state.v1';
const PERSIST_KEYS = ['theme', 'sideExpanded', 'listsByBoard', 'boards', 'activeBoardId', 'authed', 'userEmail'];

let persistErrorHandler = err => console.error('[state] kaydedilemedi', err);

/** localStorage yazımı başarısız olduğunda (ör. kota dolu) çağrılır */
export function onPersistError(fn) { persistErrorHandler = fn; }

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

let lastPersistFailed = false;

function savePersisted(s) {
  try {
    const data = {};
    for (const k of PERSIST_KEYS) data[k] = s[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    lastPersistFailed = false;
  } catch (err) {
    // Aynı hatayı her state değişikliğinde tekrar tekrar gösterme
    if (!lastPersistFailed) persistErrorHandler(err);
    lastPersistFailed = true;
  }
}

const persisted = loadPersisted();

// Üyesi tanımlanmamış (eski/demo) board'lar tüm ekibi alır; oturumdaki
// kullanıcı her zaman kendi board'unun üyesidir
const boards = (persisted.boards || DEFAULT_BOARDS.map((b, i) => ({ ...b, id: 'b' + i }))).map(b => ({
  ...b,
  members: Array.isArray(b.members)
    ? [...new Set([CURRENT_USER_ID, ...b.members])]
    : Object.keys(PEOPLE),
}));

// Eski şema göçü: tek global `lists` → board-başına `listsByBoard`
const rawListsByBoard = persisted.listsByBoard || { b0: persisted.lists || initialLists() };

// Silinmiş board'lardan kalan sahipsiz listeleri at; kart/alt görev
// tarihlerini metin etiketten ISO tarihe çevir
const listsByBoard = {};
for (const b of boards) {
  const lists = rawListsByBoard[b.id];
  if (!lists) continue;
  listsByBoard[b.id] = lists.map(l => ({
    ...l,
    cards: l.cards.map(c => {
      const { due, ...rest } = c;
      return {
        ...rest,
        startAt: c.startAt ?? null,
        dueAt: c.dueAt !== undefined ? c.dueAt : migrateDue(due),
        dueComplete: c.dueComplete ?? due?.state === 'done',
        checklist: (c.checklist || []).map(it => ({ startAt: null, dueAt: null, assignee: null, ...it })),
      };
    }),
  }));
}

const activeBoardId = boards.some(b => b.id === persisted.activeBoardId)
  ? persisted.activeBoardId
  : (boards[0]?.id ?? null);

export const state = {
  theme: 'light',
  style: 'A',
  sideExpanded: true,
  navOpen: false,          // dar ekranda sidebar çekmecesi açık mı
  openCardId: null,
  search: '',
  // UI-mod bayrakları (metin değerleri DOM'da tutulur, state'te değil — focus korunur)
  addingCardFor: null,    // hangi listeye kart ekleniyor
  addingCardBefore: null, // kart hangi kartın önüne eklenecek (null = sona)
  addingList: false,      // yeni liste formu açık mı
  editingBoardId: null,   // sidebar inline board düzenleme
  editingListId: null,    // board içi liste adı düzenleme
  editingCardId: null,    // board içi kart adı düzenleme
  newBoardModal: false,
  profileOpen: false,
  authed: false,                       // demo login durumu
  userEmail: 'ayse@acmestudio.io',
  ...persisted,
  boards,
  listsByBoard,
  activeBoardId,
};
delete state.lists;

/** Aktif board nesnesini döndürür (board yoksa null) */
export function getActiveBoard() {
  return state.boards.find(b => b.id === state.activeBoardId) || null;
}

/** Aktif board'un listelerini döndürür (yoksa boş dizi) */
export function getActiveLists() {
  return (state.activeBoardId && state.listsByBoard[state.activeBoardId]) || [];
}

/** Aktif board'un listelerini günceller */
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

/** Board'u ve ona ait tüm listeleri siler */
export function deleteBoard(id) {
  const remaining = state.boards.filter(b => b.id !== id);
  const { [id]: _removed, ...listsByBoard } = state.listsByBoard;
  const wasActive = state.activeBoardId === id;
  setState({
    boards: remaining,
    listsByBoard,
    activeBoardId: wasActive ? (remaining[0]?.id ?? null) : state.activeBoardId,
    editingBoardId: null,
    ...(wasActive && { openCardId: null, addingList: false, addingCardFor: null, editingListId: null, editingCardId: null, search: '' }),
  });
}

/** Kartı hedef listeye, `beforeCardId`'nin önüne (null ise sona) taşır */
export function moveCard(cardId, toListId, beforeCardId) {
  if (cardId === beforeCardId) return;
  const lists = getActiveLists().map(l => ({ ...l, cards: [...l.cards] }));

  let card = null;
  for (const l of lists) {
    const i = l.cards.findIndex(c => c.id === cardId);
    if (i >= 0) { card = l.cards.splice(i, 1)[0]; break; }
  }
  const target = lists.find(l => l.id === toListId);
  if (!card || !target) return;

  let idx = beforeCardId ? target.cards.findIndex(c => c.id === beforeCardId) : -1;
  if (idx < 0) idx = target.cards.length;
  target.cards.splice(idx, 0, card);
  setActiveLists(lists);
}

/** Tüm board'lardaki IndexedDB dosya anahtarları */
export function liveFileKeys() {
  const keys = new Set();
  for (const lists of Object.values(state.listsByBoard)) {
    for (const l of lists) for (const c of l.cards) {
      for (const a of c.attachments || []) if (a.fileKey) keys.add(a.fileKey);
    }
  }
  return keys;
}
