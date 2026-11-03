/**
 * Tarih aralığı seçici (air-datepicker). Seçim takvim kapanınca tek seferde commit edilir;
 * tek gün seçilirse yalnızca bitiş tarihi olarak kaydedilir.
 */
import AirDatepicker from 'air-datepicker';
import 'air-datepicker/air-datepicker.css';
import { toISODate, parseISODate, formatDay } from '../lib/dates.js';

const LOCALE_TR = {
  days: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  daysShort: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  daysMin: ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'],
  months: [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
  ],
  monthsShort: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  today: 'Bugün',
  clear: 'Temizle',
  dateFormat: 'dd.MM.yyyy',
  timeFormat: 'HH:mm',
  firstDay: 1,
};

const ARROW_LEFT =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const ARROW_RIGHT =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

const GAP = 8;
const VIEWPORT_MARGIN = 12;

let active = null;

/** Çipin altına, sığmazsa üstüne; ekrandan taşmadan */
function placeNearTarget({ $datepicker, $target }) {
  const r = $target.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = $datepicker;
  const m = VIEWPORT_MARGIN;

  let top = r.bottom + GAP;
  if (top + h > window.innerHeight - m && r.top - GAP - h >= m) top = r.top - GAP - h;
  top = Math.max(m, Math.min(top, window.innerHeight - h - m));
  const left = Math.max(m, Math.min(r.left, window.innerWidth - w - m));

  $datepicker.style.left = `${left + window.scrollX}px`;
  $datepicker.style.top = `${top + window.scrollY}px`;
}

/** Açıkken yeniden çizim yapılmamalı (yarım seçim kaybolur) */
export function isRangePickerOpen() {
  return !!active;
}

export function closeRangePicker() {
  if (!active) return;
  const dp = active;
  active = null;
  if (!dp.isDestroyed) dp.destroy();
}

function toRange(dates) {
  const sorted = [...dates].sort((a, b) => a - b);
  if (sorted.length === 0) return { startAt: null, dueAt: null };
  if (sorted.length === 1 || toISODate(sorted[0]) === toISODate(sorted[1])) {
    return { startAt: null, dueAt: toISODate(sorted[sorted.length - 1]) };
  }
  return { startAt: toISODate(sorted[0]), dueAt: toISODate(sorted[1]) };
}

/**
 * @param {HTMLInputElement} anchorInput çipteki görünmez input (kütüphane açılmayı focus'a, kapanmayı blur'a bağlar)
 * @param {{startAt: string|null, dueAt: string|null}} value
 * @param {(next: {startAt: string|null, dueAt: string|null}) => void} onCommit
 */
export function openRangePicker(anchorInput, value, onCommit) {
  closeRangePicker();

  const initial = [value.startAt, value.dueAt].map(parseISODate).filter(Boolean);
  // Tek tarih önceden seçilirse kütüphane ilk tıklamayla aralığı tamamlıyor; o yüzden yalnızca işaretlenir
  const preselected = initial.length === 2 ? initial : [];
  const markedIso = initial.length === 1 ? toISODate(initial[0]) : null;
  let result = null; // null = değişiklik yok
  let closing = false;

  const renderSummary = dp => {
    const el = dp.$datepicker.querySelector('.fd-dp-summary');
    if (!el) return;
    const sorted = [...dp.selectedDates].sort((a, b) => a - b);
    const untouched = result === null && markedIso;
    const start = sorted[0] ? formatDay(sorted[0]) : '—';
    const end = sorted[1] ? formatDay(sorted[1]) : untouched ? formatDay(initial[0]) : '—';
    el.innerHTML = `
      <div class="fd-dp-field ${sorted.length === 0 ? 'is-active' : ''}"><span>Başlangıç</span><strong>${start}</strong></div>
      <span class="fd-dp-arrow">→</span>
      <div class="fd-dp-field ${sorted.length === 1 ? 'is-active' : ''}"><span>Bitiş</span><strong>${end}</strong></div>
    `;
  };

  const dp = new AirDatepicker(anchorInput, {
    locale: LOCALE_TR,
    classes: 'fd-datepicker',
    isMobile: false,
    range: true,
    dynamicRange: true,
    toggleSelected: false,
    autoClose: false,
    keyboardNav: true,
    position: placeNearTarget,
    prevHtml: ARROW_LEFT,
    nextHtml: ARROW_RIGHT,
    navTitles: { days: 'MMMM <i>yyyy</i>' },
    selectedDates: preselected,
    onRenderCell: ({ date, cellType }) => {
      if (cellType === 'day' && markedIso && toISODate(date) === markedIso) return { classes: 'fd-dp-marked' };
    },
    startDate: initial[initial.length - 1] || new Date(),
    buttons: [
      {
        content: 'Temizle',
        className: 'fd-dp-btn-clear',
        onClick: d => {
          result = { startAt: null, dueAt: null };
          d.hide();
        },
      },
      {
        content: 'Kaydet',
        className: 'fd-dp-btn-save',
        onClick: d => {
          result = toRange(d.selectedDates);
          d.hide();
        },
      },
    ],
    onSelect: ({ datepicker }) => {
      result = toRange(datepicker.selectedDates);
      renderSummary(datepicker);
    },
    onShow: done => {
      if (done || dp.$datepicker.querySelector('.fd-dp-summary')) return;
      const summary = document.createElement('div');
      summary.className = 'fd-dp-summary';
      dp.$datepicker.prepend(summary);
      renderSummary(dp);
    },
    // Özel konumlandırmada animasyon yok, onHide yalnızca isAnimationComplete=false ile gelir.
    // hide() bitmeden destroy() kütüphaneyi bozuyor, bu yüzden ertelenir.
    onHide: () => {
      if (closing) return;
      closing = true;
      const next = result;
      setTimeout(() => {
        if (active === dp) active = null;
        if (!dp.isDestroyed) dp.destroy();
        const changed = next && (next.startAt !== (value.startAt || null) || next.dueAt !== (value.dueAt || null));
        if (changed) onCommit(next);
      }, 0);
    },
  });

  active = dp;
  anchorInput.focus();
  dp.show();
}
