// ============================================================
// DATEPICKER — Başlangıç / bitiş tarih aralığı seçici (air-datepicker)
// ============================================================
// Takvim, çipin içindeki görünmez bir input'a bağlanır: kütüphane açılmayı
// focus'a, kapanmayı blur'a bağlıyor. Kapanınca seçim tek seferde commit
// edilir. Tek gün seçilirse yalnızca bitiş (son tarih) olarak kaydedilir.
// ============================================================
import AirDatepicker from 'air-datepicker';
import 'air-datepicker/air-datepicker.css';
import { toISODate, parseISODate, formatDay } from './dates.js';

const LOCALE_TR = {
  days: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  daysShort: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  daysMin: ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'],
  months: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  monthsShort: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  today: 'Bugün',
  clear: 'Temizle',
  dateFormat: 'dd.MM.yyyy',
  timeFormat: 'HH:mm',
  firstDay: 1,
};

const ARROW_LEFT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const ARROW_RIGHT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

let active = null;

/** Çipin altına yerleştir; altta yer yoksa üstüne, ekrandan taşmadan */
function placeNearTarget({ $datepicker, $target }) {
  const gap = 8;
  const margin = 12;
  const r = $target.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = $datepicker;

  let top = r.bottom + gap;
  if (top + h > window.innerHeight - margin && r.top - gap - h >= margin) top = r.top - gap - h;
  top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));
  const left = Math.max(margin, Math.min(r.left, window.innerWidth - w - margin));

  $datepicker.style.left = `${left + window.scrollX}px`;
  $datepicker.style.top = `${top + window.scrollY}px`;
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
 * @param {HTMLInputElement} anchorInput  çipin içindeki görünmez input
 * @param {{startAt: string|null, dueAt: string|null}} value
 * @param {(next: {startAt: string|null, dueAt: string|null}) => void} onCommit
 */
export function openRangePicker(anchorInput, value, onCommit) {
  closeRangePicker();

  const initial = [value.startAt, value.dueAt].map(parseISODate).filter(Boolean);
  // Tek tarih önceden seçili olursa kütüphane ilk tıklamayı onunla aralık
  // tamamlamak için kullanıyor; bu yüzden tek tarih yalnızca işaretlenir,
  // seçim her zaman başlangıçtan başlar.
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
    const end = sorted[1] ? formatDay(sorted[1]) : (untouched ? formatDay(initial[0]) : '—');
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
        onClick: d => { result = { startAt: null, dueAt: null }; d.hide(); },
      },
      {
        content: 'Kaydet',
        className: 'fd-dp-btn-save',
        onClick: d => { result = toRange(d.selectedDates); d.hide(); },
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
    // Özel konumlandırmada geçiş animasyonu yok; kütüphane onHide'ı
    // isAnimationComplete=false ile çağırıyor, bu yüzden ilk çağrıda kapan.
    // destroy() hide() bitmeden çağrılırsa kütüphane içeride patlıyor → ertele.
    onHide: () => {
      if (closing) return;
      closing = true;
      const next = result;
      setTimeout(() => {
        if (active === dp) active = null;
        if (!dp.isDestroyed) dp.destroy();
        if (next && (next.startAt !== (value.startAt || null) || next.dueAt !== (value.dueAt || null))) {
          onCommit(next);
        }
      }, 0);
    },
  });

  active = dp;
  anchorInput.focus();
  dp.show();
}
