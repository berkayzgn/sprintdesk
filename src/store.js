// ============================================================
// STORE — Supabase veri katmanı (yükleme + mutasyonlar)
// ============================================================
// Her mutasyon önce bellekteki state'i günceller (arayüz anında tepki
// verir), sonra sunucuya yazar. Yazımlar tek bir kuyrukta sırayla gider:
// "kart ekle → hemen adını değiştir" gibi ardışık işlemler sunucuya da
// aynı sırada ulaşır. Yazım başarısız olursa kullanıcı uyarılır ve veri
// sunucudan yeniden yüklenerek arayüz gerçek duruma döner.
// ============================================================
import { supabase } from './supabase.js';
import { state, setState, emptyData, getActiveBoard, getActiveLists, setActiveLists } from './state.js';
import { uploadFile, removeFiles } from './files.js';
import { showToast } from './toast.js';
import { initialsOf } from './helpers.js';

const GAP = 1024;

// ---------- Satır → state dönüştürücüleri ----------

function toPerson(p) {
  const name = p.full_name || (p.email || '').split('@')[0];
  return { id: p.id, name, initials: initialsOf(name), color: p.avatar_color, email: p.email };
}

function toChecklistItem(r) {
  return {
    id: r.id, text: r.text, done: r.done, position: r.position,
    startAt: r.start_at, dueAt: r.due_at, assignee: r.assignee_id,
  };
}

function toComment(r) {
  return { id: r.id, who: r.author_id, text: r.body, createdAt: r.created_at };
}

function toAttachment(r) {
  return {
    id: r.id, storagePath: r.storage_path, name: r.name, size: r.size, mime: r.mime,
    type: (r.mime || '').startsWith('image/') ? 'image' : 'file',
  };
}

function toCard(r) {
  return {
    id: r.id, listId: r.list_id, title: r.title, desc: r.description, color: r.color,
    position: r.position, startAt: r.start_at, dueAt: r.due_at, dueComplete: r.due_complete,
    labels: (r.card_labels || []).map(x => x.label_id),
    assignees: (r.card_assignees || []).map(x => x.user_id),
    checklist: (r.checklist_items || []).map(toChecklistItem).sort(byPosition),
    comments: (r.comments || []).map(toComment).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    attachments: (r.attachments || []).map(toAttachment),
  };
}

const byPosition = (a, b) => a.position - b.position;

