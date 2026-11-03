/**
 * Mesajlar, bildirimler ve topluluk. Board state'inden ayrı tutulur ki mesaj gelince
 * tüm board yeniden çizilmesin. RLS sayesinde realtime'da yalnızca bize ait satırlar gelir.
 */
import { supabase } from './supabase.js';
import { state } from './state.js';
import { showToast } from '../components/toast.js';
import { initialsOf } from '../lib/helpers.js';
import {
  BUCKETS,
  MAX_DM_FILE_BYTES,
  FileTooLargeError,
  compressImage,
  safeFileName,
  signedUrl,
  uploadObject,
  uploadUserImage,
  removeObjects,
} from './storage.js';
import logoUrl from '../assets/logo.webp';

const POSTS_PAGE = 40;
const NOTIFICATIONS_LIMIT = 50;
const MESSAGES_LIMIT = 100;
const MAX_MESSAGE_LENGTH = 4000;
const TOAST_MS = 5000;

const MSG_COLS =
  'id, sender_id, recipient_id, body, created_at, read_at, attachment_path, attachment_name, attachment_mime, attachment_size';
const POST_COLS = 'id, author_id, body, image_path, is_announcement, created_at';

export const social = {
  directory: {}, // userId -> { id, name, initials, color, email, isAdmin }
  conversations: [], // [{ otherId, lastBody, lastAt, lastFromMe, unread }]
  messages: {}, // otherId -> [{ id, from, to, body, createdAt, readAt, file }], eskiden yeniye
  notifications: [], // en yeni önce
  posts: [], // en yeni önce
  postsLoaded: false,
  postsMore: true,
  drawerOpen: false,
  chatWith: null, // açık sohbetteki kişinin id'si
  unseenPosts: 0,
  // eventsVersion: events tablosu her değiştiğinde artar (bkz. calendar.js)
};

const listeners = new Set();
let queued = false;

export function subscribeSocial(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Aynı tick'teki değişiklikleri tek bildirime toplar */
function emitSocial() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    listeners.forEach(fn => fn(social));
  });
}

export const unreadMessages = () => social.conversations.reduce((n, c) => n + c.unread, 0);
export const unreadNotifications = () => social.notifications.filter(n => !n.readAt).length;

export function person(id) {
  return social.directory[id] || state.people[id] || { id, name: 'Bilinmeyen', initials: '?', color: '#888' };
}

export const mapNotification = n => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  boardId: n.board_id,
  cardId: n.card_id,
  actorId: n.actor_id,
  createdAt: n.created_at,
  readAt: n.read_at,
});

const mapMessage = m => ({
  id: m.id,
  from: m.sender_id,
  to: m.recipient_id,
  body: m.body,
  createdAt: m.created_at,
  readAt: m.read_at,
  file: m.attachment_path
    ? {
        path: m.attachment_path,
        name: m.attachment_name || 'Dosya',
        mime: m.attachment_mime || '',
        size: m.attachment_size || 0,
      }
    : null,
});

const mapPost = p => ({
  id: p.id,
  authorId: p.author_id,
  body: p.body,
  imagePath: p.image_path,
  isAnnouncement: p.is_announcement,
  createdAt: p.created_at,
});

const msgPreview = m => m.body || `📎 ${m.file?.name || 'Dosya'}`;

export const dmFileUrl = path => signedUrl(BUCKETS.dm, path);

// ---------- Yükleme ----------

async function loadDirectory() {
  const { data, error } = await supabase.rpc('list_directory');
  if (error) {
    console.error('[social] rehber', error);
    return;
  }
  social.directory = Object.fromEntries(
    data.map(p => {
      const name = p.full_name || p.email.split('@')[0];
      return [
        p.id,
        { id: p.id, name, initials: initialsOf(name), color: p.avatar_color, email: p.email, isAdmin: p.is_admin },
      ];
    }),
  );
}

