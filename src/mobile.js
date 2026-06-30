// ============================================================
// MOBILE — Mobil görünüm (phone frame, drawer, sheet)
// ============================================================
import { state, setState, updateCard } from './state.js';
import { getCardView, getOpenCardView, findRawCard, ICONS } from './helpers.js';
import { BOARDS, PEOPLE } from './data.js';

let touchStartX = 0;

export function renderMobile(container) {
  const s = state;
  const q = (s.search || '').trim().toLowerCase();

  const mobileTabs = s.lists.map((l, i) => ({
    idx: i, title: l.title, count: l.cards.length,
    active: i === s.mobileIndex,
  }));

  const openCardData = s.openCardId ? findRawCard(s.lists, s.openCardId) : null;
  const openCard = openCardData ? getOpenCardView(openCardData.card, openCardData.listTitle) : null;

  container.innerHTML = `
    <div id="mobile-view">
      <div class="phone-frame">
        <div class="phone-screen" id="phone-screen">
          <div class="phone-notch"></div>

          <!-- Status Bar -->
          <div class="status-bar">
            <span>9:41</span>
            <span class="signal">●●● 5G ▮</span>
          </div>

          <!-- Top Bar -->
          <div class="mobile-topbar">
            <button class="mobile-menu-btn" id="mob-menu-btn">${ICONS.menu}</button>
            <div class="mobile-board-title-wrap">
              <div class="mobile-board-title">Ürün Lansmanı</div>
            </div>
            <button class="mobile-add-btn" id="mob-add-btn">${ICONS.plus22}</button>
          </div>

          ${s.showEmpty ? renderMobileEmpty() : renderMobileBoard(s, q, mobileTabs)}

          <!-- Home Bar -->
          <div class="mobile-home-bar"><span class="home-indicator"></span></div>

          <!-- Drawer -->
          ${s.mobileMenuOpen ? renderDrawer(s) : ''}

          <!-- Card Sheet -->
          ${s.openCardId && openCard ? renderSheet(openCard, s) : ''}
        </div>
      </div>
    </div>
  `;

  // Events
  const menuBtn = container.querySelector('#mob-menu-btn');
  menuBtn?.addEventListener('click', () => setState({ mobileMenuOpen: !s.mobileMenuOpen }));

  const addBtn = container.querySelector('#mob-add-btn');
  addBtn?.addEventListener('click', () => {
    const l = s.lists[s.mobileIndex];
    if (l) setState({ addingCardFor: l.id });
  });

  // Mobile tabs
  container.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ mobileIndex: parseInt(btn.dataset.idx, 10) || 0 });
    });
  });

  // Mobile cards
  container.querySelectorAll('.mobile-card').forEach(cardEl => {
    cardEl.addEventListener('click', () => setState({ openCardId: cardEl.dataset.cardId, mobileMenuOpen: false }));
  });

  // Swipe
  const carousel = container.querySelector('.mobile-carousel');
  if (carousel) {
    carousel.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    carousel.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const n = s.lists.length;
      if (dx < -45 && s.mobileIndex < n - 1) setState({ mobileIndex: s.mobileIndex + 1 });
      else if (dx > 45 && s.mobileIndex > 0) setState({ mobileIndex: s.mobileIndex - 1 });
    }, { passive: true });
  }

  // Drawer close
  const drawerScrim = container.querySelector('.mobile-drawer-scrim');
  if (drawerScrim) {
    drawerScrim.addEventListener('click', e => {
      if (e.target === drawerScrim) setState({ mobileMenuOpen: false });
    });
    container.querySelector('.drawer-close-btn')?.addEventListener('click', () => setState({ mobileMenuOpen: false }));
    container.querySelectorAll('.drawer-board-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); setState({ mobileMenuOpen: false }); });
    });
    container.querySelector('.mobile-drawer')?.addEventListener('click', e => e.stopPropagation());
  }

  // Sheet close
  const sheet = container.querySelector('.mobile-sheet');
  if (sheet) {
    container.querySelector('.sheet-back-btn')?.addEventListener('click', () => setState({ openCardId: null }));
    container.querySelector('.sheet-close-btn')?.addEventListener('click', () => setState({ openCardId: null }));

    // Sheet — title input
    const titleInp = container.querySelector('.sheet-title-input');
    titleInp?.addEventListener('input', e => updateCard(s.openCardId, { title: e.target.value }));

    // Checklist
    container.querySelectorAll('.sheet-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const itemId = cb.dataset.itemId;
        updateCard(s.openCardId, c => ({
          ...c,
          checklist: (c.checklist || []).map(it => it.id === itemId ? { ...it, done: !it.done } : it),
        }));
      });
    });

    // Add checklist
    const checkAddInp = container.querySelector('#sheet-check-inp');
    const checkAddBtn = container.querySelector('#sheet-check-btn');
    const addSheetItem = () => {
      const t = (checkAddInp?.value || '').trim();
      if (!t) return;
      updateCard(state.openCardId, c => ({
        ...c,
        checklist: [...(c.checklist || []), { id: 'k' + Date.now(), text: t, done: false }],
      }));
      if (checkAddInp) checkAddInp.value = '';
    };
    checkAddBtn?.addEventListener('click', addSheetItem);
    checkAddInp?.addEventListener('keydown', e => { if (e.key === 'Enter') addSheetItem(); });
  }

  // Empty mobile CTA
  container.querySelector('#mob-empty-create-btn')?.addEventListener('click', () => setState({ showEmpty: false }));
}

