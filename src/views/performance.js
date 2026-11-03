/**
 * Yönetici performans ekranı. "Görev" = kişinin atandığı kart; dönem filtresi kartın oluşturulma tarihine göre.
 * Metrikler sunucuda hesaplanır (admin_performance / admin_user_tasks RPC'leri yalnızca yöneticiye açık).
 */
import { state, setState } from '../core/state.js';
import { supabase } from '../core/supabase.js';
import { escHtml, cssColor, initialsOf, ICONS } from '../lib/helpers.js';
import { headerActionsHTML } from './notifications.js';
import { rowsSkeleton, tilesSkeleton } from '../components/skeleton.js';

const RANGES = [
  { id: 'all', label: 'Tüm zamanlar' },
  { id: '30d', label: 'Son 30 gün' },
  { id: 'month', label: 'Bu ay' },
  { id: 'year', label: 'Bu yıl' },
];

const HOUR_MS = 60 * 60 * 1000;

let host = null;
let range = 'all';
let rows = null; // admin_performance sonucu
let detailUser = null;
let detail = null; // admin_user_tasks sonucu
let sortKey = 'completion_pct';
let loadingToken = 0;

const iso = d => d.toISOString().slice(0, 10);

function rangeDates() {
  const now = new Date();
  if (range === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return { p_from: iso(d), p_to: iso(now) };
  }
  if (range === 'month') return { p_from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), p_to: iso(now) };
  if (range === 'year') return { p_from: `${now.getFullYear()}-01-01`, p_to: iso(now) };
  return { p_from: null, p_to: null };
}

function fmtDuration(hours) {
  if (hours === null || hours === undefined) return '—';
  const h = Number(hours);
  if (h < 1) return '1 saatten az';
  if (h < 24) return `${Math.round(h)} saat`;
  const d = h / 24;
  return d < 10 ? `${d.toFixed(1).replace('.', ',')} gün` : `${Math.round(d)} gün`;
}

