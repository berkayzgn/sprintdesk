/**
 * Yıl / ay / hafta takvimi: etkinlikler ve son tarihli kartlar.
 * Etkinlik görünürlüğü attendee_ids ile sınırlanır (bkz. events RLS).
 */
import { state, setState } from '../core/state.js';
import { supabase } from '../core/supabase.js';
import { escHtml, cssColor, ICONS } from '../lib/helpers.js';
import { social, subscribeSocial, person } from '../core/social.js';
import { selectBoard } from '../core/store.js';
import { confirmDialog } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { headerActionsHTML } from './notifications.js';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const EVENT_COLORS = ['#6366f1', '#0ea5a3', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];
const MAX_PER_DAY = 3;
const MONTH_GRID_DAYS = 42; // 6 hafta
const BUSY_DAY_COUNT = 2; // bundan fazla kayıt olan gün yıl görünümünde vurgulanır
const QUERY_LIMIT = 2000;
const DEFAULT_START = '10:00';
const DEFAULT_END = '11:00';
const VIEWS = ['year', 'month', 'week']; // uzaktan yakına
const VIEW_LABEL = { year: 'Yıl', month: 'Ay', week: 'Hafta' };
const MONTHS = [
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
];

let view = 'month';
let cursor = anchorFor(new Date());
let showTasks = true;
let onlyMine = false;
let events = [];
let tasks = [];
let loading = false;
let host = null;
let loadToken = 0;
let zoomDir = 0; // geçiş animasyonunun yönü

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseDay = key => new Date(key + 'T00:00:00');
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const monday = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));

/** Görünümün başlangıcı: yıl → 1 Ocak, ay → ayın 1'i, hafta → pazartesi */
function anchorFor(d, v = view) {
  if (v === 'year') return new Date(d.getFullYear(), 0, 1);
  if (v === 'week') return monday(d);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function gridRange() {
  if (view === 'year')
    return { start: new Date(cursor.getFullYear(), 0, 1), end: new Date(cursor.getFullYear(), 11, 31) };
  if (view === 'week') return { start: new Date(cursor), end: addDays(cursor, 6) };
  const start = monday(cursor);
  return { start, end: addDays(start, MONTH_GRID_DAYS - 1) };
}

async function load() {
  const token = ++loadToken;
  loading = true;
  paint();
  const { start, end } = gridRange();
  const endExcl = addDays(end, 1);
  const [ev, cards] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .lt('starts_at', endExcl.toISOString())
      .gte('ends_at', start.toISOString())
      .order('starts_at')
      .limit(QUERY_LIMIT),
    supabase
      .from('cards')
      .select('id, title, due_at, due_complete, board_id, card_assignees(user_id)')
      .gte('due_at', ymd(start))
      .lte('due_at', ymd(end))
      .limit(QUERY_LIMIT),
  ]);
  if (token !== loadToken) return;
  loading = false;
  if (ev.error) console.error('[calendar] etkinlikler', ev.error);
  if (cards.error) console.error('[calendar] görevler', cards.error);
  events = ev.data || [];
  tasks = (cards.data || []).map(c => ({ ...c, assignees: (c.card_assignees || []).map(a => a.user_id) }));
  paint();
}

/** focus: yakınlaşılan/uzaklaşılan tarih */
function setView(next, focus = cursor) {
  if (!VIEWS.includes(next) || next === view) return;
  zoomDir = VIEWS.indexOf(next) > VIEWS.indexOf(view) ? 1 : -1;
  view = next;
  cursor = anchorFor(focus);
  load();
}

export function renderCalendar(el) {
  if (host === el && el.querySelector('.cal')) return;
  host = el;
  el.innerHTML = '<div class="cal"></div>';
  el.onclick = onClick;
  el.onchange = e => {
    if (e.target.matches('[data-opt="tasks"]')) {
      showTasks = e.target.checked;
      paint();
    }
    if (e.target.matches('[data-opt="mine"]')) {
      onlyMine = e.target.checked;
      paint();
    }
  };
  bindZoom(el);
  load();
}

const ZOOM_COOLDOWN_MS = 450;
const WHEEL_THRESHOLD = 40;
const WHEEL_RESET_MS = 200;
const PINCH_IN_SCALE = 1.25;
const PINCH_OUT_SCALE = 0.8;

