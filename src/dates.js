// ============================================================
// DATES — Son tarih (due date) yardımcıları
// ============================================================
// Tarihler state'te saat dilimsiz 'YYYY-MM-DD' olarak tutulur; etiket ve
// renk durumu (gecikti / bugün / yakında) render anında hesaplanır.
// ============================================================

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Bugünden `days` gün sonrasının ISO tarihi */
export function isoDaysFromToday(days) {
  const t = new Date();
  return toISODate(new Date(t.getFullYear(), t.getMonth(), t.getDate() + days));
}

/** '14 Eyl' (farklı yıldaysa '14 Eyl 2027') */
export function formatDay(date) {
  let label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (date.getFullYear() !== new Date().getFullYear()) label += ` ${date.getFullYear()}`;
  return label;
}

function relativeDay(date, today) {
  const diff = Math.round((date - today) / DAY_MS);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  return formatDay(date);
}

/**
 * Durum her zaman bitiş tarihine göre hesaplanır; başlangıç varsa etiket
 * aralık olarak gösterilir ('12 – 18 Eyl', '28 Eyl – 3 Eki').
 * @returns {{label: string, state: 'over'|'today'|'soon'|'later'|'done'} | null}
 */
export function dueInfo(startAt, dueAt, complete = false) {
  const date = parseISODate(dueAt);
  if (!date) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date - today) / DAY_MS);

  let label = relativeDay(date, today);
  const start = parseISODate(startAt);
  if (start && start < date) {
    const sameMonth = start.getMonth() === date.getMonth() && start.getFullYear() === date.getFullYear();
    const startLabel = sameMonth && !/^(Bugün|Yarın|Dün)$/.test(label) ? String(start.getDate()) : relativeDay(start, today);
    label = `${startLabel} – ${label}`;
  }

  let state;
  if (complete) state = 'done';
  else if (diff < 0) state = 'over';
  else if (diff === 0) state = 'today';
  else if (diff <= 3) state = 'soon';
  else state = 'later';

  return { label, state };
}

/** Eski `{ label: '2 Tem', state }` biçimini ISO tarihe çevirir */
export function migrateDue(due) {
  if (!due || !due.label) return null;
  if (due.label === 'Bugün') return isoDaysFromToday(0);
  const m = /^(\d{1,2})\s+(\S+)/.exec(due.label);
  const month = m ? MONTHS.indexOf(m[2]) : -1;
  if (month < 0) return null;
  return toISODate(new Date(new Date().getFullYear(), month, +m[1]));
}
