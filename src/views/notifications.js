/**
 * Üst çubuk eylemleri (tema anahtarı + zil), bildirim açılır listesi ve Bildirimler sayfası.
 * Bildirimler sunucuda trigger'larla oluşur; burada yalnızca okunur, okundu sayılır, silinir.
 */
import { state, setState } from '../core/state.js';
import { escHtml, relativeTime, ICONS } from '../lib/helpers.js';
import {
  social,
  subscribeSocial,
  unreadNotifications,
  markNotificationsRead,
  clearNotifications,
  NOTIFY_KINDS,
  loadNotifyPrefs,
  saveNotifyPrefs,
  mapNotification,
} from '../core/social.js';
import { supabase } from '../core/supabase.js';
import { selectBoard } from '../core/store.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/dialog.js';

const SUN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const MOON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const GEAR = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const BELL = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;

const PAGE_SIZE = 50;
const MARK_READ_DELAY_MS = 1200;
const POP_MARGIN = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const KIND_ICON = {
  assigned: '👤',
  comment: '💬',
  new_card: '🆕',
  completed: '✅',
  board_added: '📋',
  announcement: '📢',
  event: '📅',
  note_shared: '📝',
};
const KIND_LABEL = {
  assigned: 'Görev',
  comment: 'Yorum',
  new_card: 'Yeni görev',
  completed: 'Tamamlandı',
  board_added: 'Board',
  announcement: 'Duyuru',
  event: 'Takvim',
  note_shared: 'Not',
};
/** Board/kart yerine başka sayfaya yönlenen türler */
const KIND_PAGE = { announcement: 'community', event: 'calendar', note_shared: 'notes' };
const kindIcon = kind => KIND_ICON[kind] || '🔔';

let pop = null;

/** Üst çubuğun sağı: tema anahtarı + bildirim zili (her ekranda aynı) */
export function headerActionsHTML() {
  return `<button type="button" class="theme-toggle" data-theme-toggle role="switch" aria-label="Koyu tema" title="Açık / koyu tema">
      <span class="theme-toggle-knob"><span class="tt-sun">${SUN}</span><span class="tt-moon">${MOON}</span></span>
    </button>${bellHTML()}`;
}
document.addEventListener('click', e => {
  if (!e.target.closest?.('[data-theme-toggle]')) return;
  setState({ theme: state.theme === 'dark' ? 'light' : 'dark' });
});

export function syncThemeToggle(theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelectorAll('[data-theme-toggle]')
    .forEach(b => b.setAttribute('aria-checked', String(theme === 'dark')));
}

function bellHTML() {
  return `<button type="button" class="header-bell" data-notif-btn title="Bildirimler" aria-label="Bildirimler">${BELL}<span class="notif-badge header-badge hidden"></span></button>`;
}
document.addEventListener('click', e => {
  const btn = e.target.closest?.('[data-notif-btn]');
  if (!btn) return;
  e.stopPropagation();
  openNotifications(btn);
});

// Yeni çizilen zillere güncel sayıyı yaz
new MutationObserver(() => {
  if (document.querySelector('.notif-badge:not([data-synced])')) {
    syncBellBadge();
    document.querySelectorAll('.notif-badge').forEach(b => {
      b.dataset.synced = '1';
    });
  }
}).observe(document.body, { childList: true, subtree: true });

function closePop() {
  pop?.cleanup();
  pop?.el.remove();
  pop = null;
}

function syncBellBadge() {
  const n = unreadNotifications();
  document.querySelectorAll('.notif-badge').forEach(b => {
    b.textContent = n > 99 ? '99+' : String(n);
    b.classList.toggle('hidden', !n);
  });
}
subscribeSocial(() => {
  syncBellBadge();
  pop?.render();
  if (state.page === 'notifications') paintPage();
});

function goTo(n) {
  closePop();
  const page = KIND_PAGE[n.kind];
  if (page) {
    setState({ page, navOpen: false });
    return;
  }
  if (!n.boardId) return;
  if (!state.boards.some(b => b.id === n.boardId)) return;
  setState({ page: 'boards' });
  if (state.activeBoardId !== n.boardId) selectBoard(n.boardId);
  if (n.cardId) setState({ openCardId: n.cardId });
}