/**
 * Trackpad pinch ile görünüm değiştirme. Chromium/Firefox pinch'i ctrlKey'li
 * wheel olarak, Safari gesture* olarak gönderir. Bekleme süresi bir hareketin
 * birden fazla kademe atlamasını önler.
 */
function bindZoom(el) {
  if (el.__zoomBound) return;
  el.__zoomBound = true;
  let acc = 0;
  let coolUntil = 0;
  let resetTimer = null;

  const focusFrom = target => {
    const day = target?.closest?.('[data-day]')?.dataset.day;
    if (day) return parseDay(day);
    const month = target?.closest?.('[data-month]')?.dataset.month;
    if (month) return parseDay(month + '-01');
    return cursor;
  };
  const step = (dir, target) => {
    const i = VIEWS.indexOf(view) + dir;
    if (i < 0 || i >= VIEWS.length) return;
    coolUntil = Date.now() + ZOOM_COOLDOWN_MS;
    setView(VIEWS[i], focusFrom(target));
  };

  el.addEventListener(
    'wheel',
    e => {
      if (!e.ctrlKey || state.page !== 'calendar' || !el.querySelector('.cal')) return;
      e.preventDefault(); // tarayıcının sayfa yakınlaştırmasını engelle
      if (Date.now() < coolUntil) {
        acc = 0;
        return;
      }
      acc += e.deltaY;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        acc = 0;
      }, WHEEL_RESET_MS);
      // Negatif delta: parmaklar açılıyor → yakınlaş
      if (Math.abs(acc) >= WHEEL_THRESHOLD) {
        const dir = acc < 0 ? 1 : -1;
        acc = 0;
        step(dir, e.target);
      }
    },
    { passive: false },
  );

  let gestureTarget = null;
  el.addEventListener('gesturestart', e => {
    e.preventDefault();
    gestureTarget = e.target;
  });
  el.addEventListener('gesturechange', e => {
    e.preventDefault();
    if (Date.now() < coolUntil) return;
    if (e.scale > PINCH_IN_SCALE) step(1, gestureTarget);
    else if (e.scale < PINCH_OUT_SCALE) step(-1, gestureTarget);
  });
}

let lastVersion = 0;
subscribeSocial(() => {
  if (social.eventsVersion !== lastVersion) {
    lastVersion = social.eventsVersion;
    if (state.page === 'calendar' && host?.isConnected) load();
  }
});

function itemsForDay(day) {
  const key = ymd(day);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = addDays(dayStart, 1);
  const evs = events
    .filter(e => new Date(e.starts_at) < dayEnd && new Date(e.ends_at) >= dayStart)
    .map(e => ({ type: 'event', e, sort: e.all_day ? '00:00' : hm(new Date(e.starts_at)) }));
  const tks = !showTasks
    ? []
    : tasks
        .filter(t => t.due_at === key && (!onlyMine || t.assignees.includes(state.userId)))
        .map(t => ({ type: 'task', t, sort: '99' }));
  return [...evs.sort((a, b) => a.sort.localeCompare(b.sort)), ...tks];
}

function itemHTML(it, detailed = false) {
  if (it.type === 'event') {
    const e = it.e;
    const start = new Date(e.starts_at);
    const end = new Date(e.ends_at);
    const time = e.all_day
      ? detailed
        ? '<b>Tüm gün</b> '
        : ''
      : `<b>${hm(start)}${detailed ? '–' + hm(end) : ''}</b> `;
    return `<button type="button" class="cal-item cal-event" data-event="${e.id}" style="--c:${cssColor(e.color)}" title="${escHtml(e.title)}">${time}${escHtml(e.title)}${detailed && e.location ? `<small>📍 ${escHtml(e.location)}</small>` : ''}</button>`;
  }
  const t = it.t;
  const board = state.boards.find(b => b.id === t.board_id);
  return `<button type="button" class="cal-item cal-task ${t.due_complete ? 'is-done' : ''}" data-card="${t.id}" data-board="${t.board_id}" title="${escHtml(t.title)}${board ? ' · ' + escHtml(board.name) : ''}">
    <span class="cal-dot" style="background:${cssColor(board?.color)}"></span>${t.due_complete ? '✓ ' : ''}${escHtml(t.title)}${detailed && board ? `<small>${escHtml(board.name)}</small>` : ''}</button>`;
}

