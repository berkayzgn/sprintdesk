// ============================================================
// HELPERS — Paylaşılan yardımcı fonksiyonlar
// ============================================================
import { PEOPLE, LABELS } from './data.js';

/** HTML özel karakterlerini güvenli hale getirir (XSS / kırık markup önleme) */
export function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dueStyleStr(due) {
  if (!due) return '';
  if (due.state === 'over')  return 'background:rgba(244,63,94,.15);color:#e0556b';
  if (due.state === 'today') return 'background:rgba(245,158,11,.18);color:#d98410';
  if (due.state === 'done')  return 'background:rgba(34,197,94,.16);color:#1f9d57';
  return 'background:var(--accent-soft);color:var(--accent)';
}

export function getCardView(c, listId, drag, over) {
  const labels    = (c.labels    || []).map(k => LABELS[k]).filter(Boolean);
  const assignees = (c.assignees || []).map(k => PEOPLE[k]).filter(Boolean);
  const total     = (c.checklist || []).length;
  const done      = (c.checklist || []).filter(i => i.done).length;
  const cover     = (c.attachments || []).find(a => a.type === 'image');
  const complete  = total > 0 && done === total;
  const dragging  = !!(drag && drag.cardId === c.id);

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
    cover: cover ? cover.url : null,
    hasCover: !!cover,
    hasDue: !!c.due, dueLabel: c.due ? c.due.label : '', dueStyle: dueStyleStr(c.due),
    hasMeta: !!(c.due || (c.desc && c.desc.trim()) || total > 0 || (c.comments || []).length || (c.attachments || []).length || assignees.length),
    showIndicator: !!(drag && over && over.listId === listId && over.beforeCardId === c.id && drag.cardId !== c.id),
    dragging,
  };
}

export function getOpenCardView(raw, listTitle) {
  if (!raw) return null;
  const total = (raw.checklist || []).length;
  const done  = (raw.checklist || []).filter(i => i.done).length;
  const cover = (raw.attachments || []).find(a => a.type === 'image');

  return {
    id: raw.id, title: raw.title, desc: raw.desc || '', listTitle,
    labels:    (raw.labels    || []).map(k => LABELS[k]).filter(Boolean),
    assignees: (raw.assignees || []).map(k => PEOPLE[k]).filter(Boolean),
    checklist: (raw.checklist || []).map(i => ({ ...i })),
    checklistTotal: total, checklistDone: done,
    checklistPct: total ? Math.round(done / total * 100) : 0,
    hasChecklist: total > 0,
    comments: (raw.comments || []).map(c => ({
      id: c.id,
      who: PEOPLE[c.who] || { initials: '?', color: '#888', name: 'Bilinmeyen' },
      text: c.text, time: c.time,
    })),
    attachments: (raw.attachments || []).map(a => ({ ...a })),
    hasDue: !!raw.due, dueLabel: raw.due ? raw.due.label : '',
    dueStyle: dueStyleStr(raw.due),
    cover: cover ? cover.url : null, hasCover: !!cover,
  };
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
  plus: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  plus18: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  plus22: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  x: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  x20: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle,#9296b3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  filter: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>`,
  invite: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`,
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
  back: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>`,
};
