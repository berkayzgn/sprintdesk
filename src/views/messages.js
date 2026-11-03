/**
 * Sağ alttaki mesaj çekmecesi. İskelet bir kez kurulur, yalnızca liste ve
 * mesaj alanı yeniden çizilir; böylece yazılan mesaj ve arama kaybolmaz.
 */
import { state } from '../core/state.js';
import { escHtml, cssColor, relativeTime, ICONS } from '../lib/helpers.js';
import {
  social,
  subscribeSocial,
  person,
  openChat,
  closeChat,
  setDrawer,
  sendMessage,
  unreadMessages,
  markRead,
  dmFileUrl,
} from '../core/social.js';
import { MAX_DM_FILE_BYTES } from '../core/storage.js';
import { chatSkeleton } from '../components/skeleton.js';
import { showToast } from '../components/toast.js';

const CLIP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
const FILE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
const CHAT_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const BACK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
const SEND = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>`;
const CHEVRON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`;

const KB = 1024;
const MB = 1024 * 1024;
const INPUT_MAX_HEIGHT = 120;
const BOTTOM_SNAP_PX = 60; // alta bu kadar yakınsa yeni mesajda aşağı kaydırılır

const fmtSize = b => (b < MB ? `${Math.max(1, Math.round(b / KB))} KB` : `${(b / MB).toFixed(1)} MB`);
const clockTime = d => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

const avatar = (p, size = 36) =>
  `<span class="dm-avatar" style="width:${size}px;height:${size}px;background:${cssColor(p.color)};font-size:${Math.round(size * 0.34)}px">${escHtml(p.initials)}</span>`;

function timeLabel(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? clockTime(d) : relativeTime(iso);
}

let root = null;
let pendingFile = null;
let lastChat = null;