function openNotifications(anchor) {
  if (pop) {
    closePop();
    return;
  }
  const el = document.createElement('div');
  el.className = 'notif-pop';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Bildirimler');
  document.body.appendChild(el);

  const render = () => {
    const items = social.notifications;
    el.innerHTML = `
      <div class="notif-head">
        <span>Bildirimler</span>
        <div class="notif-head-actions">
          ${items.length ? '<button type="button" class="notif-link" data-act="clear">Hepsini temizle</button>' : ''}
          <button type="button" class="settings-close" data-act="close" aria-label="Kapat">${ICONS.x}</button>
        </div>
      </div>
      <div class="notif-list">
        ${
          items.length
            ? items
                .map(
                  n => `
          <button type="button" class="notif-item ${n.readAt ? '' : 'is-unread'}" data-id="${n.id}">
            <span class="notif-icon">${kindIcon(n.kind)}</span>
            <span class="notif-text">
              <span class="notif-title">${escHtml(n.title)}</span>
              ${n.body ? `<span class="notif-body">${escHtml(n.body)}</span>` : ''}
              <span class="notif-time">${escHtml(relativeTime(n.createdAt))}</span>
            </span>
          </button>`,
                )
                .join('')
            : '<div class="notif-empty">Henüz bildirim yok.<br><small>Sana görev verildiğinde, yorum yapıldığında ya da duyuru geldiğinde burada görünür.</small></div>'
        }
      </div>
      <button type="button" class="notif-all" data-act="page">Tüm bildirimler ve ayarlar →</button>`;
  };
  render();

  el.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') {
      closePop();
      return;
    }
    if (act === 'clear') {
      clearNotifications();
      return;
    }
    if (act === 'page') {
      closePop();
      setState({ page: 'notifications', navOpen: false, openCardId: null });
      return;
    }
    const item = e.target.closest('.notif-item');
    if (item) goTo(social.notifications.find(n => n.id === item.dataset.id));
  });

  // Zilin altında, sağ kenara hizalı
  const r = anchor.getBoundingClientRect();
  const maxLeft = window.innerWidth - el.offsetWidth - POP_MARGIN;
  el.style.top = `${Math.min(r.bottom + 8, window.innerHeight - el.offsetHeight - POP_MARGIN)}px`;
  el.style.left = `${Math.max(POP_MARGIN, Math.min(r.right - el.offsetWidth, maxLeft))}px`;

  const onDown = e => {
    if (!el.contains(e.target) && !anchor.contains(e.target)) closePop();
  };
  const onKey = e => {
    if (e.key === 'Escape') closePop();
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey);
  pop = {
    el,
    render,
    cleanup: () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    },
  };
  // Okunmamış vurgusu bir an görünsün
  setTimeout(markNotificationsRead, MARK_READ_DELAY_MS);
}

let pageHost = null;
let filter = 'all'; // 'all' | 'unread'
let older = []; // "Daha eski" ile yüklenenler
let olderDone = false;

const allNotifications = () => [...social.notifications, ...older];

function dayGroup(iso) {
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  if (diff < 7) return 'Bu hafta';
  return 'Daha eski';
}

export function renderNotificationsPage(el, headerActions) {
  if (pageHost === el && el.querySelector('.np')) return;
  pageHost = el;
  older = [];
  olderDone = false;
  el.innerHTML = `
    <div class="np">
      <header class="page-head">
        <button type="button" class="topbar-menu-btn page-menu-btn" aria-label="Menü">${ICONS.menu}</button>
        <div>
          <h1 class="page-title">Bildirimler</h1>
          <p class="page-sub">Sana verilen görevler, yorumlar, duyurular ve davetler.</p>
        </div>
        <span style="flex:1"></span>
        ${headerActions}
      </header>
      <div class="np-toolbar">
        <div class="view-switch" role="radiogroup" aria-label="Filtre">
          <button type="button" class="view-option" data-filter="all" role="radio">Tümü</button>
          <button type="button" class="view-option" data-filter="unread" role="radio">Okunmamış <span class="np-count"></span></button>
        </div>
        <span style="flex:1"></span>
        <button type="button" class="np-btn" data-act="read">✓ Tümünü okundu say</button>
        <button type="button" class="np-btn" data-act="settings">${GEAR}<span>Bildirim ayarları</span></button>
      </div>
      <div class="np-list"></div>
    </div>`;
  el.onclick = async e => {
    if (e.target.closest('.page-menu-btn')) {
      setState({ navOpen: !state.navOpen });
      return;
    }
    const f = e.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      paintPage();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'read') {
      markNotificationsRead();
      return;
    }
    if (act === 'settings') {
      openNotifySettings();
      return;
    }
    if (act === 'clear') {
      if (
        await confirmDialog({
          title: 'Tüm bildirimler silinsin mi?',
          message: 'Bildirim listen boşaltılacak.',
          confirmText: 'Hepsini sil',
          danger: true,
        })
      ) {
        older = [];
        clearNotifications();
      }
      return;
    }
    if (act === 'more') {
      loadOlder();
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      social.notifications = social.notifications.filter(n => n.id !== id);
      older = older.filter(n => n.id !== id);
      paintPage();
      syncBellBadge();
      await supabase.from('notifications').delete().eq('id', id);
      return;
    }
    const item = e.target.closest('.np-item');
    if (item) {
      const n = allNotifications().find(x => x.id === item.dataset.id);
      if (!n) return;
      if (!n.readAt) {
        n.readAt = new Date().toISOString();
        supabase.from('notifications').update({ read_at: n.readAt }).eq('id', n.id);
        syncBellBadge();
      }
      goTo(n);
    }
  };
  paintPage();
}