async function loadConversations() {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) {
    console.error('[social] konuşmalar', error);
    return;
  }
  social.conversations = data
    .map(c => ({
      otherId: c.other_id,
      lastBody: c.last_body,
      lastAt: c.last_at,
      lastFromMe: c.last_from_me,
      // Açık sohbet okunmuş sayılır; okundu isteği henüz sunucuya ulaşmamış olabilir
      unread: social.drawerOpen && social.chatWith === c.other_id ? 0 : c.unread,
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  emitSocial();
}

async function loadNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, board_id, card_id, actor_id, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(NOTIFICATIONS_LIMIT);
  if (error) {
    console.error('[social] bildirimler', error);
    return;
  }
  social.notifications = data.map(mapNotification);
  emitSocial();
}

// ---------- Mesajlar ----------

export async function openChat(otherId) {
  social.drawerOpen = true;
  social.chatWith = otherId;
  emitSocial();
  if (!social.messages[otherId]) {
    const me = state.userId;
    const { data, error } = await supabase
      .from('direct_messages')
      .select(MSG_COLS)
      .or(`and(sender_id.eq.${me},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me})`)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_LIMIT);
    if (error) {
      console.error('[social] mesajlar', error);
      showToast('Mesajlar yüklenemedi.', 'error');
      return;
    }
    // Yükleme sırasında gönderilen / gelen mesajlar kaybolmasın diye birleştirilir
    const fetched = data.map(mapMessage).reverse();
    const seen = new Set(fetched.map(m => m.id));
    const local = (social.messages[otherId] || []).filter(m => !seen.has(m.id));
    social.messages[otherId] = [...fetched, ...local].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  markRead(otherId);
  emitSocial();
}

export function closeChat() {
  social.chatWith = null;
  emitSocial();
}

export function setDrawer(open) {
  social.drawerOpen = open;
  if (!open) social.chatWith = null;
  emitSocial();
}

export async function markRead(otherId) {
  const conv = social.conversations.find(c => c.otherId === otherId);
  if (!conv?.unread) return;
  conv.unread = 0;
  emitSocial();
  await supabase.rpc('mark_conversation_read', { p_other: otherId });
}

export async function sendMessage(otherId, body, file = null) {
  const text = body.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!text && !file) return false;
  const id = crypto.randomUUID();
  let row = { id, recipient_id: otherId, body: text };
  let localFile = null;
  if (file) {
    const upload = file.type.startsWith('image/') ? await compressImage(file) : file;
    if (upload.size > MAX_DM_FILE_BYTES) {
      showToast('Dosya çok büyük (en fazla 15 MB).', 'error');
      return false;
    }
    const path = `${state.userId}/${otherId}/${id}-${safeFileName(file.name)}`;
    try {
      await uploadObject(BUCKETS.dm, path, upload);
    } catch (err) {
      console.error('[social] dosya yüklenemedi', err);
      showToast('Dosya yüklenemedi.', 'error');
      return false;
    }
    row = {
      ...row,
      attachment_path: path,
      attachment_name: file.name || 'Dosya',
      attachment_mime: upload.type || '',
      attachment_size: upload.size,
    };
    localFile = { path, name: row.attachment_name, mime: row.attachment_mime, size: upload.size };
  }
  const msg = {
    id,
    from: state.userId,
    to: otherId,
    body: text,
    createdAt: new Date().toISOString(),
    readAt: null,
    file: localFile,
  };
  (social.messages[otherId] ||= []).push(msg);
  bumpConversation(otherId, msgPreview(msg), msg.createdAt, true, false);
  emitSocial();
  const { error } = await supabase.from('direct_messages').insert(row);
  if (error) {
    if (row.attachment_path) removeObjects(BUCKETS.dm, [row.attachment_path]);
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
  if (!conv) {
    conv = { otherId, unread: 0 };
    social.conversations.push(conv);
  }
  Object.assign(conv, { lastBody: body, lastAt: at, lastFromMe: fromMe });
  if (incoming) conv.unread += 1;
  social.conversations.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

function onIncomingMessage(row) {
  const msg = mapMessage(row);
  if (msg.from === state.userId) return; // başka sekmeden kendi mesajımızın yankısı
  const list = social.messages[msg.from];
  if (list && !list.some(m => m.id === msg.id)) list.push(msg);
  const preview = msgPreview(msg);
  const viewing = social.drawerOpen && social.chatWith === msg.from && document.visibilityState === 'visible';
  bumpConversation(msg.from, preview, msg.createdAt, false, !viewing);
  if (viewing) {
    supabase.rpc('mark_conversation_read', { p_other: msg.from });
  } else {
    const senderName = person(msg.from).name;
    showToast(`💬 ${senderName}: ${preview.slice(0, 80)}`, 'info', TOAST_MS);
    browserNotify(`${senderName} mesaj gönderdi`, preview, () => openChat(msg.from));
  }
  emitSocial();
}

// ---------- Bildirimler ----------

export async function markNotificationsRead() {
  const ids = social.notifications.filter(n => !n.readAt).map(n => n.id);
  if (!ids.length) return;
  const now = new Date().toISOString();
  social.notifications.forEach(n => {
    n.readAt ||= now;
  });
  emitSocial();
  await supabase.from('notifications').update({ read_at: now }).in('id', ids);
}

export async function clearNotifications() {
  social.notifications = [];
  emitSocial();
  await supabase.from('notifications').delete().eq('user_id', state.userId);
}

function onIncomingNotification(row) {
  const notification = mapNotification(row);
  if (social.notifications.some(n => n.id === notification.id)) return;
  social.notifications = [notification, ...social.notifications].slice(0, NOTIFICATIONS_LIMIT);
  const { title, body } = notification;
  showToast(`🔔 ${title}${body ? ` — ${body.slice(0, 60)}` : ''}`, 'info', TOAST_MS);
  browserNotify(title, body);
  emitSocial();
}

/** Ayarlar ekranında açılıp kapatılabilen bildirim türleri */
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

/** Tarayıcı bildirimi: yalnızca izin verildiyse ve sekme arka plandaysa */
function browserNotify(title, body, onClick) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    const notification = new Notification(title, { body: (body || '').slice(0, 140), icon: logoUrl, tag: 'kynctask' });
    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
  } catch {
    /* desteklenmiyor */
  }
}

