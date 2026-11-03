/** Son tarih yardımcıları. Tarihler saat dilimsiz 'YYYY-MM-DD' olarak tutulur. */

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_DAYS = 3;

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

/** '14 Eyl' (farklı yıldaysa '14 Eyl 2027') */
export function formatDay(date) {
  let label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (date.getFullYear() !== new Date().getFullYear()) label += ` ${date.getFullYear()}`;
  return label;
}

const daysBetween = (from, to) => Math.round((to - from) / DAY_MS);

function relativeDay(date, today) {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  return formatDay(date);
}

/**
 * Durum bitiş tarihine göre hesaplanır; başlangıç varsa etiket aralıktır ('12 – 18 Eyl').
 * @returns {{label: string, state: 'over'|'today'|'soon'|'later'|'done'} | null}
 */
export function dueInfo(startAt, dueAt, complete = false) {
  const date = parseISODate(dueAt);
  if (!date) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = daysBetween(today, date);

  let label = relativeDay(date, today);
  const start = parseISODate(startAt);
  if (start && start < date) {
    const sameMonth = start.getMonth() === date.getMonth() && start.getFullYear() === date.getFullYear();
    const startLabel =
      sameMonth && !/^(Bugün|Yarın|Dün)$/.test(label) ? String(start.getDate()) : relativeDay(start, today);
    label = `${startLabel} – ${label}`;
  }

  let state;
  if (complete) state = 'done';
  else if (diff < 0) state = 'over';
  else if (diff === 0) state = 'today';
  else if (diff <= SOON_DAYS) state = 'soon';
  else state = 'later';

  return { label, state };
}