async function loadOlder() {
  const last = allNotifications().at(-1);
  if (!last) return;
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, board_id, card_id, actor_id, created_at, read_at')
    .lt('created_at', last.createdAt)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (error) {
    showToast('Daha eski bildirimler yüklenemedi.', 'error');
    return;
  }
  older.push(...data.map(mapNotification));
  olderDone = data.length < PAGE_SIZE;
  paintPage();
}

function paintPage() {
  const root = pageHost?.querySelector('.np');
  if (!root || !root.isConnected) return;
  root.querySelectorAll('[data-filter]').forEach(b => {
    const on = b.dataset.filter === filter;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  const unread = unreadNotifications();
  root.querySelector('.np-count').textContent = unread ? String(unread) : '';
  const all = allNotifications();
  const items = filter === 'unread' ? all.filter(n => !n.readAt) : all;
  let lastGroup = '';
  root.querySelector('.np-list').innerHTML = items.length
    ? items
        .map(n => {
          const g = dayGroup(n.createdAt);
          const head = g !== lastGroup ? `<h3 class="np-group">${g}</h3>` : '';
          lastGroup = g;
          return `${head}
      <div class="np-item ${n.readAt ? '' : 'is-unread'}" data-id="${n.id}" role="button" tabindex="0">
        <span class="np-icon">${kindIcon(n.kind)}</span>
        <span class="np-text">
          <span class="np-title">${escHtml(n.title)}</span>
          ${n.body ? `<span class="np-body">${escHtml(n.body)}</span>` : ''}
          <span class="np-meta"><span class="np-kind">${escHtml(KIND_LABEL[n.kind] || 'Bildirim')}</span> · ${escHtml(relativeTime(n.createdAt))}</span>
        </span>
        <button type="button" class="np-del" data-del="${n.id}" title="Bildirimi sil" aria-label="Bildirimi sil">${ICONS.x}</button>
      </div>`;
        })
        .join('') +
      (filter === 'all' && !olderDone && all.length >= PAGE_SIZE
        ? '<button type="button" class="np-more" data-act="more">Daha eski bildirimleri göster</button>'
        : '') +
      (all.length ? '<button type="button" class="np-clear" data-act="clear">Tüm bildirimleri sil</button>' : '')
    : `<div class="np-empty">${filter === 'unread' ? 'Okunmamış bildirimin yok 🎉' : 'Henüz bildirim yok. Sana görev verildiğinde, yorum yapıldığında ya da duyuru geldiğinde burada görünür.'}</div>`;
}

/** Bildirim türü tercihleri + masaüstü bildirimi izni */
async function openNotifySettings() {
  const el = document.createElement('div');
  el.className = 'cal-scrim';
  el.innerHTML = `
    <div class="cal-modal np-settings" role="dialog" aria-modal="true" aria-label="Bildirim ayarları">
      <header class="cal-modal-head"><h2>Bildirim ayarları</h2><button type="button" class="settings-close" data-x aria-label="Kapat">${ICONS.x}</button></header>
      <p class="np-settings-sub">Hangi durumlarda bildirim almak istiyorsun?</p>
      <div class="np-settings-list">
        ${NOTIFY_KINDS.map(k => `<label class="np-toggle"><span>${kindIcon(k.kind)} ${k.label}</span><input type="checkbox" data-kind="${k.kind}" checked disabled><span class="np-switch" aria-hidden="true"></span></label>`).join('')}
      </div>
      ${
        'Notification' in window
          ? `
        <div class="np-desktop">
          <div><b>Masaüstü bildirimleri</b><small>Sekme arka plandayken de bilgisayarın bildirim göstersin.</small></div>
          <button type="button" class="np-btn" data-desktop></button>
        </div>`
          : ''
      }
      <div class="cal-actions"><span style="flex:1"></span><button type="button" class="cal-btn cal-save" data-x>Tamam</button></div>
    </div>`;
  document.body.appendChild(el);
  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('pointerdown', e => {
    if (e.target === el) close();
  });
  el.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));

  let prefs = await loadNotifyPrefs();
  el.querySelectorAll('input[data-kind]').forEach(inp => {
    inp.checked = prefs[inp.dataset.kind] !== false;
    inp.disabled = false;
  });
  el.querySelector('.np-settings-list').addEventListener('change', e => {
    const inp = e.target.closest('input[data-kind]');
    if (!inp) return;
    prefs = { ...prefs, [inp.dataset.kind]: inp.checked };
    saveNotifyPrefs(prefs);
  });
  const desk = el.querySelector('[data-desktop]');
  const syncDesk = () => {
    if (!desk) return;
    const p = Notification.permission;
    desk.textContent = p === 'granted' ? 'Açık ✓' : p === 'denied' ? 'Tarayıcıda engelli' : 'Aç';
    desk.disabled = p !== 'default';
  };
  syncDesk();
  desk?.addEventListener('click', async () => {
    await Notification.requestPermission();
    syncDesk();
  });
}
