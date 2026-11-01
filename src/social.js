// ============================================================
// SOCIAL — Mesajlar, bildirimler, topluluk: veri + realtime
// ============================================================
// Board state'inden ayrı küçük bir store: mesaj gelince bütün board'u
// yeniden çizmemek için kendi abonelik listesi var (subscribeSocial).
// Realtime tek kanal: bana gelen mesajlar, bana gelen bildirimler,
// topluluk gönderileri. RLS sayesinde başkasının satırları gelmez.
// ============================================================
import { supabase } from './supabase.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { initialsOf } from './helpers.js';
import logoUrl from './assets/logo.webp';

const PAGE = 40;

export const social = {
  directory: {},          // userId -> { id, name, initials, color, email, isAdmin }
  conversations: [],      // [{ otherId, lastBody, lastAt, lastFromMe, unread }]
  messages: {},           // otherId -> [{ id, from, to, body, createdAt, readAt }] (eskiden yeniye)
  notifications: [],      // en yeni önce
  posts: [],              // topluluk, en yeni önce
  postsLoaded: false,
  postsMore: true,
  drawerOpen: false,      // mesaj çekmecesi açık mı
  chatWith: null,         // açık sohbetin kişisi
};

const listeners = new Set();
export function subscribeSocial(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let queued = false;
export function emitSocial() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; listeners.forEach(fn => fn(social)); });
}

export const unreadMessages = () => social.conversations.reduce((n, c) => n + c.unread, 0);
export const unreadNotifications = () => social.notifications.filter(n => !n.readAt).length;

export function person(id) {
  return social.directory[id] || state.people[id] || { id, name: 'Bilinmeyen', initials: '?', color: '#888' };
}

// ---------- Yükleme ----------

async function loadDirectory() {
  const { data, error } = await supabase.rpc('list_directory');
  if (error) { console.error('[social] rehber', error); return; }
  social.directory = Object.fromEntries(data.map(p => {
    const name = p.full_name || p.email.split('@')[0];
    return [p.id, { id: p.id, name, initials: initialsOf(name), color: p.avatar_color, email: p.email, isAdmin: p.is_admin }];
  }));
}