function renderMobileEmpty() {
  return `
    <div class="mobile-empty">
      <div class="mobile-empty-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/></svg>
      </div>
      <h2>Board boş</h2>
      <p>Başlamak için ilk listeni oluştur.</p>
      <button class="mobile-empty-btn" id="mob-empty-create-btn">İlk listeni oluştur</button>
    </div>
  `;
}

function renderMobileBoard(s, q, mobileTabs) {
  const trackStyle = `transform:translateX(-${s.mobileIndex * 100}%);transition:transform .35s cubic-bezier(.4,0,.2,1)`;

  return `
    <!-- Tabs -->
    <div class="mobile-tabs">
      ${mobileTabs.map(t => `
        <button class="mobile-tab" data-idx="${t.idx}" style="${t.active ? 'background:var(--accent);color:#fff' : 'background:var(--chip-bg);color:var(--text-muted)'}">
          ${escHtml(t.title)} · ${t.count}
        </button>
      `).join('')}
    </div>

    <!-- Carousel -->
    <div class="mobile-carousel">
      <div class="mobile-track" style="${trackStyle}">
        ${s.lists.map(list => {
          const cards = list.cards
            .filter(c => !q || c.title.toLowerCase().includes(q))
            .map(c => getCardView(c, list.id, null, null));
          return `
            <div class="mobile-panel">
              ${cards.map(card => buildMobileCard(card)).join('')}
              <button class="mobile-add-card-btn" data-list-id="${list.id}">
                ${ICONS.plus18} Kart Ekle
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Dots -->
    <div class="mobile-dots">
      ${mobileTabs.map(t => `
        <span class="mobile-dot" style="${t.active ? 'background:var(--accent);width:20px' : 'background:var(--text-subtle);opacity:.4'}"></span>
      `).join('')}
    </div>
  `;
}

function buildMobileCard(card) {
  const coverHTML = card.hasCover ? `<div class="mobile-card-cover"><img src="${card.cover}" alt=""></div>` : '';
  const labelsHTML = card.hasLabels
    ? `<div class="card-labels">${card.labels.map(lb => `<span class="label-pill" style="background:${lb.color}"></span>`).join('')}</div>`
    : '';
  const dueHTML = card.hasDue ? `<span class="due-badge" style="${card.dueStyle}; font-size:12px">${ICONS.clock} ${escHtml(card.dueLabel)}</span>` : '';
  const checkHTML = card.hasChecklist ? `<span class="checklist-badge" style="${card.checklistStyle}; font-size:12px">${ICONS.check14} ${card.checklistLabel}</span>` : '';
  const commentHTML = card.hasComments ? `<span class="comment-badge" style="font-size:12px">${ICONS.chat14} ${card.commentCount}</span>` : '';
  const assigneesHTML = card.assignees.length
    ? `<div class="assignees-row">${card.assignees.map(p => `<span class="card-avatar" style="width:26px;height:26px;font-size:10px;background:${p.color}">${p.initials}</span>`).join('')}</div>`
    : '';
  const metaHTML = card.hasMeta ? `
    <div class="mobile-card-meta">
      ${dueHTML}${checkHTML}${commentHTML}
      <span class="meta-spacer"></span>
      ${assigneesHTML}
    </div>` : '';

  return `
    <div class="mobile-card" data-card-id="${card.id}">
      ${coverHTML}
      <div class="mobile-card-body">
        ${labelsHTML}
        <div class="mobile-card-title">${escHtml(card.title)}</div>
        ${metaHTML}
      </div>
    </div>
  `;
}

function renderDrawer(s) {
  return `
    <div class="mobile-drawer-scrim">
      <div class="mobile-drawer" onclick="event.stopPropagation()">
        <div class="drawer-header">
          <span class="drawer-workspace-icon">A</span>
          <div class="drawer-workspace-info">
            <div class="drawer-workspace-name">Acme Studio</div>
            <div class="drawer-workspace-plan">Premium çalışma alanı</div>
          </div>
          <button class="drawer-close-btn">${ICONS.x20}</button>
        </div>
        <div class="drawer-nav">
          <div class="sidebar-section-label">Boards</div>
          <div class="drawer-boards">
            ${BOARDS.map(b => `
              <button class="drawer-board-btn ${b.active ? 'active' : ''}">
                <span class="board-dot" style="background:${b.color}"></span>
                ${escHtml(b.name)}
              </button>
            `).join('')}
          </div>
          <button class="add-board-btn" style="margin-top:12px;min-height:48px;padding:13px 11px;font-size:15px">
            ${ICONS.plus18} Yeni Board
          </button>
        </div>
        <div class="drawer-footer">
          <span class="avatar" style="width:40px;height:40px;font-size:13px">AY</span>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--sidebar-fg-strong,#fff)">Ayşe Yılmaz</div>
            <div style="font-size:12px;opacity:.65">ayse@acmestudio.io</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSheet(cv, s) {
  const pct = cv.checklistPct;
  return `
    <div class="mobile-sheet-scrim">
      <div class="mobile-sheet">
        ${cv.hasCover ? `<div style="flex:0 0 auto;height:140px;overflow:hidden;background:var(--chip-bg)"><img src="${cv.cover}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>` : ''}
        <div class="sheet-header">
          <button class="sheet-back-btn">${ICONS.back}</button>
          <span class="sheet-list-label">${escHtml(cv.listTitle)}</span>
          <button class="sheet-close-btn">${ICONS.x20}</button>
        </div>
        <div class="sheet-body">
          <input class="sheet-title-input" value="${escHtml(cv.title)}" placeholder="Kart başlığı…">

          <!-- Labels + Due -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${cv.labels.map(lb => `<span class="label-tag" style="background:${lb.color}">${lb.name}</span>`).join('')}
            ${cv.hasDue ? `<span class="due-badge" style="${cv.dueStyle};font-size:12px">${ICONS.cal} ${escHtml(cv.dueLabel)}</span>` : ''}
          </div>

          <!-- Description -->
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">Açıklama</div>
            <textarea style="width:100%;min-height:74px;border:1px solid var(--border);outline:none;background:var(--chip-bg);border-radius:11px;padding:11px 13px;font-size:14px;line-height:1.6;color:var(--text);font-family:inherit" placeholder="Açıklama ekle…">${escHtml(cv.desc)}</textarea>
          </div>

          <!-- Checklist -->
          <div>
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
              <span style="font-size:14px;font-weight:700;color:var(--text)">Alt Görevler</span>
              <span style="font-size:12px;font-weight:700;color:var(--text-subtle);margin-left:auto">${cv.checklistDone}/${cv.checklistTotal}</span>
            </div>
            ${cv.hasChecklist ? `<div class="progress-bar" style="margin-bottom:11px"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
            <div style="display:flex;flex-direction:column;gap:2px">
              ${cv.checklist.map(it => `
                <label style="display:flex;align-items:center;gap:11px;padding:9px 8px;border-radius:10px;cursor:pointer;min-height:44px">
                  <input type="checkbox" class="sheet-check" data-item-id="${it.id}" ${it.done ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)">
                  <span style="flex:1;font-size:14.5px;color:var(--text);${it.done ? 'text-decoration:line-through;color:var(--text-subtle)' : ''}">${escHtml(it.text)}</span>
                </label>
              `).join('')}
            </div>
            <div style="display:flex;gap:8px;margin-top:9px">
              <input id="sheet-check-inp" placeholder="Alt görev ekle…" style="flex:1;border:1px solid var(--border);outline:none;background:var(--chip-bg);border-radius:10px;padding:11px 13px;font-size:14px;color:var(--text);font-family:inherit">
              <button id="sheet-check-btn" class="btn-add" style="min-width:52px">+</button>
            </div>
          </div>

          <!-- Attachments -->
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:10px">Ekler</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              ${cv.attachments.map(att => `
                <div style="width:104px;border-radius:11px;overflow:hidden;border:1px solid var(--border)">
                  <div style="height:70px;overflow:hidden"><img src="${att.url}" alt="${escHtml(att.name)}" style="width:100%;height:100%;object-fit:cover;display:block"></div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
