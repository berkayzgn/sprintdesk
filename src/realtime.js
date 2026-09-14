// ============================================================
// REALTIME — Diğer kullanıcıların değişikliklerini anlık yansıtır
// ============================================================
// Supabase Realtime (Postgres Changes) iki kanal dinler:
//   • boards / board_members / profiles → board listesi (davet, çıkarılma, isim, rol, kişi adı)
//   • board içeriği tabloları → açık board'u etkiliyorsa tazele
// Gelen olayı state'e tek tek işlemek yerine ilgili veri sunucudan yeniden
// yüklenir: DELETE olayları yalnızca id taşır ve alt tabloların (yorum,
// alt görev…) board bilgisi yoktur; yeniden yükleme her zaman doğru sonucu
// verir. Olaylar kısa süre biriktirilip tek yüklemeye dönüştürülür.
// Kendi yazımlarımızın yankısı da gelir; yerel state zaten günceldir,
// yeniden yükleme görünür bir değişiklik yapmaz.
// ============================================================
import { supabase } from './supabase.js';
import { state } from './state.js';
import { loadBoards, loadBoard, whenWritesIdle } from './store.js';
import { isRangePickerOpen } from './datepicker.js';

const DEBOUNCE_MS = 300;
const BUSY_RETRY_MS = 500;

const CONTENT_TABLES = [
  'lists', 'cards', 'labels', 'card_labels', 'card_assignees',
  'checklist_items', 'comments', 'attachments',
];

let channels = [];
let boardsTimer = null;
let boardTimer = null;
let started = false;

// ---------- Olay → "açık board'u etkiliyor mu?" ----------

function activeBoardIndex() {
  const lists = state.listsByBoard[state.activeBoardId];
  if (!lists) return null;
  const ids = new Set(lists.map(l => l.id));
  const cardIds = new Set();
  for (const l of lists) {
    for (const c of l.cards) {
      ids.add(c.id);
      cardIds.add(c.id);
      c.checklist.forEach(i => ids.add(i.id));
      c.comments.forEach(m => ids.add(m.id));
      c.attachments.forEach(a => ids.add(a.id));
    }
  }
  Object.keys(state.labelsByBoard[state.activeBoardId] || {}).forEach(id => ids.add(id));
  return { ids, cardIds };
}

function affectsActiveBoard(payload) {
  const boardId = state.activeBoardId;
  const index = activeBoardIndex();
  if (!boardId || !index) return false;

  const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
  if (!row) return false;
  // lists / cards / labels: board_id taşır (kartın board dışına taşınması: id bizde)
  if (row.board_id === boardId) return true;
  // alt tablolar: card_id taşır
  if (row.card_id && index.cardIds.has(row.card_id)) return true;
  // DELETE ya da başka board'a taşıma: sadece id bilinir
  return !!row.id && index.ids.has(row.id);
}

// ---------- Birleştirilmiş yeniden yükleme ----------

/** Sürükleme ya da tarih seçimi sürerken yeniden çizim kullanıcıyı keser */
function uiBusy() {
  return document.body.classList.contains('is-dragging-card') || isRangePickerOpen();
}

function scheduleBoardsReload() {
  clearTimeout(boardsTimer);
  boardsTimer = setTimeout(async () => {
    await whenWritesIdle();
    if (started) loadBoards();
  }, DEBOUNCE_MS);
}

function scheduleBoardReload(delay = DEBOUNCE_MS) {
  clearTimeout(boardTimer);
  boardTimer = setTimeout(async () => {
    if (!started) return;
    if (uiBusy()) { scheduleBoardReload(BUSY_RETRY_MS); return; }
    await whenWritesIdle();
    const id = state.activeBoardId;
    if (started && id) loadBoard(id);
  }, delay);
}

// ---------- Kanallar ----------

function onStatus(name, reloadOnResubscribe) {
  let subscribedOnce = false;
  return (status, err) => {
    if (status === 'SUBSCRIBED') {
      // Bağlantı koptuysa arada kaçan olaylar için tazele
      if (subscribedOnce) reloadOnResubscribe();
      subscribedOnce = true;
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(`[realtime] ${name}: ${status}`, err || '');
    }
  };
}

/** Oturum açılınca çağrılır */
export function startRealtime() {
  stopRealtime();
  started = true;

  const boardsChannel = supabase.channel('flowdesk-boards');
  for (const table of ['boards', 'board_members', 'profiles']) {
    boardsChannel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleBoardsReload);
  }
  boardsChannel.subscribe(onStatus('boards', scheduleBoardsReload));

  const contentChannel = supabase.channel('flowdesk-board-content');
  for (const table of CONTENT_TABLES) {
    contentChannel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
      if (affectsActiveBoard(payload)) scheduleBoardReload();
    });
  }
  contentChannel.subscribe(onStatus('board-content', () => scheduleBoardReload()));

  channels = [boardsChannel, contentChannel];
  document.addEventListener('visibilitychange', onVisible);
}

/** Oturum kapanınca çağrılır */
export function stopRealtime() {
  started = false;
  clearTimeout(boardsTimer);
  clearTimeout(boardTimer);
  document.removeEventListener('visibilitychange', onVisible);
  channels.forEach(ch => supabase.removeChannel(ch));
  channels = [];
}

// Sekme uzun süre arka planda kaldıysa (uyku, bağlantı kopması) tazele
let hiddenAt = 0;
function onVisible() {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 60_000) {
    scheduleBoardsReload();
    scheduleBoardReload();
  }
}