function initMessages() {
  if (root) return;
  root = document.createElement('div');
  root.id = 'dm-dock';
  root.innerHTML = `
    <section class="dm-panel" aria-label="Mesajlar">
      <header class="dm-head">
        <button type="button" class="dm-head-main" data-act="toggle">
          ${CHAT_ICON}<span class="dm-head-title">Mesajlar</span><span class="dm-badge hidden"></span>
        </button>
        <button type="button" class="dm-icon-btn dm-chevron" data-act="toggle" aria-label="Aç/kapat">${CHEVRON}</button>
      </header>
      <div class="dm-body">
        <div class="dm-list-view">
          <div class="dm-search"><input type="search" class="dm-search-inp" placeholder="Kişi ara ve mesaj gönder…" aria-label="Kişi ara"></div>
          <div class="dm-list" role="list"></div>
        </div>
        <div class="dm-chat-view hidden">
          <div class="dm-chat-head">
            <button type="button" class="dm-icon-btn" data-act="back" aria-label="Geri" title="Geri">${BACK}</button>
            <span class="dm-chat-who"></span>
          </div>
          <div class="dm-messages" aria-live="polite"></div>
          <div class="dm-pending hidden"></div>
          <form class="dm-composer">
            <label class="dm-attach" title="Dosya ya da görsel ekle (yapıştırabilir ya da sürükleyebilirsin)" aria-label="Dosya ekle">${CLIP}<input type="file" class="dm-file" hidden></label>
            <textarea class="dm-input" rows="1" maxlength="4000" placeholder="Mesaj yaz… (Enter ile gönder)"></textarea>
            <button type="submit" class="dm-send" aria-label="Gönder" title="Gönder">${SEND}</button>
          </form>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(root);

  const searchInp = root.querySelector('.dm-search-inp');
  const input = root.querySelector('.dm-input');

  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'toggle') {
      setDrawer(!social.drawerOpen);
      return;
    }
    if (act === 'back') {
      closeChat();
      return;
    }
    const item = e.target.closest('.dm-item');
    if (item) {
      searchInp.value = '';
      openChat(item.dataset.userId);
    }
  });
  searchInp.addEventListener('input', () => renderList());

  const pendingEl = root.querySelector('.dm-pending');
  const setPending = file => {
    const prevImg = pendingEl.querySelector('img');
    if (prevImg?.src) URL.revokeObjectURL(prevImg.src);
    // Görseller gönderilirken küçültüleceği için sınır sonra denetlenir
    if (file && file.size > MAX_DM_FILE_BYTES && !file.type.startsWith('image/')) {
      showToast('Dosya çok büyük (en fazla 15 MB).', 'error');
      file = null;
    }
    pendingFile = file;
    pendingEl.classList.toggle('hidden', !file);
    pendingEl.innerHTML = file
      ? `
      ${file.type.startsWith('image/') ? `<img src="${URL.createObjectURL(file)}" alt="">` : `<span class="dm-pending-ico">${FILE}</span>`}
      <span class="dm-pending-name">${escHtml(file.name || 'Görsel')}<small>${fmtSize(file.size)}</small></span>
      <button type="button" class="dm-icon-btn" data-act="unattach" aria-label="Eki kaldır">${ICONS.x}</button>`
      : '';
    if (file) input.focus();
  };
  root.querySelector('.dm-file').addEventListener('change', e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setPending(f);
  });
  pendingEl.addEventListener('click', e => {
    if (e.target.closest('[data-act="unattach"]')) setPending(null);
  });
  input.addEventListener('paste', e => {
    const f = [...(e.clipboardData?.files || [])][0];
    if (f) {
      e.preventDefault();
      setPending(f);
    }
  });
  const chatView = root.querySelector('.dm-chat-view');
  chatView.addEventListener('dragover', e => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      chatView.classList.add('is-drop');
    }
  });
  chatView.addEventListener('dragleave', e => {
    if (!chatView.contains(e.relatedTarget)) chatView.classList.remove('is-drop');
  });
  chatView.addEventListener('drop', e => {
    chatView.classList.remove('is-drop');
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      e.preventDefault();
      setPending(f);
    }
  });

  let sending = false;
  const submit = async () => {
    const text = input.value;
    if ((!text.trim() && !pendingFile) || !social.chatWith || sending) return;
    const file = pendingFile;
    input.value = '';
    autoGrow();
    setPending(null);
    sending = true;
    const ok = await sendMessage(social.chatWith, text, file);
    sending = false;
    if (!ok) {
      if (text) input.value = text;
      if (file && !pendingFile) setPending(file);
    }
  };
  root.querySelector('.dm-composer').addEventListener('submit', e => {
    e.preventDefault();
    submit();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT)}px`;
  };
  input.addEventListener('input', autoGrow);

  root.classList.add('hidden');
  subscribeSocial(render);
}

/** Ana render döngüsünden çağrılır; yalnızca oturuma göre görünürlüğü ayarlar */
export function syncMessagesDock() {
  if (!root) initMessages();
  const visible = state.authed && !state.mustChangePassword;
  if (root.classList.contains('hidden') === visible) {
    root.classList.toggle('hidden', !visible);
    if (visible) render();
  }
}

function render() {
  if (!root || root.classList.contains('hidden')) return;

  root.classList.toggle('is-open', social.drawerOpen);
  const unread = unreadMessages();
  const badge = root.querySelector('.dm-badge');
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.classList.toggle('hidden', !unread);

  const inChat = !!social.chatWith;
  root.querySelector('.dm-list-view').classList.toggle('hidden', inChat);
  root.querySelector('.dm-chat-view').classList.toggle('hidden', !inChat);

  if (inChat) renderChat();
  else renderList();
  lastChat = social.chatWith;
}

