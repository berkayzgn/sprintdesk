// ============================================================
// HELPERS — Paylaşılan yardımcı fonksiyonlar
// ============================================================
import { state } from './state.js';
import { attachmentUrl } from './files.js';
import { dueInfo } from './dates.js';

/** Addan baş harfler: 'Berkay Özgün' → 'BÖ' */
export function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return s.toLocaleUpperCase('tr');
}

/** Oturumdaki kullanıcının görünen adı, baş harfleri ve avatar rengi */
export function currentUserDisplay(s) {
  const p = s.people[s.userId];
  const name = p?.name || (s.userName || '').trim() || (s.userEmail || '').split('@')[0];
  return { name, initials: initialsOf(name), color: p?.color || null };
}

const UNKNOWN_PERSON = { name: 'Bilinmeyen', initials: '?', color: '#888' };

/** Kullanıcı id'sinden kişi nesnesi (board'dan ayrılmış olabilir) */
export function personById(id) {
  return state.people[id] || { id, ...UNKNOWN_PERSON };
}

/** Aktif board'un etiket id'lerini etiket nesnelerine çevirir */
function labelsFor(ids) {
  const labels = state.labelsByBoard[state.activeBoardId] || {};
  return (ids || []).map(id => labels[id]).filter(Boolean);
}

/** '5dk önce', '3s önce', '2g önce', sonra tarih */
export function relativeTime(iso) {
  const t = new Date(iso);
  const diff = (Date.now() - t.getTime()) / 1000;
  if (!Number.isFinite(diff) || diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}s önce`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}g önce`;
  return t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: t.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** HTML özel karakterlerini güvenli hale getirir (XSS / kırık markup önleme) */
export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Veritabanından gelen rengi style="" içine basmadan önce doğrular. Renk
 * alanları API üzerinden serbest metin olarak yazılabildiği için doğrudan
 * basılırsa `"><img onerror=…>` gibi değerlerle XSS'e kapı açar.
 */
export function cssColor(value, fallback = '#6366f1') {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value ?? '') ? value : fallback;
}

/** Renkli zemin üzerindeki yazı için okunaklı renk (sarı gibi açık renklerde koyu yazı) */
export function readableTextOn(hex) {
  let h = cssColor(hex).slice(1, 7);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#191b2c' : '#ffffff';
}

/** Dar ekran (tablet/telefon): sidebar çekmece olur */
export const compactQuery = window.matchMedia('(max-width: 900px)');

/** Son tarih rozeti için satır içi stil */
export function dueStyleStr(state) {
  if (state === 'over')  return 'background:rgba(244,63,94,.15);color:#e0556b';
  if (state === 'today') return 'background:rgba(245,158,11,.18);color:#d98410';
  if (state === 'soon')  return 'background:rgba(245,158,11,.12);color:#c27a0e';
  if (state === 'done')  return 'background:rgba(34,197,94,.16);color:#1f9d57';
  return 'background:var(--accent-soft);color:var(--accent)';
}

export function getCardView(c, listId) {
  const labels    = labelsFor(c.labels);
  const assignees = (c.assignees || []).map(personById);
  const total     = (c.checklist || []).length;
  const done      = (c.checklist || []).filter(i => i.done).length;
  const coverAtt  = (c.attachments || []).find(a => a.type === 'image');
  const cover     = coverAtt ? attachmentUrl(coverAtt) : '';
  const complete  = total > 0 && done === total;
  const due       = dueInfo(c.startAt, c.dueAt, c.dueComplete);

  return {
    id: c.id, title: c.title, listId,
    color: c.color || null,
    labels, assignees, hasLabels: labels.length > 0,
    hasDesc: !!(c.desc && c.desc.trim()),
    hasChecklist: total > 0,
    checklistLabel: done + '/' + total,
    checklistStyle: complete
      ? 'background:rgba(34,197,94,.16);color:#1f9d57;padding:3px 7px;border-radius:7px'
      : 'color:var(--text-subtle)',
    commentCount: (c.comments    || []).length,
    hasComments:  (c.comments    || []).length > 0,
    attachCount:  (c.attachments || []).length,
    hasAttach:    (c.attachments || []).length > 0,
    cover, hasCover: !!coverAtt,
    hasDue: !!due, dueLabel: due ? due.label : '', dueStyle: due ? dueStyleStr(due.state) : '',
    hasMeta: !!(due || (c.desc && c.desc.trim()) || total > 0 || (c.comments || []).length || (c.attachments || []).length || assignees.length),
  };
}