export const ROLE_ORDER = { owner: 0, admin: 1, member: 2, viewer: 3 };
const byRoleThenJoined = (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.created_at.localeCompare(b.created_at);

/** Kart state'inden cards tablosu kolonlarına */
const CARD_COLUMNS = {
  title: 'title', desc: 'description', color: 'color',
  startAt: 'start_at', dueAt: 'due_at', dueComplete: 'due_complete',
};
const ITEM_COLUMNS = { text: 'text', done: 'done', startAt: 'start_at', dueAt: 'due_at', assignee: 'assignee_id' };

function toColumns(patch, map) {
  const row = {};
  for (const [k, v] of Object.entries(patch)) if (map[k]) row[map[k]] = v;
  return row;
}

// ---------- Sıralama ----------

/** `items` (position'a göre sıralı) içinde `beforeId`'nin önüne gelecek position */
function positionBefore(items, beforeId) {
  const idx = beforeId ? items.findIndex(i => i.id === beforeId) : -1;
  if (idx < 0) return items.length ? items[items.length - 1].position + GAP : GAP;
  if (idx === 0) return items[0].position - GAP;
  return (items[idx - 1].position + items[idx].position) / 2;
}

// ---------- Yazım kuyruğu & hata yönetimi ----------

let queue = Promise.resolve();
let resyncTimer = null;
let pendingWrites = 0;  // kuyrukta bekleyen/süren yazım sayısı
let localVersion = 0;   // her yerel mutasyonda artar (yükleme sırasında değişiklik oldu mu?)
let idleWaiters = [];

/** Bekleyen yazım yoksa hemen, varsa kuyruk boşalınca çözülür */
export function whenWritesIdle() {
  if (!pendingWrites) return Promise.resolve();
  return new Promise(resolve => idleWaiters.push(resolve));
}

class NoRowsError extends Error {
  constructor() { super('Kayıt bulunamadı veya bu işlem için yetkin yok'); this.code = 'no_rows'; }
}

/**
 * update/delete sorgusunun gerçekten bir satıra dokunduğunu doğrular (RLS sessizce 0 satır döndürür)
 * @param column dönecek bir sütun: `id`'si olmayan bağlantı tablolarında anahtar sütunlardan biri
 */
async function expectRows(builder, column = 'id') {
  const { data, error } = await builder.select(column);
  if (error) return { error };
  if (!data?.length) return { error: new NoRowsError() };
  return { error: null };
}

function errorText(err) {
  if (err?.code === '42501' || err?.code === 'no_rows') return 'Bu işlem için yetkin yok ya da kayıt artık mevcut değil.';
  if (err?.message?.includes('Failed to fetch')) return 'Sunucuya ulaşılamadı.';
  return err?.message || 'Bilinmeyen hata';
}

/**
 * Sunucu yazımını kuyruğa ekler.
 * @param {() => Promise<{error: any}>} fn
 * @returns {Promise<boolean>} başarılı mı
 */
function persist(fn) {
  pendingWrites++;
  localVersion++;
  const run = queue.then(async () => {
    const res = await fn();
    if (res?.error) throw res.error;
    return true;
  });
  queue = run.catch(() => {}).finally(() => {
    if (--pendingWrites === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach(r => r());
    }
  });
  return run.catch(err => {
    console.error('[store] yazım başarısız', err);
    showToast(`Değişiklik kaydedilemedi: ${errorText(err)}`, 'error', 6000);
    scheduleResync();
    return false;
  });
}

function scheduleResync() {
  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(async () => {
    await loadBoards();
    const id = state.activeBoardId;
    if (id) await loadBoard(id);
  }, 300);
}

// ---------- Yükleme ----------

const RETRY_DELAYS_MS = [700, 2000];

/**
 * Okuma sorgularını geçici hatalarda tekrar dener. Örn. girişten hemen sonra
 * PostgREST yeni token'ı saniye yuvarlaması yüzünden "JWT issued at future"
 * (PGRST303) diye reddedebiliyor; kısa bir bekleme sonrası geçiyor.
 * @param {() => Promise<{ error: any }[]>} run sonuç dizisi döndüren sorgu grubu
 */
async function withRetry(run) {
  let results = await run();
  for (const delay of RETRY_DELAYS_MS) {
    if (!results.some(r => r.error)) break;
    await new Promise(r => setTimeout(r, delay));
    results = await run();
  }
  return results;
}

let loadToken = 0;

/** Oturum açılınca: board listesi + aktif board */
export async function loadInitial() {
  const token = ++loadToken;
  await loadBoards();
  if (token !== loadToken) return;
  if (state.activeBoardId) await loadBoard(state.activeBoardId);
}

/** Oturum kapanınca bellekteki veriyi temizle */
export function resetData() {
  loadToken++;
  setState({ ...emptyData(), openCardId: null, search: '', filters: { members: [], labels: [], due: [] }, addingList: false, addingCardFor: null, editingBoardId: null, editingListId: null, editingCardId: null });
}

export async function loadBoards() {
  const token = loadToken;
  const version = localVersion;
  const [boardsRes, peopleRes] = await withRetry(() => Promise.all([
    supabase.from('boards').select('id, name, color, created_by, created_at, board_members(user_id, role, created_at), board_stars(board_id)').order('created_at'),
    supabase.from('profiles').select('id, email, full_name, avatar_color'),
  ]));
  if (token !== loadToken) return;
  if (version !== localVersion) {
    await whenWritesIdle();
    if (token === loadToken) return loadBoards();
    return;
  }
  const error = boardsRes.error || peopleRes.error;
  if (error) {
    console.error('[store] board listesi yüklenemedi', error);
    showToast(`Board'lar yüklenemedi: ${errorText(error)}`, 'error', 8000);
    setState({ boardsLoaded: true });
    return;
  }

  const boards = boardsRes.data.map(b => ({
    id: b.id,
    name: b.name,
    color: b.color,
    createdBy: b.created_by,
    members: [...b.board_members].sort(byRoleThenJoined).map(m => m.user_id),
    roles: Object.fromEntries(b.board_members.map(m => [m.user_id, m.role])),
    myRole: b.board_members.find(m => m.user_id === state.userId)?.role || null,
    starred: b.board_stars.length > 0, // RLS: yalnızca kendi yıldızımız gelir
  }));
  const people = Object.fromEntries(peopleRes.data.map(p => [p.id, toPerson(p)]));

  // Artık erişilemeyen board'ların verisini bellekten at
  const ids = new Set(boards.map(b => b.id));
  const listsByBoard = Object.fromEntries(Object.entries(state.listsByBoard).filter(([id]) => ids.has(id)));
  const activeBoardId = ids.has(state.activeBoardId) ? state.activeBoardId : (boards[0]?.id ?? null);

  const unchanged = state.boardsLoaded
    && activeBoardId === state.activeBoardId
    && Object.keys(listsByBoard).length === Object.keys(state.listsByBoard).length
    && JSON.stringify([boards, people]) === JSON.stringify([state.boards, state.people]);
  if (unchanged) return;

  setState({ boards, people, listsByBoard, activeBoardId, boardsLoaded: true });
}

export async function loadBoard(boardId) {
  const token = loadToken;
  const version = localVersion;
  const [listsRes, cardsRes, labelsRes] = await withRetry(() => Promise.all([
    supabase.from('lists').select('id, title, position').eq('board_id', boardId).order('position'),
    supabase.from('cards')
      .select(`id, list_id, title, description, color, position, start_at, due_at, due_complete,
        card_labels(label_id), card_assignees(user_id),
        checklist_items(id, text, done, position, start_at, due_at, assignee_id),
        comments(id, author_id, body, created_at),
        attachments(id, storage_path, name, mime, size)`)
      .eq('board_id', boardId)
      .order('position'),
    supabase.from('labels').select('id, name, color').eq('board_id', boardId),
  ]));
  if (token !== loadToken) return;
  // Yükleme sürerken kullanıcı bir şey değiştirdiyse bu veri eski: iyimser
  // güncellemeyi ezmesin, yazım bitince tazele
  if (version !== localVersion) {
    whenWritesIdle().then(() => { if (token === loadToken && state.activeBoardId === boardId) loadBoard(boardId); });
    return;
  }
  const error = listsRes.error || cardsRes.error || labelsRes.error;
  if (error) {
    console.error('[store] board yüklenemedi', error);
    showToast(`Board yüklenemedi: ${errorText(error)}`, 'error', 8000);
    return;
  }

  const cardsByList = new Map();
  for (const row of cardsRes.data) {
    const card = toCard(row);
    if (!cardsByList.has(card.listId)) cardsByList.set(card.listId, []);
    cardsByList.get(card.listId).push(card);
  }
  const lists = listsRes.data.map(l => ({ ...l, cards: cardsByList.get(l.id) || [] }));
  const labels = Object.fromEntries(labelsRes.data.map(l => [l.id, l]));

  // Çoğu yükleme (kendi yazımlarımızın realtime yankısı) değişiklik getirmez:
  // aynıysa state'e dokunma, board gereksiz yere yeniden çizilmesin
  const same = JSON.stringify(lists) === JSON.stringify(state.listsByBoard[boardId])
    && JSON.stringify(labels) === JSON.stringify(state.labelsByBoard[boardId]);
  if (same) return;

  setState({
    listsByBoard: { ...state.listsByBoard, [boardId]: lists },
    labelsByBoard: { ...state.labelsByBoard, [boardId]: labels },
  });
}

/** Board'a geç; önbellekteki içerik hemen gösterilir, arka planda tazelenir */
export function selectBoard(boardId) {
  setState({
    activeBoardId: boardId,
    addingList: false,
    addingCardFor: null,
    openCardId: null,
    search: '',
    filters: { members: [], labels: [], due: [] },
    navOpen: false,
  });
  // Başka board'lardaki değişiklikler anlık dinlenmiyor; geçişte her zaman tazele
  loadBoard(boardId);
}

// ---------- Board ----------

/**
 * Board oluşturur ve e-postası verilen kişileri üye olarak ekler.
 * @returns {Promise<{ ok: boolean, failedEmails: string[] }>}
 */
export async function createBoard({ name, color, emails = [] }) {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('boards').insert({ id, name, color });
  if (error) {
    showToast(`Board oluşturulamadı: ${errorText(error)}`, 'error', 6000);
    return { ok: false, failedEmails: [] };
  }

  const failedEmails = [];
  for (const email of emails) {
    const { error: e } = await supabase.rpc('add_board_member', { p_board_id: id, p_email: email });
    if (e) failedEmails.push(email);
  }

  setState({ listsByBoard: { ...state.listsByBoard, [id]: [] } });
  await loadBoards();
  selectBoard(id);
  loadBoard(id); // varsayılan etiketler
  return { ok: true, failedEmails };
}

/** @returns {Promise<string|null>} hata mesajı */
export async function inviteMember(boardId, email) {
  const { error } = await supabase.rpc('add_board_member', { p_board_id: boardId, p_email: email });
  if (error) {
    if (error.code === 'P0002') return 'Bu e-postayla kayıtlı kullanıcı yok. Önce uygulamaya kayıt olmalı.';
    if (error.code === '42501') return 'Bu board\'a üye ekleme yetkin yok.';
    return errorText(error);
  }
  await loadBoards();
  return null;
}

export function renameBoard(boardId, name) {
  setState({
    boards: state.boards.map(b => b.id === boardId ? { ...b, name } : b),
    editingBoardId: null,
  });
  return persist(() => expectRows(supabase.from('boards').update({ name }).eq('id', boardId)));
}

export async function deleteBoard(boardId) {
  const remaining = state.boards.filter(b => b.id !== boardId);
  const { [boardId]: _lists, ...listsByBoard } = state.listsByBoard;
  const wasActive = state.activeBoardId === boardId;
  setState({
    boards: remaining,
    listsByBoard,
    activeBoardId: wasActive ? (remaining[0]?.id ?? null) : state.activeBoardId,
    editingBoardId: null,
    ...(wasActive && { openCardId: null, addingList: false, addingCardFor: null, editingListId: null, editingCardId: null, search: '' }),
  });
  if (wasActive && state.activeBoardId && !state.listsByBoard[state.activeBoardId]) loadBoard(state.activeBoardId);

  const paths = await attachmentPaths('board_id', boardId);
  const ok = await persist(() => expectRows(supabase.from('boards').delete().eq('id', boardId)));
  if (ok) removeFiles(paths);
}

/** Silinecek kart/liste/board'a ait storage yolları (satırlar cascade ile gider, dosyalar gitmez) */
async function attachmentPaths(column, value) {
  const { data, error } = await supabase
    .from('attachments')
    .select('storage_path, cards!inner(board_id, list_id)')
    .eq(`cards.${column}`, value);
  if (error) { console.error('[store] ek yolları alınamadı', error); return []; }
  return data.map(r => r.storage_path);
}

// ---------- Hesap silme ----------

/** Sahibi olunan ve başka üyesi olmayan board'lar hesapla birlikte silinir */
function boardsDeletedWithAccount() {
  return state.boards.filter(b => b.myRole === 'owner' && b.members.length <= 1);
}

/** Hesap silinirse board'lara ne olacağı (onay ekranında gösterilir) */
export function accountDeletionImpact() {
  const owned = state.boards.filter(b => b.myRole === 'owner');
  return {
    deleted: boardsDeletedWithAccount().map(b => b.name),
    transferred: owned.filter(b => b.members.length > 1).map(b => b.name),
  };
}

/**
 * Hesapla silinecek board'ların dosyalarını kaldırır. SQL'den storage
 * silinemediği için hesap silinmeden önce, yetki hâlâ varken yapılır.
 */
export async function removeFilesOfBoardsDeletedWithAccount() {
  await whenWritesIdle();
  await loadBoards(); // üye sayıları güncel olsun
  const paths = (await Promise.all(boardsDeletedWithAccount().map(b => attachmentPaths('board_id', b.id)))).flat();
  await removeFiles(paths);
}

// ---------- Liste ----------

export function createList(title) {
  const boardId = state.activeBoardId;
  const lists = getActiveLists();
  const list = { id: crypto.randomUUID(), title, position: positionBefore(lists, null), cards: [] };
  setActiveLists([...lists, list]);
  return persist(() => supabase.from('lists').insert({ id: list.id, board_id: boardId, title, position: list.position }));
}

export function renameList(listId, title) {
  setActiveLists(getActiveLists().map(l => l.id === listId ? { ...l, title } : l));
  return persist(() => expectRows(supabase.from('lists').update({ title }).eq('id', listId)));
}

export async function deleteList(listId) {
  const list = getActiveLists().find(l => l.id === listId);
  setActiveLists(getActiveLists().filter(l => l.id !== listId));
  const paths = (list?.cards || []).flatMap(c => c.attachments.map(a => a.storagePath));
  const ok = await persist(() => expectRows(supabase.from('lists').delete().eq('id', listId)));
  if (ok) removeFiles(paths);
}

// ---------- Kart ----------

function mapCards(fn) {
  setActiveLists(getActiveLists().map(l => ({ ...l, cards: l.cards.map(c => fn(c) ?? c) })));
}

export function findCard(cardId) {
  for (const l of getActiveLists()) {
    const c = l.cards.find(x => x.id === cardId);
    if (c) return c;
  }
  return null;
}

export function createCard(listId, beforeCardId, title) {
  const list = getActiveLists().find(l => l.id === listId);
  if (!list) return;
  const card = {
    id: crypto.randomUUID(), listId, title, desc: '', color: null,
    position: positionBefore(list.cards, beforeCardId),
    startAt: null, dueAt: null, dueComplete: false,
    labels: [], assignees: [], checklist: [], comments: [], attachments: [],
  };
  setActiveLists(getActiveLists().map(l => l.id === listId
    ? { ...l, cards: [...l.cards, card].sort(byPosition) }
    : l));
  return persist(() => supabase.from('cards').insert({ id: card.id, list_id: listId, title, position: card.position }));
}

/** title, desc, color, startAt, dueAt, dueComplete alanlarını günceller */
export function updateCard(cardId, patch) {
  mapCards(c => c.id === cardId ? { ...c, ...patch } : null);
  const row = toColumns(patch, CARD_COLUMNS);
  if (!Object.keys(row).length) return Promise.resolve(true);
  return persist(() => expectRows(supabase.from('cards').update(row).eq('id', cardId)));
}

export async function deleteCard(cardId) {
  const card = findCard(cardId);
  setActiveLists(getActiveLists().map(l => ({ ...l, cards: l.cards.filter(c => c.id !== cardId) })));
  if (state.openCardId === cardId) setState({ openCardId: null });
  const ok = await persist(() => expectRows(supabase.from('cards').delete().eq('id', cardId)));
  if (ok) removeFiles((card?.attachments || []).map(a => a.storagePath));
}

/** Kartı hedef listeye, `beforeCardId`'nin önüne (null ise sona) taşır */
export function moveCard(cardId, toListId, beforeCardId) {
  if (cardId === beforeCardId) return;
  const card = findCard(cardId);
  const target = getActiveLists().find(l => l.id === toListId);
  if (!card || !target) return;

  const others = target.cards.filter(c => c.id !== cardId);
  const position = positionBefore(others, beforeCardId);
  const moved = { ...card, listId: toListId, position };

  setActiveLists(getActiveLists().map(l => {
    const cards = l.cards.filter(c => c.id !== cardId);
    return { ...l, cards: l.id === toListId ? [...cards, moved].sort(byPosition) : cards };
  }));
  return persist(() => expectRows(supabase.from('cards').update({ list_id: toListId, position }).eq('id', cardId)));
}

export function setCardAssignees(cardId, userIds) {
  const card = findCard(cardId);
  if (!card) return;
  const next = new Set(userIds);
  const added = userIds.filter(id => !card.assignees.includes(id));
  const removed = card.assignees.filter(id => !next.has(id));
  mapCards(c => c.id === cardId ? { ...c, assignees: [...userIds] } : null);

  return persist(async () => {
    if (removed.length) {
      const { error } = await supabase.from('card_assignees').delete().eq('card_id', cardId).in('user_id', removed);
      if (error) return { error };
    }
    if (added.length) {
      return supabase.from('card_assignees').insert(added.map(user_id => ({ card_id: cardId, user_id })));
    }
    return { error: null };
  });
}

// ---------- Alt görevler ----------

function mapItems(cardId, fn) {
  mapCards(c => c.id === cardId ? { ...c, checklist: fn(c.checklist) } : null);
}

export function addChecklistItem(cardId, text) {
  const card = findCard(cardId);
  if (!card) return;
  const item = {
    id: crypto.randomUUID(), text, done: false, position: positionBefore(card.checklist, null),
    startAt: null, dueAt: null, assignee: null,
  };
  mapItems(cardId, items => [...items, item]);
  return persist(() => supabase.from('checklist_items').insert({ id: item.id, card_id: cardId, text, position: item.position }));
}

/** text, done, startAt, dueAt, assignee alanlarını günceller */
export function updateChecklistItem(cardId, itemId, patch) {
  mapItems(cardId, items => items.map(it => it.id === itemId ? { ...it, ...patch } : it));
  return persist(() => expectRows(supabase.from('checklist_items').update(toColumns(patch, ITEM_COLUMNS)).eq('id', itemId)));
}

export function deleteChecklistItem(cardId, itemId) {
  mapItems(cardId, items => items.filter(it => it.id !== itemId));
  return persist(() => expectRows(supabase.from('checklist_items').delete().eq('id', itemId)));
}

// ---------- Yorumlar ----------

export function addComment(cardId, text) {
  const comment = { id: crypto.randomUUID(), who: state.userId, text, createdAt: new Date().toISOString() };
  mapCards(c => c.id === cardId ? { ...c, comments: [comment, ...c.comments] } : null);
  return persist(() => supabase.from('comments').insert({ id: comment.id, card_id: cardId, body: text }));
}

// ---------- Ekler ----------

export async function addAttachment(cardId, file) {
  const boardId = state.activeBoardId;
  let path;
  try {
    path = await uploadFile(boardId, cardId, file);
  } catch (err) {
    console.error('[store] dosya yüklenemedi', err);
    showToast(`${file.name} yüklenemedi: ${errorText(err)}`, 'error', 6000);
    return false;
  }

  const att = toAttachment({ id: crypto.randomUUID(), storage_path: path, name: file.name, mime: file.type || '', size: file.size });
  // Yükleme sürerken board değiştirilmiş olabilir: yalnızca aynı board açıksa belleğe ekle
  if (state.activeBoardId === boardId) {
    mapCards(c => c.id === cardId ? { ...c, attachments: [...c.attachments, att] } : null);
  }
  const ok = await persist(() => supabase.from('attachments').insert({
    id: att.id, card_id: cardId, storage_path: path, name: att.name, mime: att.mime, size: att.size,
  }));
  if (!ok) removeFiles([path]);
  return ok;
}

export async function removeAttachment(cardId, attachmentId) {
  const att = findCard(cardId)?.attachments.find(a => a.id === attachmentId);
  mapCards(c => c.id === cardId ? { ...c, attachments: c.attachments.filter(a => a.id !== attachmentId) } : null);
  const ok = await persist(() => expectRows(supabase.from('attachments').delete().eq('id', attachmentId)));
  if (ok && att) removeFiles([att.storagePath]);
}

// ---------- Etiketler ----------

function setBoardLabels(boardId, labels) {
  setState({ labelsByBoard: { ...state.labelsByBoard, [boardId]: labels } });
}

export function createLabel(name, color) {
  const boardId = state.activeBoardId;
  const label = { id: crypto.randomUUID(), name, color };
  setBoardLabels(boardId, { ...state.labelsByBoard[boardId], [label.id]: label });
  return persist(() => supabase.from('labels').insert({ ...label, board_id: boardId }));
}

export function updateLabel(labelId, patch) {
  const boardId = state.activeBoardId;
  const labels = state.labelsByBoard[boardId] || {};
  if (!labels[labelId]) return;
  setBoardLabels(boardId, { ...labels, [labelId]: { ...labels[labelId], ...patch } });
  return persist(() => expectRows(supabase.from('labels').update(patch).eq('id', labelId)));
}

export function deleteLabel(labelId) {
  const boardId = state.activeBoardId;
  const { [labelId]: _removed, ...labels } = state.labelsByBoard[boardId] || {};
  setBoardLabels(boardId, labels);
  mapCards(c => c.labels.includes(labelId) ? { ...c, labels: c.labels.filter(id => id !== labelId) } : null);
  return persist(() => expectRows(supabase.from('labels').delete().eq('id', labelId)));
}

export function toggleCardLabel(cardId, labelId) {
  const card = findCard(cardId);
  if (!card) return;
  const has = card.labels.includes(labelId);
  mapCards(c => c.id === cardId ? { ...c, labels: has ? c.labels.filter(id => id !== labelId) : [...c.labels, labelId] } : null);
  return persist(() => has
    ? expectRows(supabase.from('card_labels').delete().eq('card_id', cardId).eq('label_id', labelId), 'card_id')
    : supabase.from('card_labels').insert({ card_id: cardId, label_id: labelId }));
}

// ---------- Üye yönetimi ----------

function mapBoard(boardId, fn) {
  setState({ boards: state.boards.map(b => b.id === boardId ? fn(b) : b) });
}

export function setMemberRole(boardId, userId, role) {
  mapBoard(boardId, b => ({ ...b, roles: { ...b.roles, [userId]: role }, ...(userId === state.userId && { myRole: role }) }));
  return persist(() => expectRows(supabase.from('board_members').update({ role }).eq('board_id', boardId).eq('user_id', userId), 'user_id'));
}

export async function removeMember(boardId, userId) {
  mapBoard(boardId, b => {
    const { [userId]: _r, ...roles } = b.roles;
    return { ...b, members: b.members.filter(id => id !== userId), roles };
  });
  // Trigger atamaları temizler; kartları tazele
  const ok = await persist(() => expectRows(supabase.from('board_members').delete().eq('board_id', boardId).eq('user_id', userId), 'user_id'));
  if (ok && state.activeBoardId === boardId) loadBoard(boardId);
  return ok;
}

/** Board'dan kendin ayrıl (owner ayrılamaz) */
export async function leaveBoard(boardId) {
  const ok = await persist(() => expectRows(supabase.from('board_members').delete().eq('board_id', boardId).eq('user_id', state.userId), 'user_id'));
  if (!ok) return false;
  const remaining = state.boards.filter(b => b.id !== boardId);
  const { [boardId]: _l, ...listsByBoard } = state.listsByBoard;
  const nextId = state.activeBoardId === boardId ? (remaining[0]?.id ?? null) : state.activeBoardId;
  setState({ boards: remaining, listsByBoard, activeBoardId: nextId, openCardId: null });
  if (nextId && !state.listsByBoard[nextId]) loadBoard(nextId);
  return true;
}

// ---------- Yıldız ----------

export function toggleStar(boardId) {
  const board = state.boards.find(b => b.id === boardId);
  if (!board) return;
  const starred = !board.starred;
  mapBoard(boardId, b => ({ ...b, starred }));
  return persist(() => starred
    ? supabase.from('board_stars').insert({ board_id: boardId })
    : expectRows(supabase.from('board_stars').delete().eq('board_id', boardId).eq('user_id', state.userId), 'board_id'));
}

// ---------- Profil ----------

/** Ad ve avatar rengini günceller */
export function updateProfile({ name, color }) {
  const me = state.people[state.userId];
  const patch = { full_name: name, avatar_color: color };
  setState({
    userName: name,
    people: { ...state.people, [state.userId]: { ...me, id: state.userId, name, color, initials: initialsOf(name), email: state.userEmail } },
  });
  return persist(() => expectRows(supabase.from('profiles').update(patch).eq('id', state.userId)));
}

// ---------- Yetki yardımcıları (arayüzde buton göster/gizle) ----------

/** Liste/kart/yorum yazabilir mi (viewer değil) */
export function canEdit(board = getActiveBoard()) {
  return !!board && board.myRole !== 'viewer';
}

export function canAdmin(board = getActiveBoard()) {
  return board?.myRole === 'owner' || board?.myRole === 'admin';
}

export function isOwner(board = getActiveBoard()) {
  return board?.myRole === 'owner';
}