function renderList() {
  const q = root.querySelector('.dm-search-inp').value.trim().toLocaleLowerCase('tr');
  const list = root.querySelector('.dm-list');
  const me = state.userId;
  const convIds = new Set(social.conversations.map(c => c.otherId));

  let items;
  if (q) {
    items = Object.values(social.directory)
      .filter(
        p => p.id !== me && (p.name.toLocaleLowerCase('tr').includes(q) || (p.email || '').toLowerCase().includes(q)),
      )
      .map(p => ({ p, conv: social.conversations.find(c => c.otherId === p.id) }));
  } else {
    items = social.conversations.map(c => ({ p: person(c.otherId), conv: c }));
    // Konuşma olmayan kişiler de altta listelenir, arama yapmadan yazılabilsin
    const others = Object.values(social.directory).filter(p => p.id !== me && !convIds.has(p.id));
    items.push(...others.map(p => ({ p, conv: null })));
  }

  list.innerHTML = items.length
    ? items
        .map(
          ({ p, conv }, i) => `
    ${!q && !conv && (i === 0 || items[i - 1].conv) ? '<div class="dm-section">Ofisteki kişiler</div>' : ''}
    <button type="button" class="dm-item ${conv?.unread ? 'is-unread' : ''}" data-user-id="${escHtml(p.id)}" role="listitem">
      ${avatar(p)}
      <span class="dm-item-text">
        <span class="dm-item-top">
          <span class="dm-item-name">${escHtml(p.name)}</span>
          ${conv ? `<span class="dm-item-time">${escHtml(timeLabel(conv.lastAt))}</span>` : ''}
        </span>
        <span class="dm-item-last">${conv ? `${conv.lastFromMe ? 'Sen: ' : ''}${escHtml(conv.lastBody)}` : escHtml(p.email || '')}</span>
      </span>
      ${conv?.unread ? `<span class="dm-item-unread">${conv.unread}</span>` : ''}
    </button>`,
        )
        .join('')
    : `<div class="dm-empty">${q ? 'Bu isimde kimse yok.' : 'Henüz kimse yok.'}</div>`;
}

function renderChat() {
  if (social.drawerOpen && social.conversations.find(c => c.otherId === social.chatWith)?.unread)
    markRead(social.chatWith);
  const p = person(social.chatWith);
  root.querySelector('.dm-chat-who').innerHTML = `${avatar(p, 30)}<span>${escHtml(p.name)}</span>`;
  const box = root.querySelector('.dm-messages');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < BOTTOM_SNAP_PX;
  const shouldScroll = () => atBottom || lastChat !== social.chatWith;
  const msgs = social.messages[social.chatWith];
  let lastDay = '';
  box.innerHTML = !msgs
    ? chatSkeleton()
    : !msgs.length
      ? `<div class="dm-empty">${escHtml(p.name)} ile ilk mesajını yaz 👋</div>`
      : msgs
          .map(m => {
            const day = new Date(m.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
            const sep = day !== lastDay ? `<div class="dm-day">${escHtml(day)}</div>` : '';
            lastDay = day;
            const mine = m.from === state.userId;
            const att = !m.file
              ? ''
              : m.file.mime.startsWith('image/')
                ? `<a class="dm-img" data-path="${escHtml(m.file.path)}" target="_blank" rel="noopener"><img alt="${escHtml(m.file.name)}"></a>`
                : `<a class="dm-filechip" data-path="${escHtml(m.file.path)}" target="_blank" rel="noopener" download="${escHtml(m.file.name)}">${FILE}<span>${escHtml(m.file.name)}<small>${fmtSize(m.file.size)}</small></span></a>`;
            return `${sep}<div class="dm-msg ${mine ? 'is-mine' : ''}">${att}${m.body ? `<div class="dm-bubble">${escHtml(m.body)}</div>` : ''}<span class="dm-time">${clockTime(new Date(m.createdAt))}</span></div>`;
          })
          .join('');
  box.querySelectorAll('[data-path]').forEach(async a => {
    const url = await dmFileUrl(a.dataset.path);
    if (!url) return;
    a.href = url;
    const img = a.querySelector('img');
    if (img) {
      img.addEventListener(
        'load',
        () => {
          if (shouldScroll()) box.scrollTop = box.scrollHeight;
        },
        { once: true },
      );
      img.src = url;
    }
  });
  if (shouldScroll()) box.scrollTop = box.scrollHeight;
  if (lastChat !== social.chatWith) root.querySelector('.dm-input').focus();
}
