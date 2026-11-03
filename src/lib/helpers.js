import { state } from '../core/state.js';
import { attachmentUrl } from '../core/storage.js';
import { dueInfo } from './dates.js';

/** Addan baş harfler: 'Berkay Özgün' → 'BÖ' */
export function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return initials.toLocaleUpperCase('tr');
}

/** Oturumdaki kullanıcının görünen adı, baş harfleri ve avatar rengi */
export function currentUserDisplay(s) {
  const person = s.people[s.userId];
  const name = person?.name || (s.userName || '').trim() || (s.userEmail || '').split('@')[0];
  return { name, initials: initialsOf(name), color: person?.color || null };
}

const UNKNOWN_PERSON = { name: 'Bilinmeyen', initials: '?', color: '#888' };

/** Bilinmeyen id için yer tutucu döner (kişi board'dan ayrılmış olabilir) */
export function personById(id) {
  return state.people[id] || { id, ...UNKNOWN_PERSON };
}

function labelsFor(ids) {
  const labels = state.labelsByBoard[state.activeBoardId] || {};
  return (ids || []).map(id => labels[id]).filter(Boolean);
}

const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;
const WEEK_S = 7 * DAY_S;

/** '5dk önce', '3s önce', '2g önce'; bir haftadan eskiyse tarih */
export function relativeTime(iso) {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (!Number.isFinite(diff) || diff < MINUTE_S) return 'şimdi';
  if (diff < HOUR_S) return `${Math.floor(diff / MINUTE_S)}dk önce`;
  if (diff < DAY_S) return `${Math.floor(diff / HOUR_S)}s önce`;
  if (diff < WEEK_S) return `${Math.floor(diff / DAY_S)}g önce`;
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** DB'den gelen rengi style="" içine basmadan doğrular: alan serbest metin, XSS'e açık. */
export function cssColor(value, fallback = '#6366f1') {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value ?? '') ? value : fallback;
}

const LIGHT_BG_THRESHOLD = 160;

/** Renkli zemin üzerinde okunaklı yazı rengi (açık zeminde koyu yazı) */
export function readableTextOn(hex) {
  let rgb = cssColor(hex).slice(1, 7);
  if (rgb.length === 3) rgb = [...rgb].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(rgb.slice(i, i + 2), 16));
  const brightness = (r * 299 + g * 587 + b * 114) / 1000; // YIQ
  return brightness > LIGHT_BG_THRESHOLD ? '#191b2c' : '#ffffff';
}

export function labelStyle(color) {
  const bg = cssColor(color);
  return `background:${bg};color:${readableTextOn(bg)}`;
}

/** Dar ekranda sidebar çekmeceye dönüşür */
export const compactQuery = window.matchMedia('(max-width: 900px)');

/** Son tarih rozeti için satır içi stil */
const DUE_STYLES = {
  over: 'background:rgba(244,63,94,.15);color:#e0556b',
  today: 'background:rgba(245,158,11,.18);color:#d98410',
  soon: 'background:rgba(245,158,11,.12);color:#c27a0e',
  done: 'background:rgba(34,197,94,.16);color:#1f9d57',
};
const DUE_STYLE_DEFAULT = 'background:var(--accent-soft);color:var(--accent)';

function dueStyleStr(dueState) {
  return DUE_STYLES[dueState] || DUE_STYLE_DEFAULT;
}