// ---------- Topluluk ----------

export async function loadPosts(more = false) {
  let query = supabase
    .from('community_posts')
    .select(POST_COLS)
    .order('created_at', { ascending: false })
    .limit(POSTS_PAGE);
  const oldest = social.posts[social.posts.length - 1];
  if (more && oldest) query = query.lt('created_at', oldest.createdAt);
  const { data, error } = await query;
  if (error) {
    console.error('[social] topluluk', error);
    showToast('Gönderiler yüklenemedi.', 'error');
    return;
  }
  const mapped = data.map(mapPost);
  social.posts = more ? [...social.posts, ...mapped] : mapped;
  social.postsMore = data.length === POSTS_PAGE;
  social.postsLoaded = true;
  emitSocial();
}

export const postImageUrl = path => signedUrl(BUCKETS.community, path);

export async function createPost({ body, image, announcement }) {
  let imagePath = null;
  if (image) {
    try {
      imagePath = await uploadUserImage(BUCKETS.community, state.userId, image);
    } catch (err) {
      if (err instanceof FileTooLargeError) showToast('Görsel çok büyük (en fazla 5 MB).', 'error');
      else {
        console.error('[social] görsel yüklenemedi', err);
        showToast('Görsel yüklenemedi.', 'error');
      }
      return false;
    }
  }
  const { data, error } = await supabase
    .from('community_posts')
    .insert({ body: body.trim(), image_path: imagePath, is_announcement: !!announcement })
    .select(POST_COLS)
    .single();
  if (error) {
    console.error('[social] gönderi', error);
    if (imagePath) removeObjects(BUCKETS.community, [imagePath]);
    showToast('Paylaşılamadı, tekrar dene.', 'error');
    return false;
  }
  if (!social.posts.some(p => p.id === data.id)) social.posts.unshift(mapPost(data));
  emitSocial();
  return true;
}

export async function deletePost(post) {
  const { error } = await supabase.from('community_posts').delete().eq('id', post.id);
  if (error) {
    showToast('Silinemedi.', 'error');
    return;
  }
  if (post.imagePath) removeObjects(BUCKETS.community, [post.imagePath]);
  social.posts = social.posts.filter(p => p.id !== post.id);
  emitSocial();
}

function onPostChange(payload) {
  if (payload.eventType === 'INSERT') {
    const post = mapPost(payload.new);
    if (social.posts.some(p => p.id === post.id)) return;
    social.posts.unshift(post);
    const seen = post.authorId === state.userId || state.page === 'community';
    if (!seen) social.unseenPosts = (social.unseenPosts || 0) + 1;
  } else if (payload.eventType === 'DELETE') {
    social.posts = social.posts.filter(p => p.id !== payload.old.id);
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
  let subscribedOnce = false;
  channel = supabase
    .channel('kynctask-social')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${me}` },
      p => onIncomingMessage(p.new),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` },
      p => onIncomingNotification(p.new),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts' }, onPostChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
      social.eventsVersion = (social.eventsVersion || 0) + 1;
      emitSocial();
    })
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      // Yeniden bağlanınca arada kaçanları tazele
      if (subscribedOnce) {
        loadConversations();
        loadNotifications();
      }
      subscribedOnce = true;
    });
  emitSocial();
}

export function stopSocial() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  Object.assign(social, {
    directory: {},
    conversations: [],
    messages: {},
    notifications: [],
    posts: [],
    postsLoaded: false,
    postsMore: true,
    drawerOpen: false,
    chatWith: null,
    unseenPosts: 0,
  });
  emitSocial();
}