export async function loadConversations() {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) { console.error('[social] konuşmalar', error); return; }
  social.conversations = data
    .map(c => ({
      otherId: c.other_id, lastBody: c.last_body, lastAt: c.last_at, lastFromMe: c.last_from_me,
      // Açık sohbet okunmuş sayılır (okundu isteği henüz sunucuya ulaşmamış olabilir)
      unread: social.drawerOpen && social.chatWith === c.other_id ? 0 : c.unread,
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  emitSocial();
}

async function loadNotifications() {
  const { data, error } = await supabase.from('notifications')
    .select('id, kind, title, body, board_id, card_id, actor_id, created_at, read_at')
    .order('created_at', { ascending: false }).limit(50);
  if (error) { console.error('[social] bildirimler', error); return; }
  social.notifications = data.map(mapNotification);
  emitSocial();
}

const mapNotification = n => ({
  id: n.id, kind: n.kind, title: n.title, body: n.body, boardId: n.board_id, cardId: n.card_id,
  actorId: n.actor_id, createdAt: n.created_at, readAt: n.read_at,
});
const mapMessage = m => ({
  id: m.id, from: m.sender_id, to: m.recipient_id, body: m.body, createdAt: m.created_at, readAt: m.read_at,
  file: m.attachment_path ? { path: m.attachment_path, name: m.attachment_name || 'Dosya', mime: m.attachment_mime || '', size: m.attachment_size || 0 } : null,
});
const MSG_COLS = 'id, sender_id, recipient_id, body, created_at, read_at, attachment_path, attachment_name, attachment_mime, attachment_size';
export const MAX_DM_FILE = 15 * 1024 * 1024;
const msgPreview = m => m.body || `📎 ${m.file?.name || 'Dosya'}`;

const dmUrls = new Map(); // path -> imzalı url (1 saat)
export async function dmFileUrl(path) {
  if (dmUrls.has(path)) return dmUrls.get(path);
  const { data } = await supabase.storage.from('dm').createSignedUrl(path, 3600);
  if (data?.signedUrl) dmUrls.set(path, data.signedUrl);
  return data?.signedUrl || '';
}
const mapPost = p => ({ id: p.id, authorId: p.author_id, body: p.body, imagePath: p.image_path, isAnnouncement: p.is_announcement, createdAt: p.created_at });

// ---------- Mesajlar ----------

export async function openChat(otherId) {
  social.drawerOpen = true;
  social.chatWith = otherId;
  emitSocial();
  if (!social.messages[otherId]) {
    const me = state.userId;
    const { data, error } = await supabase.from('direct_messages')
      .select(MSG_COLS)
      .or(`and(sender_id.eq.${me},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me})`)
      .order('created_at', { ascending: false }).limit(100);
    if (error) { console.error('[social] mesajlar', error); showToast('Mesajlar yüklenemedi.', 'error'); return; }
    // Yükleme sürerken gönderilen/gelen mesajlar kaybolmasın: birleştir
    const fetched = data.map(mapMessage).reverse();
    const seen = new Set(fetched.map(m => m.id));
    const local = (social.messages[otherId] || []).filter(m => !seen.has(m.id));
    social.messages[otherId] = [...fetched, ...local].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  markRead(otherId);
  emitSocial();
}

export function closeChat() { social.chatWith = null; emitSocial(); }
export function setDrawer(open) { social.drawerOpen = open; if (!open) social.chatWith = null; emitSocial(); }

export async function markRead(otherId) {
  const conv = social.conversations.find(c => c.otherId === otherId);
  if (!conv?.unread) return;
  conv.unread = 0;
  emitSocial();
  await supabase.rpc('mark_conversation_read', { p_other: otherId });
}

export async function sendMessage(otherId, body, file = null) {
  const text = body.trim().slice(0, 4000);
  if (!text && !file) return false;
  const id = crypto.randomUUID();
  let row = { id, recipient_id: otherId, body: text };
  let localFile = null;
  if (file) {
    const upload = file.type.startsWith('image/') ? await compressImage(file) : file;
    if (upload.size > MAX_DM_FILE) { showToast('Dosya çok büyük (en fazla 15 MB).', 'error'); return false; }
    const safe = (file.name || 'dosya').replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${state.userId}/${otherId}/${id}-${safe}`;
    const { error: upErr } = await supabase.storage.from('dm').upload(path, upload, { contentType: upload.type || 'application/octet-stream' });
    if (upErr) { console.error('[social] dosya', upErr); showToast('Dosya yüklenemedi.', 'error'); return false; }
    row = { ...row, attachment_path: path, attachment_name: file.name || 'Dosya', attachment_mime: upload.type || '', attachment_size: upload.size };
    localFile = { path, name: row.attachment_name, mime: row.attachment_mime, size: upload.size };
  }
  const msg = { id, from: state.userId, to: otherId, body: text, createdAt: new Date().toISOString(), readAt: null, file: localFile };
  (social.messages[otherId] ||= []).push(msg);
  bumpConversation(otherId, msgPreview(msg), msg.createdAt, true, false);
  emitSocial();
  const { error } = await supabase.from('direct_messages').insert(row);
  if (error) {
    if (row.attachment_path) supabase.storage.from('dm').remove([row.attachment_path]);
    console.error('[social] mesaj', error);
    social.messages[otherId] = social.messages[otherId].filter(m => m.id !== msg.id);
    emitSocial();
    showToast('Mesaj gönderilemedi, tekrar dene.', 'error');
    return false;
  }
  return true;
}

function bumpConversation(otherId, body, at, fromMe, incoming) {
  let conv = social.conversations.find(c => c.otherId === otherId);
  if (!conv) { conv = { otherId, unread: 0 }; social.conversations.push(conv); }
  Object.assign(conv, { lastBody: body, lastAt: at, lastFromMe: fromMe });
  if (incoming) conv.unread += 1;
  social.conversations.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

function onIncomingMessage(row) {
  const m = mapMessage(row);
  if (m.from === state.userId) return; // kendi mesajımızın yankısı (başka sekme)
  const list = social.messages[m.from];
  if (list && !list.some(x => x.id === m.id)) list.push(m);
  const viewing = social.drawerOpen && social.chatWith === m.from && document.visibilityState === 'visible';
  bumpConversation(m.from, msgPreview(m), m.createdAt, false, !viewing);
  if (viewing) supabase.rpc('mark_conversation_read', { p_other: m.from });
  else {
    showToast(`💬 ${person(m.from).name}: ${msgPreview(m).slice(0, 80)}`, 'info', 5000);
    browserNotify(`${person(m.from).name} mesaj gönderdi`, msgPreview(m), () => openChat(m.from));
  }
  emitSocial();
}

// ---------- Bildirimler ----------

export async function markNotificationsRead() {
  const ids = social.notifications.filter(n => !n.readAt).map(n => n.id);
  if (!ids.length) return;
  const now = new Date().toISOString();
  social.notifications.forEach(n => { n.readAt ||= now; });
  emitSocial();
  await supabase.from('notifications').update({ read_at: now }).in('id', ids);
}

export async function clearNotifications() {
  social.notifications = [];
  emitSocial();
  await supabase.from('notifications').delete().eq('user_id', state.userId);
}

function onIncomingNotification(row) {
  const n = mapNotification(row);
  if (social.notifications.some(x => x.id === n.id)) return;
  social.notifications.unshift(n);
  social.notifications = social.notifications.slice(0, 50);
  showToast(`🔔 ${n.title}${n.body ? ` — ${n.body.slice(0, 60)}` : ''}`, 'info', 5000);
  browserNotify(n.title, n.body);
  emitSocial();
}

/** Bildirim türleri: ayarlar ekranında aç/kapa */
export const NOTIFY_KINDS = [
  { kind: 'assigned', label: 'Bana görev ya da alt görev verildiğinde' },
  { kind: 'comment', label: 'Görevlerime yorum yapıldığında' },
  { kind: 'new_card', label: 'Board’larıma yeni görev eklendiğinde' },
  { kind: 'completed', label: 'Görevlerimden biri tamamlandığında' },
  { kind: 'board_added', label: 'Bir board’a eklendiğimde' },
  { kind: 'announcement', label: 'Yönetici duyuru yaptığında' },
  { kind: 'event', label: 'Bir toplantıya / etkinliğe eklendiğimde' },
  { kind: 'note_shared', label: 'Biri benimle not paylaştığında' },
];

export async function loadNotifyPrefs() {
  const { data } = await supabase.from('profiles').select('notify_prefs').eq('id', state.userId).single();
  return data?.notify_prefs || {};
}
export async function saveNotifyPrefs(prefs) {
  const { error } = await supabase.from('profiles').update({ notify_prefs: prefs }).eq('id', state.userId);
  if (error) showToast('Ayar kaydedilemedi.', 'error');
}

// Tarayıcı bildirimi: yalnızca izin verildiyse ve sekme arka plandaysa
function browserNotify(title, body, onClick) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    const n = new Notification(title, { body: (body || '').slice(0, 140), icon: logoUrl, tag: 'sprintdesk' });
    n.onclick = () => { window.focus(); onClick?.(); n.close(); };
  } catch { /* desteklenmiyor */ }
}

// ---------- Topluluk ----------

export async function loadPosts(more = false) {
  let query = supabase.from('community_posts')
    .select('id, author_id, body, image_path, is_announcement, created_at')
    .order('created_at', { ascending: false }).limit(PAGE);
  if (more && social.posts.length) query = query.lt('created_at', social.posts[social.posts.length - 1].createdAt);
  const { data, error } = await query;
  if (error) { console.error('[social] topluluk', error); showToast('Gönderiler yüklenemedi.', 'error'); return; }
  const mapped = data.map(mapPost);
  social.posts = more ? [...social.posts, ...mapped] : mapped;
  social.postsMore = data.length === PAGE;
  social.postsLoaded = true;
  emitSocial();
}

const imageUrls = new Map(); // path -> signed url (1 saat)
export async function postImageUrl(path) {
  if (imageUrls.has(path)) return imageUrls.get(path);
  const { data } = await supabase.storage.from('community').createSignedUrl(path, 3600);
  if (data?.signedUrl) imageUrls.set(path, data.signedUrl);
  return data?.signedUrl || '';
}

/** Görseli en fazla 1600px ve ~0.82 kaliteyle küçültür (disk şişmesin) */
export async function compressImage(file) {
  if (file.type === 'image/gif') return file; // animasyon bozulmasın
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.82));
  return blob && blob.size < file.size ? new File([blob], 'image.webp', { type: 'image/webp' }) : file;
}

export async function createPost({ body, image, announcement }) {
  let imagePath = null;
  if (image) {
    const file = await compressImage(image);
    if (file.size > 5 * 1024 * 1024) { showToast('Görsel çok büyük (en fazla 5 MB).', 'error'); return false; }
    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    imagePath = `${state.userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('community').upload(imagePath, file, { contentType: file.type });
    if (error) { console.error('[social] görsel', error); showToast('Görsel yüklenemedi.', 'error'); return false; }
  }
  const { data, error } = await supabase.from('community_posts')
    .insert({ body: body.trim(), image_path: imagePath, is_announcement: !!announcement })
    .select('id, author_id, body, image_path, is_announcement, created_at').single();
  if (error) {
    console.error('[social] gönderi', error);
    if (imagePath) supabase.storage.from('community').remove([imagePath]);
    showToast('Paylaşılamadı, tekrar dene.', 'error');
    return false;
  }
  if (!social.posts.some(p => p.id === data.id)) social.posts.unshift(mapPost(data));
  emitSocial();
  return true;
}

export async function deletePost(post) {
  if (post.imagePath) await supabase.storage.from('community').remove([post.imagePath]);
  const { error } = await supabase.from('community_posts').delete().eq('id', post.id);
  if (error) { showToast('Silinemedi.', 'error'); return; }
  social.posts = social.posts.filter(p => p.id !== post.id);
  emitSocial();
}

function onPostChange(payload) {
  if (payload.eventType === 'INSERT') {
    const p = mapPost(payload.new);
    if (social.posts.some(x => x.id === p.id)) return;
    social.posts.unshift(p);
    social.unseenPosts = (social.unseenPosts || 0) + (p.authorId === state.userId || state.page === 'community' ? 0 : 1);
  } else if (payload.eventType === 'DELETE') {
    social.posts = social.posts.filter(x => x.id !== payload.old.id);
  }
  emitSocial();
}

// ---------- Başlat / durdur ----------

let channel = null;

export async function startSocial() {
  stopSocial();
  const me = state.userId;
  if (!me) return;
  await loadDirectory();
  loadConversations();
  loadNotifications();
  channel = supabase.channel('sprintdesk-social')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${me}` }, p => onIncomingMessage(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` }, p => onIncomingNotification(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts' }, onPostChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => { social.eventsVersion = (social.eventsVersion || 0) + 1; emitSocial(); })
    .subscribe((status) => {
      // Bağlantı geri gelince kaçanları tazele
      if (status === 'SUBSCRIBED' && channel?.__subscribedOnce) { loadConversations(); loadNotifications(); }
      if (status === 'SUBSCRIBED' && channel) channel.__subscribedOnce = true;
    });
  emitSocial();
}

export function stopSocial() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  Object.assign(social, {
    directory: {}, conversations: [], messages: {}, notifications: [], posts: [],
    postsLoaded: false, postsMore: true, drawerOpen: false, chatWith: null, unseenPosts: 0,
  });
  emitSocial();
}
