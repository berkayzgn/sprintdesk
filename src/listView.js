// ============================================================
// LIST VIEW — Board'un tablo/liste görünümü (Kanban'a alternatif)
// ============================================================
// Kartlar listelerine göre gruplanır; her satırda tamamla düğmesi, başlık,
// etiketler, kişiler, tarih ve alt görev ilerlemesi.
// Satıra tıklayınca kart detayı açılır. Grup sonundaki kutuya yazıp Enter'a
// basınca o listeye kart eklenir. Arama ve filtreler Kanban ile aynıdır.
// ============================================================
import { state, setState, getActiveLists } from './state.js';
import { getCardView, descText, escHtml, cssColor, labelStyle, captureDrafts, ICONS } from './helpers.js';
import { createCard, updateCard, canEdit } from './store.js';
import { cardMatchesFilters, activeFilterCount } from './filters.js';

const CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const CHEVRON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

const collapsed = new Set(); // kapalı grupların liste id'leri (oturumluk)

/** Alt görev ilerlemesi: "2/5" + ince çubuk + yüzde */
function subtaskHTML(card) {
  if (!card.hasChecklist) return '<span class="lv-empty">—</span>';
  const [done, total] = card.checklistLabel.split('/').map(Number);
  const pct = Math.round(done / total * 100);
  return `<span class="lv-sub ${pct === 100 ? 'is-done' : ''}" title="${done} / ${total} alt görev tamamlandı">
    <span class="lv-sub-count">${done}/${total}</span>
    <span class="lv-sub-bar"><span style="width:${pct}%"></span></span>
    <span class="lv-sub-pct">%${pct}</span>
  </span>`;
}

function rowHTML(card, lists, editable) {
  const avatars = card.assignees.slice(0, 4).map(p =>
    `<span class="lv-avatar" data-user-id="${escHtml(p.id)}" style="background:${cssColor(p.color)}" title="${escHtml(p.name)}">${escHtml(p.initials)}</span>`).join('');
  const more = card.assignees.length > 4 ? `<span class="lv-avatar lv-more">+${card.assignees.length - 4}</span>` : '';
  return `
    <div class="lv-row ${card.completed ? 'is-done' : ''}" data-card-id="${card.id}" role="row" tabindex="0">
      <div class="lv-cell lv-c-done">
        <button type="button" class="lv-check ${card.completed ? 'is-done' : ''}" data-act="done" ${editable ? '' : 'disabled'}
          title="${card.completed ? 'Tamamlanmadı yap' : 'Tamamlandı yap'}" aria-pressed="${card.completed}">${CHECK}</button>
      </div>
      <div class="lv-cell lv-c-title">
        <span class="lv-title">${escHtml(card.title)}</span>
        ${card.hasDesc ? `<span class="lv-ico" title="Açıklaması var">${ICONS.desc15}</span>` : ''}
        ${card.commentCount ? `<span class="lv-ico" title="${card.commentCount} yorum">💬 ${card.commentCount}</span>` : ''}
      </div>
      <div class="lv-cell lv-c-labels">
        ${card.labels.map(l => `<span class="card-label" style="${labelStyle(l.color)}">${escHtml(l.name)}</span>`).join('') || '<span class="lv-empty">—</span>'}
      </div>
      <div class="lv-cell lv-c-sub">${subtaskHTML(card)}</div>
      <div class="lv-cell lv-c-people">${avatars}${more}${card.assignees.length ? '' : '<span class="lv-empty">—</span>'}</div>
      <div class="lv-cell lv-c-due">${card.hasDue ? `<span class="lv-due" style="${card.dueStyle}">${ICONS.cal}${escHtml(card.dueLabel)}</span>` : '<span class="lv-empty">—</span>'}</div>
    </div>`;
}

export function renderListView(boardEl) {
  const q = (state.search || '').trim().toLowerCase();
  const editable = canEdit();
  const filtering = !!q || activeFilterCount() > 0;
  const lists = getActiveLists();

  const { scrollTop } = boardEl;
  const restoreDrafts = captureDrafts(boardEl, '.lv-add-inp', el => el.dataset.listId);

  boardEl.innerHTML = `
    <div class="lv" role="table" aria-label="Görev listesi">
      <div class="lv-head" role="row">
        <div class="lv-cell lv-c-done"></div>
        <div class="lv-cell lv-c-title">Görev</div>
        <div class="lv-cell lv-c-labels">Etiketler</div>
        <div class="lv-cell lv-c-sub">Alt görevler</div>
        <div class="lv-cell lv-c-people">Kişiler</div>
        <div class="lv-cell lv-c-due">Tarih</div>
      </div>
      ${lists.map(list => {
        const cards = list.cards
          .filter(c => (!q || c.title.toLowerCase().includes(q) || descText(c.desc).toLowerCase().includes(q)) && cardMatchesFilters(c))
          .map(c => getCardView(c, list.id));
        if (filtering && !cards.length) return '';
        const isCollapsed = collapsed.has(list.id);
        return `
          <section class="lv-group ${isCollapsed ? 'is-collapsed' : ''}" data-list-id="${list.id}">
            <button type="button" class="lv-group-head" data-act="collapse" aria-expanded="${!isCollapsed}">
              <span class="lv-chevron">${CHEVRON}</span>
              <span class="lv-group-name">${escHtml(list.title)}</span>
              <span class="lv-group-count">${cards.length}</span>
            </button>
            ${isCollapsed ? '' : `
              ${cards.map(c => rowHTML(c, lists, editable)).join('')}
              ${!cards.length ? '<div class="lv-none">Bu listede görev yok.</div>' : ''}
              ${editable ? `
                <div class="lv-add">
                  ${ICONS.plus}
                  <input class="lv-add-inp" data-list-id="${list.id}" placeholder="Görev ekle… (yaz ve Enter'a bas)" maxlength="500">
                </div>` : ''}
            `}
          </section>`;
      }).join('')}
    </div>
  `;
  if (filtering && !boardEl.querySelector('.lv-row')) {
    boardEl.querySelector('.lv').insertAdjacentHTML('beforeend', '<div class="lv-none lv-none-all">Aramana ya da filtrene uyan görev yok.</div>');
  }

  restoreDrafts();
  boardEl.scrollTop = scrollTop;

  // ---- Olaylar ----
  boardEl.onclick = e => {
    const collapseBtn = e.target.closest('[data-act="collapse"]');
    if (collapseBtn) {
      const id = collapseBtn.closest('.lv-group').dataset.listId;
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      renderListView(boardEl);
      return;
    }
    const row = e.target.closest('.lv-row');
    if (!row) return;
    if (e.target.closest('[data-act="done"]')) {
      e.stopPropagation();
      const done = row.classList.contains('is-done');
      updateCard(row.dataset.cardId, { dueComplete: !done });
      return;
    }
    setState({ openCardId: row.dataset.cardId });
  };
  boardEl.onkeydown = e => {
    const row = e.target.closest?.('.lv-row');
    if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setState({ openCardId: row.dataset.cardId });
      return;
    }
    if (e.target.matches?.('.lv-add-inp') && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const title = e.target.value.trim();
      if (!title) return;
      const listId = e.target.dataset.listId;
      e.target.value = '';
      createCard(listId, null, title);
      // Yeniden çizimden sonra aynı kutuda kal (art arda ekleme)
      requestAnimationFrame(() => boardEl.querySelector(`.lv-add-inp[data-list-id="${listId}"]`)?.focus());
    }
  };
  boardEl.onchange = null;
}