const fmtDate = v =>
  v
    ? new Date(v.length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

async function load() {
  const token = ++loadingToken;
  rows = null;
  paint();
  const { data, error } = await supabase.rpc('admin_performance', rangeDates());
  if (token !== loadingToken) return;
  rows = error ? { error: error.message } : data;
  paint();
  if (detailUser) loadDetail(detailUser);
}

async function loadDetail(userId) {
  detailUser = userId;
  detail = null;
  paint();
  const { data, error } = await supabase.rpc('admin_user_tasks', { p_user_id: userId, ...rangeDates() });
  if (detailUser !== userId) return;
  detail = error ? { error: error.message } : data;
  paint();
}

export function renderPerformance(el) {
  if (!state.isAdmin) {
    el.innerHTML = '<div class="pf-empty">Bu sayfa yalnızca yöneticiler içindir.</div>';
    return;
  }
  if (host !== el || !el.querySelector('.pf')) {
    host = el;
    el.innerHTML = '<div class="pf"></div>';
    el.onclick = onClick;
    el.onchange = e => {
      if (e.target.matches('.pf-range')) {
        range = e.target.value;
        load();
      }
    };
    load();
  }
}

function onClick(e) {
  if (e.target.closest('.page-menu-btn')) {
    setState({ navOpen: !state.navOpen });
    return;
  }
  const sort = e.target.closest('[data-sort]');
  if (sort) {
    sortKey = sort.dataset.sort;
    paint();
    return;
  }
  if (e.target.closest('[data-act="close-detail"]')) {
    detailUser = null;
    detail = null;
    paint();
    return;
  }
  const row = e.target.closest('.pf-row');
  if (row) loadDetail(row.dataset.userId);
}

function tile(label, value, hint, tone = '') {
  return `<div class="pf-tile ${tone}"><div class="pf-tile-label">${label}</div><div class="pf-tile-value">${value}</div>${hint ? `<div class="pf-tile-hint">${hint}</div>` : ''}</div>`;
}

function paint() {
  const root = host?.querySelector('.pf');
  if (!root) return;

  const head = `
    <header class="page-head">
      <button type="button" class="topbar-menu-btn page-menu-btn" aria-label="Menü">${ICONS.menu}</button>
      <div style="flex:1">
        <h1 class="page-title">Performans</h1>
        <p class="page-sub">Kişilerin atandığı görevler üzerinden hesaplanır. Bir kişiye tıklayarak görev geçmişini gör.</p>
      </div>
      <label class="pf-range-wrap">Dönem
        <select class="pf-range">${RANGES.map(r => `<option value="${r.id}" ${r.id === range ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
      </label>
      ${headerActionsHTML()}
    </header>`;

  if (!rows) {
    root.innerHTML =
      head +
      `<section class="pf-tiles">${tilesSkeleton(6, 74)}</section><section class="pf-table">${rowsSkeleton(6, { avatar: true })}</section>`;
    return;
  }
  if (rows.error) {
    root.innerHTML = head + `<div class="pf-empty">Veriler alınamadı: ${escHtml(rows.error)}</div>`;
    return;
  }

  const sum = (list, k) => list.reduce((n, r) => n + (r[k] || 0), 0);
  const total = sum(rows, 'total');
  const completed = sum(rows, 'completed');
  const overdue = sum(rows, 'overdue');
  const onTime = sum(rows, 'completed_on_time');
  const late = sum(rows, 'completed_late');
  const pctAll = total ? Math.round((completed / total) * 100) : 0;
  const onTimePct = onTime + late ? `%${Math.round((onTime / (onTime + late)) * 100)}` : '—';

  // Kişi ortalamaları biten görev sayısıyla ağırlıklandırılır
  const withAvg = rows.filter(r => r.avg_completion_hours !== null);
  const weightedHours = withAvg.reduce((n, r) => n + Number(r.avg_completion_hours) * r.completed, 0);
  const avgAll = withAvg.length ? weightedHours / Math.max(1, sum(withAvg, 'completed')) : null;

  const sorted = [...rows].sort((a, b) =>
    sortKey === 'full_name'
      ? (a.full_name || a.email).localeCompare(b.full_name || b.email, 'tr')
      : (b[sortKey] ?? -1) - (a[sortKey] ?? -1),
  );

  const th = (key, label, cls = '') =>
    `<button type="button" class="pf-th ${cls} ${sortKey === key ? 'is-sorted' : ''}" data-sort="${key}" title="Bu sütuna göre sırala">${label}${sortKey === key ? ' ↓' : ''}</button>`;

  root.innerHTML = `
    ${head}
    <section class="pf-tiles" aria-label="Özet">
      ${tile('Toplam görev', total, 'kişilere atanmış')}
      ${tile('Tamamlanan', completed, `%${pctAll} tamamlanma`)}
      ${tile('Gecikmiş', overdue, 'tarihi geçmiş, açık', overdue ? 'is-bad' : '')}
      ${tile('Yaklaşan', sum(rows, 'upcoming'), 'tarihi gelmemiş, açık')}
      ${tile('Ort. tamamlama süresi', fmtDuration(avgAll), 'oluşturulmadan bitişe')}
      ${tile('Zamanında bitirilen', onTimePct, `${onTime} zamanında · ${late} geç`)}
    </section>

    <section class="pf-table" role="table" aria-label="Kişi bazlı performans">
      <div class="pf-tr pf-thead" role="row">
        ${th('full_name', 'Kişi', 'pf-c-name')}
        ${th('total', 'Toplam')}
        ${th('completed', 'Biten')}
        ${th('completion_pct', 'Tamamlanma', 'pf-c-pct')}
        ${th('open', 'Açık')}
        ${th('overdue', 'Gecikmiş')}
        ${th('upcoming', 'Yaklaşan')}
        ${th('avg_completion_hours', 'Ort. süre')}
      </div>
      ${sorted
        .map(r => {
          const name = r.full_name || r.email.split('@')[0];
          return `
        <button type="button" class="pf-tr pf-row ${detailUser === r.user_id ? 'is-open' : ''}" data-user-id="${r.user_id}" role="row">
          <span class="pf-c-name"><span class="pf-avatar" style="background:${cssColor(r.avatar_color)}">${escHtml(initialsOf(name))}</span><span class="pf-name">${escHtml(name)}<small>${escHtml(r.email)}</small></span></span>
          <span>${r.total}</span>
          <span>${r.completed}</span>
          <span class="pf-c-pct" title="${r.completed} / ${r.total} görev tamamlandı">
            <span class="pf-bar"><span style="width:${r.completion_pct}%"></span></span><b>%${r.completion_pct}</b>
          </span>
          <span>${r.open}</span>
          <span>${r.overdue ? `<span class="pf-status is-bad">⚠ ${r.overdue}</span>` : '0'}</span>
          <span>${r.upcoming}</span>
          <span>${fmtDuration(r.avg_completion_hours)}</span>
        </button>`;
        })
        .join('')}
    </section>

    ${detailUser ? detailHTML() : ''}
  `;
  if (detailUser) root.querySelector('.pf-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function detailHTML() {
  const r = rows.find(x => x.user_id === detailUser);
  const name = r ? r.full_name || r.email : '';
  const today = new Date().toISOString().slice(0, 10);
  let body;
  if (!detail) body = rowsSkeleton(4);
  else if (detail.error) body = `<div class="pf-empty">${escHtml(detail.error)}</div>`;
  else if (!detail.length) body = '<div class="pf-empty">Bu dönemde atanmış görevi yok.</div>';
  else
    body = `
    <div class="pf-tasks" role="table">
      <div class="pf-task pf-task-head" role="row"><span>Görev</span><span>Board · Liste</span><span>Oluşturuldu</span><span>Son tarih</span><span>Bitti</span><span>Süre</span><span>Durum</span></div>
      ${detail
        .map(t => {
          const overdue = !t.due_complete && t.due_at && t.due_at < today;
          const late = t.due_complete && t.due_at && t.completed_at && t.completed_at.slice(0, 10) > t.due_at;
          const status = t.due_complete
            ? late
              ? '<span class="pf-status is-warn">✓ Geç bitti</span>'
              : '<span class="pf-status is-good">✓ Tamamlandı</span>'
            : overdue
              ? '<span class="pf-status is-bad">⚠ Gecikti</span>'
              : '<span class="pf-status">○ Devam ediyor</span>';
          const hours = t.completed_at ? (new Date(t.completed_at) - new Date(t.created_at)) / HOUR_MS : null;
          return `<div class="pf-task" role="row">
          <span class="pf-task-title">${escHtml(t.title)}</span>
          <span class="pf-muted">${escHtml(t.board_name)} · ${escHtml(t.list_title)}</span>
          <span>${fmtDate(t.created_at)}</span>
          <span>${fmtDate(t.due_at)}</span>
          <span>${fmtDate(t.completed_at)}</span>
          <span>${hours === null ? '—' : fmtDuration(hours)}</span>
          <span>${status}</span>
        </div>`;
        })
        .join('')}
    </div>`;
  return `
    <section class="pf-detail">
      <header class="pf-detail-head">
        <h2>${escHtml(name)} · görev geçmişi</h2>
        <button type="button" class="settings-close" data-act="close-detail" aria-label="Kapat">${ICONS.x}</button>
      </header>
      ${body}
    </section>`;
}