function titleText() {
  if (view === 'year') return String(cursor.getFullYear());
  if (view === 'month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const end = addDays(cursor, 6);
  return cursor.getMonth() === end.getMonth()
    ? `${cursor.getDate()} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
    : `${cursor.getDate()} ${MONTHS[cursor.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

function monthHTML(today) {
  const { start } = gridRange();
  const month = cursor.getMonth();
  const days = Array.from({ length: MONTH_GRID_DAYS }, (_, i) => addDays(start, i));
  return `
    <div class="cal-grid" role="grid">
      ${DAYS.map(d => `<div class="cal-dow" role="columnheader">${d}</div>`).join('')}
      ${days
        .map(d => {
          const items = itemsForDay(d);
          const shown = items.slice(0, MAX_PER_DAY);
          const more = items.length - shown.length;
          return `
          <div class="cal-day ${d.getMonth() !== month ? 'is-other' : ''} ${ymd(d) === today ? 'is-today' : ''}" data-day="${ymd(d)}" role="gridcell">
            <span class="cal-num">${d.getDate()}</span>
            <div class="cal-items">
              ${shown.map(it => itemHTML(it)).join('')}
              ${more > 0 ? `<button type="button" class="cal-more" data-act="day" data-day="${ymd(d)}">+${more} daha</button>` : ''}
            </div>
          </div>`;
        })
        .join('')}
    </div>`;
}

function weekHTML(today) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
  return `
    <div class="cal-week" role="grid">
      ${days
        .map(
          (d, i) => `
        <div class="cal-wcol ${ymd(d) === today ? 'is-today' : ''}" data-day="${ymd(d)}" role="gridcell">
          <div class="cal-whead"><span>${DAYS[i]}</span><span class="cal-num">${d.getDate()}</span></div>
          <div class="cal-items">
            ${
              itemsForDay(d)
                .map(it => itemHTML(it, true))
                .join('') || '<span class="cal-wempty">+ Etkinlik ekle</span>'
            }
          </div>
        </div>`,
        )
        .join('')}
    </div>`;
}

function yearHTML(today) {
  const y = cursor.getFullYear();
  const counts = new Map();
  const bump = key => counts.set(key, (counts.get(key) || 0) + 1);
  for (const e of events) {
    for (let d = new Date(e.starts_at), end = new Date(e.ends_at); d <= end && d.getFullYear() <= y; d = addDays(d, 1))
      bump(ymd(d));
  }
  if (showTasks)
    tasks.forEach(t => {
      if (!onlyMine || t.assignees.includes(state.userId)) bump(t.due_at);
    });
  return `
    <div class="cal-year">
      ${MONTHS.map((name, m) => {
        const first = new Date(y, m, 1);
        const lead = (first.getDay() + 6) % 7;
        const len = new Date(y, m + 1, 0).getDate();
        return `
          <section class="cal-ymonth" data-month="${y}-${pad(m + 1)}">
            <button type="button" class="cal-ymonth-name" data-act="open-month" data-month="${y}-${pad(m + 1)}">${name}</button>
            <div class="cal-ygrid">
              ${DAYS.map(d => `<span class="cal-ydow">${d[0]}</span>`).join('')}
              ${'<span></span>'.repeat(lead)}
              ${Array.from({ length: len }, (_, i) => {
                const key = `${y}-${pad(m + 1)}-${pad(i + 1)}`;
                const n = counts.get(key) || 0;
                return `<button type="button" class="cal-yday ${key === today ? 'is-today' : ''} ${n ? 'has-items' : ''} ${n > BUSY_DAY_COUNT ? 'is-busy' : ''}" data-day="${key}" data-act="open-day" title="${n ? n + ' kayıt' : ''}">${i + 1}</button>`;
              }).join('')}
            </div>
          </section>`;
      }).join('')}
    </div>`;
}

// İskelet bir kez kurulur; düğmeler yeniden oluşmadığı için görünüm geçişi animasyonlu kayar
function ensureShell(root) {
  if (root.querySelector('.cal-head')) return;
  root.innerHTML = `
    <header class="page-head cal-head">
      <button type="button" class="topbar-menu-btn page-menu-btn" aria-label="Menü">${ICONS.menu}</button>
      <div>
        <h1 class="page-title">Takvim</h1>
        <p class="page-sub">Toplantılar, etkinlikler ve görevlerin son tarihleri. Bir güne tıklayarak etkinlik ekle.</p>
      </div>
      <span style="flex:1"></span>
      <button type="button" class="cal-new" data-act="new">${ICONS.plus}<span>Etkinlik ekle</span></button>
      ${headerActionsHTML()}
    </header>
    <div class="cal-toolbar">
      <div class="cal-nav">
        <button type="button" class="cal-nav-btn" data-act="prev" aria-label="Önceki">‹</button>
        <h2 class="cal-month"></h2>
        <button type="button" class="cal-nav-btn" data-act="next" aria-label="Sonraki">›</button>
        <button type="button" class="cal-today" data-act="today">Bugün</button>
        <span class="cal-loading" hidden>Yükleniyor…</span>
      </div>
      <div class="cal-zoom" role="radiogroup" aria-label="Takvim görünümü" title="İpucu: trackpad'de iki parmakla yakınlaştır / uzaklaştır">
        ${VIEWS.map(v => `<button type="button" class="view-option" data-view="${v}" role="radio">${VIEW_LABEL[v]}</button>`).join('')}
      </div>
      <div class="cal-opts">
        <label><input type="checkbox" data-opt="tasks"> Görevleri göster</label>
        <label><input type="checkbox" data-opt="mine"> Sadece benim görevlerim</label>
      </div>
    </div>
    <div class="cal-body"></div>
    <p class="cal-hint">💡 Trackpad'de iki parmakla yakınlaştırıp uzaklaştırarak <b>yıl → ay → hafta</b> arasında geçebilirsin.</p>
  `;
}

function paint() {
  const root = host?.querySelector('.cal');
  if (!root) return;
  ensureShell(root);
  const today = ymd(new Date());

  root.querySelector('.cal-month').textContent = titleText();
  root.querySelector('.cal-loading').hidden = !loading;
  root.querySelectorAll('.cal-zoom [data-view]').forEach(b => {
    const on = b.dataset.view === view;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  const tasksInp = root.querySelector('[data-opt="tasks"]');
  const mineInp = root.querySelector('[data-opt="mine"]');
  tasksInp.checked = showTasks;
  mineInp.checked = onlyMine;
  mineInp.disabled = !showTasks;

  // Yükleme sürerken eski görünüm kalır, ekran titremez
  if (loading && root.querySelector('.cal-body').childElementCount) return;
  const body = root.querySelector('.cal-body');
  body.innerHTML = view === 'year' ? yearHTML(today) : view === 'week' ? weekHTML(today) : monthHTML(today);
  if (zoomDir) {
    body.classList.remove('zoom-in', 'zoom-out');
    void body.offsetWidth; // reflow: animasyonu yeniden başlatır
    body.classList.add(zoomDir > 0 ? 'zoom-in' : 'zoom-out');
    zoomDir = 0;
  }
}

function onClick(e) {
  const actEl = e.target.closest('[data-act]');
  const act = actEl?.dataset.act;
  if (e.target.closest('.page-menu-btn')) {
    setState({ navOpen: !state.navOpen });
    return;
  }
  const viewBtn = e.target.closest('.cal-zoom [data-view]');
  if (viewBtn) {
    setView(viewBtn.dataset.view);
    return;
  }
  if (act === 'prev' || act === 'next') {
    const dir = act === 'prev' ? -1 : 1;
    cursor =
      view === 'year'
        ? new Date(cursor.getFullYear() + dir, 0, 1)
        : view === 'week'
          ? addDays(cursor, 7 * dir)
          : new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    load();
    return;
  }
  if (act === 'today') {
    cursor = anchorFor(new Date());
    load();
    return;
  }
  if (act === 'new') {
    openEventModal(null, ymd(new Date()));
    return;
  }
  if (act === 'day') {
    openDayList(actEl.dataset.day);
    return;
  }
  if (act === 'open-month') {
    setView('month', parseDay(actEl.dataset.month + '-01'));
    return;
  }
  if (act === 'open-day') {
    setView('week', parseDay(actEl.dataset.day));
    return;
  }
  if (openItemAt(e.target)) return;
  const day = e.target.closest('.cal-day, .cal-wcol');
  if (day) openEventModal(null, day.dataset.day);
}

/** Tıklanan etkinlik/görevi açar; öğe yoksa false */
function openItemAt(target) {
  const ev = target.closest('[data-event]');
  if (ev) {
    openEventModal(events.find(x => x.id === ev.dataset.event));
    return true;
  }
  const task = target.closest('[data-card]');
  if (task) {
    openTask(task.dataset.board, task.dataset.card);
    return true;
  }
  return false;
}

function openTask(boardId, cardId) {
  closeModal();
  if (!state.boards.some(b => b.id === boardId)) return;
  setState({ page: 'boards' });
  if (state.activeBoardId !== boardId) selectBoard(boardId);
  setState({ openCardId: cardId });
}

let modal = null;
function closeModal() {
  if (!modal) return;
  document.removeEventListener('keydown', modal.onKey, true);
  modal.el.remove();
  modal = null;
}

function shell(inner, cls = '') {
  closeModal();
  const el = document.createElement('div');
  el.className = 'cal-scrim';
  el.innerHTML = `<div class="cal-modal ${cls}" role="dialog" aria-modal="true">${inner}</div>`;
  document.body.appendChild(el);
  el.addEventListener('pointerdown', e => {
    if (e.target === el) closeModal();
  });
  const onKey = e => {
    if (e.key === 'Escape' && !document.querySelector('.dlg-scrim')) {
      e.stopPropagation();
      closeModal();
    }
  };
  document.addEventListener('keydown', onKey, true);
  modal = { el, onKey };
  return el;
}

function openDayList(dayKey) {
  const d = parseDay(dayKey);
  const items = itemsForDay(d);
  const el = shell(
    `
    <header class="cal-modal-head">
      <h2>${d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
      <button type="button" class="settings-close" data-x aria-label="Kapat">${ICONS.x}</button>
    </header>
    <div class="cal-daylist">${items.map(it => itemHTML(it, true)).join('')}</div>
    <button type="button" class="cal-new cal-new-wide" data-add>${ICONS.plus}<span>Bu güne etkinlik ekle</span></button>
  `,
    'is-narrow',
  );
  el.querySelector('[data-x]').addEventListener('click', closeModal);
  el.querySelector('[data-add]').addEventListener('click', () => openEventModal(null, dayKey));
  el.querySelector('.cal-daylist').addEventListener('click', e => openItemAt(e.target));
}

function openEventModal(ev, dayKey) {
  const isNew = !ev;
  const canEdit = isNew || ev.created_by === state.userId || state.isAdmin;
  const startD = ev ? new Date(ev.starts_at) : new Date(`${dayKey}T${DEFAULT_START}:00`);
  const endD = ev ? new Date(ev.ends_at) : new Date(`${dayKey}T${DEFAULT_END}:00`);
  let color = ev?.color || EVENT_COLORS[0];
  const attendees = new Set(ev?.attendee_ids || []);
  const people = Object.values(social.directory)
    .filter(p => p.id !== state.userId)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const ro = canEdit ? '' : 'disabled';
  const owner = ev?.created_by ? person(ev.created_by).name : '';

  const el = shell(`
    <header class="cal-modal-head">
      <h2>${isNew ? 'Yeni etkinlik' : canEdit ? 'Etkinliği düzenle' : 'Etkinlik'}</h2>
      <button type="button" class="settings-close" data-x aria-label="Kapat">${ICONS.x}</button>
    </header>
    <form class="cal-form" novalidate>
      <input class="cal-input cal-title-inp" name="title" maxlength="200" placeholder="Başlık (ör. Haftalık toplantı)" value="${escHtml(ev?.title || '')}" ${ro}>
      <div class="cal-row">
        <label>Tarih<input type="date" class="cal-input" name="date" value="${ymd(startD)}" ${ro}></label>
        <label class="cal-time">Başlangıç<input type="time" class="cal-input" name="start" value="${hm(startD)}" ${ro}></label>
        <label class="cal-time">Bitiş<input type="time" class="cal-input" name="end" value="${hm(endD)}" ${ro}></label>
      </div>
      <label class="cal-check"><input type="checkbox" name="allday" ${ev?.all_day ? 'checked' : ''} ${ro}> Tüm gün</label>
      <input class="cal-input" name="location" maxlength="300" placeholder="Yer ya da toplantı linki (isteğe bağlı)" value="${escHtml(ev?.location || '')}" ${ro}>
      <textarea class="cal-input" name="description" rows="3" maxlength="4000" placeholder="Açıklama (isteğe bağlı)" ${ro}>${escHtml(ev?.description || '')}</textarea>
      <div class="cal-field-label">Renk</div>
      <div class="cal-colors">${EVENT_COLORS.map(c => `<button type="button" class="cal-color ${c === color ? 'is-selected' : ''}" data-color="${c}" style="background:${c}" aria-label="Renk" ${ro}></button>`).join('')}</div>
      <div class="cal-field-label">Kimler görsün?</div>
      <label class="cal-check"><input type="radio" name="vis" value="all" ${attendees.size ? '' : 'checked'} ${ro}> Herkes (ofis geneli)</label>
      <label class="cal-check"><input type="radio" name="vis" value="some" ${attendees.size ? 'checked' : ''} ${ro}> Sadece seçtiğim kişiler (onlara bildirim gider)</label>
      <div class="cal-people ${attendees.size ? '' : 'hidden'}">
        ${people.map(p => `<label class="cal-person"><input type="checkbox" value="${p.id}" ${attendees.has(p.id) ? 'checked' : ''} ${ro}><span class="cal-pav" style="background:${cssColor(p.color)}">${escHtml(p.initials)}</span>${escHtml(p.name)}</label>`).join('') || '<div class="cal-muted">Başka kimse yok.</div>'}
      </div>
      ${owner ? `<div class="cal-muted">Oluşturan: ${escHtml(owner)}</div>` : ''}
      <div class="cal-form-error" role="alert"></div>
      <div class="cal-actions">
        ${!isNew && canEdit ? '<button type="button" class="cal-btn cal-del" data-del>Sil</button>' : ''}
        <span style="flex:1"></span>
        <button type="button" class="cal-btn" data-x>${canEdit ? 'Vazgeç' : 'Kapat'}</button>
        ${canEdit ? `<button type="submit" class="cal-btn cal-save">${isNew ? 'Ekle' : 'Kaydet'}</button>` : ''}
      </div>
    </form>
  `);
  const form = el.querySelector('form');
  const err = el.querySelector('.cal-form-error');
  const syncAllDay = () =>
    el.querySelectorAll('.cal-time input').forEach(i => {
      i.disabled = !canEdit || form.allday.checked;
    });
  syncAllDay();
  form.allday.addEventListener('change', syncAllDay);
  el.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', closeModal));
  el.querySelectorAll('input[name="vis"]').forEach(r =>
    r.addEventListener('change', () => {
      el.querySelector('.cal-people').classList.toggle('hidden', form.vis.value !== 'some');
    }),
  );
  el.querySelector('.cal-colors').addEventListener('click', e => {
    const b = e.target.closest('.cal-color');
    if (!b || !canEdit) return;
    color = b.dataset.color;
    el.querySelectorAll('.cal-color').forEach(x => x.classList.toggle('is-selected', x === b));
  });
  if (canEdit) form.title.focus();

  el.querySelector('[data-del]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Etkinlik silinsin mi?',
      message: `"${ev.title}" takvimden kaldırılacak.`,
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('events').delete().eq('id', ev.id);
    if (error) {
      showToast('Silinemedi.', 'error');
      return;
    }
    closeModal();
    load();
  });

  form.addEventListener('keydown', e => {
    // Shift+Enter açıklamada alt satır
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!canEdit) return;
    const title = form.title.value.trim();
    if (!title) {
      err.textContent = 'Bir başlık yaz.';
      form.title.focus();
      return;
    }
    const date = form.date.value;
    if (!date) {
      err.textContent = 'Tarih seç.';
      return;
    }
    const allDay = form.allday.checked;
    const startTime = allDay ? '00:00' : form.start.value || '00:00';
    const endTime = allDay ? '23:59' : form.end.value || form.start.value || '23:59';
    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);
    if (end < start) {
      err.textContent = 'Bitiş saati başlangıçtan önce olamaz.';
      return;
    }
    const ids =
      form.vis.value === 'some' ? [...el.querySelectorAll('.cal-person input:checked')].map(i => i.value) : [];
    if (form.vis.value === 'some' && !ids.length) {
      err.textContent = 'En az bir kişi seç ya da "Herkes"i işaretle.';
      return;
    }
    const row = {
      title,
      description: form.description.value.trim(),
      location: form.location.value.trim(),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      all_day: allDay,
      color,
      attendee_ids: ids,
    };
    const btn = el.querySelector('.cal-save');
    btn.disabled = true;
    const { error } = isNew
      ? await supabase.from('events').insert(row)
      : await supabase.from('events').update(row).eq('id', ev.id);
    btn.disabled = false;
    if (error) {
      console.error('[calendar] kayıt', error);
      err.textContent = 'Kaydedilemedi, tekrar dene.';
      return;
    }
    closeModal();
    cursor = anchorFor(start);
    load();
  });
}