/** Açıklamanın düz metni: arama ve "açıklama var mı" kontrolü için */
export function descText(desc) {
  return (desc || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kartın board / liste görünümünde çizilecek özeti */
export function getCardView(c, listId) {
  const labels = labelsFor(c.labels);
  const assignees = (c.assignees || []).map(personById);
  const checklist = c.checklist || [];
  const comments = c.comments || [];
  const attachments = c.attachments || [];
  const total = checklist.length;
  const done = checklist.filter(i => i.done).length;
  const coverAtt = attachments.find(a => a.type === 'image');
  const hasDesc = !!descText(c.desc);
  const due = dueInfo(c.startAt, c.dueAt, c.dueComplete);

  return {
    id: c.id,
    title: c.title,
    listId,
    color: c.color || null,
    completed: !!c.dueComplete,
    labels,
    assignees,
    hasLabels: labels.length > 0,
    hasDesc,
    hasChecklist: total > 0,
    checklistLabel: done + '/' + total,
    checklistStyle:
      total > 0 && done === total
        ? 'background:rgba(34,197,94,.16);color:#1f9d57;padding:3px 7px;border-radius:7px'
        : 'color:var(--text-subtle)',
    commentCount: comments.length,
    hasComments: comments.length > 0,
    attachCount: attachments.length,
    hasAttach: attachments.length > 0,
    cover: coverAtt ? attachmentUrl(coverAtt) : '',
    hasCover: !!coverAtt,
    hasDue: !!due,
    dueLabel: due ? due.label : '',
    dueStyle: due ? dueStyleStr(due.state) : '',
    hasMeta: !!(due || hasDesc || total || comments.length || attachments.length || assignees.length),
  };
}

/** Açık kart modalının görünüm modeli */
export function getOpenCardView(raw, listTitle) {
  if (!raw) return null;
  const checklist = raw.checklist || [];
  const assignees = raw.assignees || [];
  const attachments = raw.attachments || [];
  const total = checklist.length;
  const done = checklist.filter(i => i.done).length;
  const cover = attachments.find(a => a.type === 'image');
  const due = dueInfo(raw.startAt, raw.dueAt, raw.dueComplete);

  return {
    id: raw.id,
    title: raw.title,
    desc: raw.desc || '',
    listTitle,
    labels: labelsFor(raw.labels),
    assigneeIds: [...assignees],
    assignees: assignees.map(personById),
    checklist: checklist.map(item => {
      const itemDue = dueInfo(item.startAt, item.dueAt, item.done);
      return {
        ...item,
        assignee: item.assignee ? personById(item.assignee) : null,
        dueLabel: itemDue ? itemDue.label : '',
        dueStyle: itemDue ? dueStyleStr(itemDue.state) : '',
      };
    }),
    checklistTotal: total,
    checklistDone: done,
    checklistPct: total ? Math.round((done / total) * 100) : 0,
    hasChecklist: total > 0,
    comments: (raw.comments || []).map(c => ({
      id: c.id,
      who: personById(c.who),
      text: c.text,
      time: relativeTime(c.createdAt),
    })),
    attachments: attachments.map(a => ({ ...a, url: attachmentUrl(a) })),
    startAt: raw.startAt || '',
    dueAt: raw.dueAt || '',
    dueComplete: !!raw.dueComplete,
    hasDue: !!due,
    dueLabel: due ? due.label : '',
    dueStyle: due ? dueStyleStr(due.state) : '',
    cover: cover ? attachmentUrl(cover) : '',
    hasCover: !!cover,
  };
}

export function boardMembers(board) {
  return (board?.members || []).map(personById);
}

/**
 * Yeniden çizimde yazılmakta olan metni, focus'u ve imleci korur: önce yakalar,
 * dönen fonksiyon yeni DOM'a geri yükler (render kullanıcıdan bağımsız da tetiklenir).
 * @param {(el: Element) => string} keyOf eski ve yeni DOM'da aynı alanı eşleyen anahtar
 * @param {boolean} onlyFocused yalnızca odaktaki alanı koru, diğerleri sunucu değerini göstersin
 */
export function captureDrafts(root, selector, keyOf = el => el.id, onlyFocused = false) {
  const active = document.activeElement;
  const saved = new Map();
  root.querySelectorAll(selector).forEach(el => {
    if (onlyFocused && el !== active) return;
    saved.set(keyOf(el), { value: el.value, focused: el === active, start: el.selectionStart, end: el.selectionEnd });
  });
  return () => {
    if (!saved.size) return;
    root.querySelectorAll(selector).forEach(el => {
      const draft = saved.get(keyOf(el));
      if (!draft) return;
      el.value = draft.value;
      if (draft.focused) {
        el.focus({ preventScroll: true });
        try {
          el.setSelectionRange(draft.start, draft.end);
        } catch {
          /* seçim desteklemeyen input */
        }
      }
    });
  };
}

/** innerHTML ile yeniden çizimde img'ler bir kare boş kalıp titriyor; eski düğümler src'ye göre geri takılır. */
export function collectImages(root) {
  const bySrc = new Map();
  root.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (!bySrc.has(src)) bySrc.set(src, []);
    bySrc.get(src).push(img);
  });
  return bySrc;
}

export function restoreImages(root, bySrc) {
  if (!bySrc.size) return;
  root.querySelectorAll('img[src]').forEach(img => {
    const old = bySrc.get(img.getAttribute('src'))?.shift();
    if (!old) return;
    old.className = img.className;
    old.alt = img.alt;
    img.replaceWith(old);
  });
}

export function findRawCard(lists, id) {
  for (const list of lists) {
    const card = list.cards.find(c => c.id === id);
    if (card) return { card, listTitle: list.title };
  }
  return null;
}

export const ICONS = {
  tick: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  menu: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
  panel: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>`,
  plus: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  plus18: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  x: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  x20: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle,#9296b3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  filter: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>`,
  star: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z"/></svg>`,
  dots: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`,
  desc: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>`,
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  attach: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  cal: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  check14: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  chat14: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  attach14: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49"/></svg>`,
  desc15: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>`,
  sliders: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>`,
  edit13: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`,
  trash13: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  userPlus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`,
};