export function getOpenCardView(raw, listTitle) {
  if (!raw) return null;
  const total = (raw.checklist || []).length;
  const done  = (raw.checklist || []).filter(i => i.done).length;
  const cover = (raw.attachments || []).find(a => a.type === 'image');
  const due   = dueInfo(raw.startAt, raw.dueAt, raw.dueComplete);

  return {
    id: raw.id, title: raw.title, desc: raw.desc || '', listTitle,
    labels:    labelsFor(raw.labels),
    assigneeIds: [...(raw.assignees || [])],
    assignees: (raw.assignees || []).map(personById),
    checklist: (raw.checklist || []).map(i => {
      const d = dueInfo(i.startAt, i.dueAt, i.done);
      const assignee = i.assignee ? personById(i.assignee) : null;
      return { ...i, assignee, dueLabel: d ? d.label : '', dueStyle: d ? dueStyleStr(d.state) : '' };
    }),
    checklistTotal: total, checklistDone: done,
    checklistPct: total ? Math.round(done / total * 100) : 0,
    hasChecklist: total > 0,
    comments: (raw.comments || []).map(c => ({
      id: c.id,
      who: personById(c.who),
      text: c.text, time: relativeTime(c.createdAt),
    })),
    attachments: (raw.attachments || []).map(a => ({ ...a, url: attachmentUrl(a) })),
    startAt: raw.startAt || '', dueAt: raw.dueAt || '', dueComplete: !!raw.dueComplete,
    hasDue: !!due, dueLabel: due ? due.label : '',
    dueStyle: due ? dueStyleStr(due.state) : '',
    cover: cover ? attachmentUrl(cover) : '', hasCover: !!cover,
  };
}

/** Board üyelerini kişi nesneleri olarak döndürür */
export function boardMembers(board) {
  return (board?.members || []).map(personById);
}

/**
 * Yeniden çizimden önce metin alanlarının değerini, focus'unu ve imleç
 * konumunu alır; dönen fonksiyon yeni DOM'a geri yükler. Veri artık
 * kullanıcıdan bağımsız anlarda da gelebildiği için (imzalı URL, sunucudan
 * yeniden yükleme) yazılmakta olan metin kaybolmamalı.
 * @param {(el: Element) => string} keyOf eski ve yeni DOM'da aynı alanı eşleyen anahtar
 * @param {boolean} onlyFocused true: yalnızca odaktaki alanı koru (diğerleri sunucu değerini göstersin)
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
      const d = saved.get(keyOf(el));
      if (!d) return;
      el.value = d.value;
      if (d.focused) {
        el.focus({ preventScroll: true });
        try { el.setSelectionRange(d.start, d.end); } catch { /* seçim desteklemeyen input */ }
      }
    });
  };
}

/**
 * innerHTML ile yeniden çizimde <img>'ler yeniden decode edilip bir kare boş
 * görünüyor (titreme). Eski img düğümlerini src'ye göre toplayıp yeni DOM'a
 * geri takmak bunu önler.
 */
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
  for (const l of lists) {
    const f = l.cards.find(c => c.id === id);
    if (f) return { card: f, listTitle: l.title };
  }
  return null;
}

/** SVG ikonları — sıkça kullanılanlar */
export const ICONS = {
  menu: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
  panel: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>`,
  plus: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  plus18: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  plus22: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  x: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  x20: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle,#9296b3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  filter: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>`,
  star: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z"/></svg>`,
  dots: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`,
  card: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/></svg>`,
  desc: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>`,
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  attach: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  image: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
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
  back: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>`,
};
