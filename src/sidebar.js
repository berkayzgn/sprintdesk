// ============================================================
// SIDEBAR — Masaüstü sidebar bileşeni
// ============================================================
import { state, setState } from './state.js';
import { selectBoard, renameBoard, deleteBoard, canAdmin, isOwner } from './store.js';
import { cssColor, escHtml, compactQuery, ICONS, currentUserDisplay, captureDrafts, initialsOf, readableTextOn } from './helpers.js';
import { openSettings, closeSettings } from './settings.js';
import logoUrl from './assets/logo.webp';
import { confirmDialog } from './dialog.js';
import { social, subscribeSocial } from './social.js';

const COMMUNITY_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const CAL_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
const NOTE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6"/></svg>`;
const CHART_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>`;

/** Topluluktaki görülmemiş gönderi sayısı (sayfa açılınca sıfırlanır) */
function syncCommunityBadge() {
  document.querySelectorAll('.community-badge').forEach(b => {
    const n = social.unseenPosts || 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.classList.toggle('hidden', !n || state.page === 'community');
  });
}
subscribeSocial(syncCommunityBadge);

const EDIT_ICON = ICONS.edit13;
const TRASH_ICON = ICONS.trash13;
const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
// Sol üstteki çalışma alanı: rozetteki harf her zaman bu addan türetilir
const WORKSPACE_NAME = 'KYNC';

const X_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

/** Board'un rengi üzerinde baş harfi: daraltılmış sidebar'da da hangi board olduğu anlaşılsın */
function boardTile(b) {
  const bg = cssColor(b.color);
  return `<span class="board-tile" style="background:${bg};color:${readableTextOn(bg)}" aria-hidden="true">${escHtml(initialsOf(b.name).slice(0, 1))}</span>`;
}

const FULL = 256, MINI = 64;

// Board araması: state'e konmaz (her tuşta sidebar yeniden çizilip odak kaybolmasın);
// sorgu burada tutulur ve her çizimden sonra DOM üzerinde yeniden uygulanır
let boardQuery = '';
let searchOpen = false; // arama kutusu ikonla açılır; yazı varken açık kalır
/** Büyük/küçük harf ve Türkçe karakter duyarsız karşılaştırma: "sirket" → "Şirket" */
function foldText(t) {
  return String(t || '').toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
function applyBoardFilter(container) {
  const q = foldText(boardQuery);
  const rows = container.querySelectorAll('#sidebar-boards .board-btn-row');
  let visible = 0;
  rows.forEach(row => {
    // Düzenlenen satır her zaman görünür kalsın
    const show = !q || row.classList.contains('is-editing') || foldText(row.dataset.name).includes(q);
    row.hidden = !show;
    if (show) visible++;
  });
  container.querySelector('#sidebar-boards-empty')?.toggleAttribute('hidden', !(q && rows.length && !visible));
  container.querySelector('#board-search-clear')?.toggleAttribute('hidden', !boardQuery);
}
let lastWidth = null; // açılıp kapanırken genişlik animasyonu için önceki genişlik

const CHEVRON_RIGHT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m13 17 5-5-5-5"/><path d="m6 17 5-5-5-5"/></svg>`;
const CHEVRON_LEFT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>`;

export function renderSidebar(container) {
  const s = state;
  const compact = compactQuery.matches;
  const expanded = compact || s.sideExpanded;
  const w = compact ? '' : (expanded ? `${FULL}px` : `${MINI}px`);

  // Sidebar'ı ilgilendirmeyen state değişikliklerinde DOM'a dokunma: hem
  // gereksiz iş hem de çekmece geçiş animasyonunu bozuyor
  const key = JSON.stringify([s.boards, s.activeBoardId, s.editingBoardId, expanded, compact, s.userEmail, s.userName, s.people[s.userId], s.page, s.isAdmin]);
  if (container.__key === key) return;
  container.__key = key;
  // Yıldızlılar üstte; kendi aralarında oluşturulma sırası korunur
  const boards = [...(s.boards || [])].sort((a, b) => Number(!!b.starred) - Number(!!a.starred));
  const me = currentUserDisplay(s);
  const activeId = s.activeBoardId;
  const editingId = s.editingBoardId;

  // Board adı düzenlenirken board listesi sunucudan yenilenirse yazılan kaybolmasın
  const restoreDrafts = captureDrafts(container, '#edit-board-inp');
  // Arama kutusu odaktaysa yeniden çizimden sonra odağı ve imleci geri ver
  const prevSearch = container.querySelector('#board-search-inp');
  const searchFocus = prevSearch && document.activeElement === prevSearch
    ? [prevSearch.selectionStart, prevSearch.selectionEnd] : null;
  const showSearch = expanded && boards.length > 0;
  container.innerHTML = `
    <aside id="sidebar" class="${expanded ? '' : 'is-collapsed'}" style="${w ? `width:${lastWidth && lastWidth !== w ? lastWidth : w}` : ''}">
      <div class="sidebar-header">
        <span class="brand-logo ${expanded ? '' : 'is-compact'}" title="${escHtml(WORKSPACE_NAME)} Teknoloji">
          <img src="${logoUrl}" alt="${escHtml(WORKSPACE_NAME)} Teknoloji">
        </span>
      </div>

      <nav class="sidebar-pages" aria-label="Sayfalar">
        <button type="button" class="page-btn ${s.page === 'community' ? 'active' : ''}" data-page="community" ${expanded ? '' : 'title="Topluluk"'} aria-label="Topluluk">
          <span class="page-ico">${COMMUNITY_ICON}<span class="community-badge nav-badge hidden"></span></span>
          ${expanded ? '<span class="page-name">Topluluk</span>' : ''}
        </button>
        <button type="button" class="page-btn ${s.page === 'calendar' ? 'active' : ''}" data-page="calendar" ${expanded ? '' : 'title="Takvim"'} aria-label="Takvim">
          <span class="page-ico">${CAL_ICON}</span>
          ${expanded ? '<span class="page-name">Takvim</span>' : ''}
        </button>
        <button type="button" class="page-btn ${s.page === 'notes' ? 'active' : ''}" data-page="notes" ${expanded ? '' : 'title="Hızlı Notlar"'} aria-label="Hızlı Notlar">
          <span class="page-ico">${NOTE_ICON}</span>
          ${expanded ? '<span class="page-name">Hızlı Notlar</span>' : ''}
        </button>
        ${s.isAdmin ? `
        <button type="button" class="page-btn ${s.page === 'performance' ? 'active' : ''}" data-page="performance" ${expanded ? '' : 'title="Performans"'} aria-label="Performans">
          <span class="page-ico">${CHART_ICON}</span>
          ${expanded ? '<span class="page-name">Performans</span>' : ''}
        </button>` : ''}
      </nav>

      <nav class="sidebar-nav" aria-label="Board'lar">
        ${expanded ? `
          <div class="sidebar-section-label board-section-head">
            <span>Board'lar</span>
            ${showSearch ? `<button type="button" class="board-search-toggle ${searchOpen ? 'is-active' : ''}" id="board-search-toggle" title="Board ara" aria-label="Board ara" aria-expanded="${searchOpen}">${ICONS.search}</button>` : ''}
          </div>` : ''}
        ${showSearch ? `
          <div class="board-search" id="board-search" role="search" ${searchOpen ? '' : 'hidden'}>
            ${ICONS.search}
            <input id="board-search-inp" type="search" placeholder="Board ara…" value="${escHtml(boardQuery)}" aria-label="Board ara" autocomplete="off" spellcheck="false">
            <button type="button" class="board-search-clear" id="board-search-clear" title="Aramayı temizle" aria-label="Aramayı temizle" hidden>${X_ICON}</button>
          </div>` : ''}
        <div class="sidebar-boards" id="sidebar-boards">
          ${boards.map(b => {
            const isActive = b.id === activeId && s.page === 'boards';
            const isEditing = b.id === editingId;

            if (isEditing && expanded) {
              return `
                <div class="board-btn-row active-row is-editing" data-name="${escHtml(b.name)}">
                  ${boardTile(b)}
                  <input id="edit-board-inp" class="board-edit-input" value="${escHtml(b.name)}" aria-label="Board adı">
                  <button class="board-action-btn confirm-edit" data-id="${b.id}" title="Kaydet">${CHECK_ICON}</button>
                  <button class="board-action-btn cancel-edit" title="İptal">${X_ICON}</button>
                </div>
              `;
            }

            return `
              <div class="board-btn-row ${isActive ? 'active-row' : ''}" data-name="${escHtml(b.name)}">
                <button class="board-btn ${isActive ? 'active' : ''} board-select" data-id="${b.id}"
                  ${expanded ? '' : `title="${escHtml(b.name)}"`} aria-label="${escHtml(b.name)}" ${isActive ? 'aria-current="page"' : ''}>
                  ${boardTile(b)}
                  ${expanded ? `<span class="board-name">${escHtml(b.name)}</span>${b.starred ? `<span class="board-star" title="Yıldızlı" aria-label="Yıldızlı">★</span>` : ''}` : ''}
                </button>
                ${expanded && canAdmin(b) ? `
                  <div class="board-actions">
                    <button class="board-action-btn edit-board-btn" data-id="${b.id}" title="Yeniden adlandır">${EDIT_ICON}</button>
                    ${isOwner(b) ? `<button class="board-action-btn delete-board-btn" data-id="${b.id}" title="Sil">${TRASH_ICON}</button>` : ''}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
        ${showSearch ? `<div class="sidebar-boards-empty" id="sidebar-boards-empty" hidden>Eşleşen board yok</div>` : ''}
        <button class="add-board-btn" id="add-board-btn" ${expanded ? '' : 'title="Yeni board"'} aria-label="Yeni board">
          ${ICONS.plus}
          ${expanded ? `<span>Yeni board</span>` : ''}
        </button>
      </nav>

      <div class="sidebar-footer">
        ${compact ? '' : `<button type="button" class="icon-btn sidebar-toggle" id="sidebar-toggle" title="${expanded ? 'Menüyü daralt' : 'Menüyü aç'}" aria-label="${expanded ? 'Menüyü daralt' : 'Menüyü aç'}" aria-expanded="${expanded}">${expanded ? CHEVRON_LEFT : CHEVRON_RIGHT}</button>`}
        <button class="sidebar-user-btn" id="sidebar-user-btn" title="${expanded ? 'Hesap ve profil' : escHtml(me.name)}" aria-label="Hesap ve profil">
          <span class="avatar sidebar-avatar" ${me.color ? `style="background:${cssColor(me.color)}"` : ''}>${escHtml(me.initials)}</span>
          ${expanded ? `
            <div class="user-info">
              <div class="user-name">${escHtml(me.name)}</div>
              <div class="user-email">${escHtml(state.userEmail || '')}</div>
            </div>
          ` : ''}
        </button>
        ${s.isAdmin ? `<button class="icon-btn" id="sidebar-settings-btn" title="Yönetim" aria-label="Yönetim">${ICONS.sliders}</button>` : ''}
      </div>
    </aside>
  `;

  // Board araması (daraltılmış sidebar'da kutu yok → filtre de uygulanmaz)
  const searchInp = container.querySelector('#board-search-inp');
  if (searchInp) {
    const setQuery = v => { boardQuery = v; applyBoardFilter(container); };
    const box = container.querySelector('#board-search');
    const toggleBtn = container.querySelector('#board-search-toggle');
    const setOpen = open => {
      searchOpen = open;
      box.hidden = !open;
      toggleBtn.classList.toggle('is-active', open);
      toggleBtn.setAttribute('aria-expanded', String(open));
      if (open) searchInp.focus();
      else if (searchInp.value) { searchInp.value = ''; setQuery(''); }
    };
    toggleBtn.addEventListener('click', () => setOpen(!searchOpen));
    // İkona basarken input odağı kaybetmesin (yoksa blur kapatıp tık yeniden açabilir)
    toggleBtn.addEventListener('mousedown', e => { if (searchOpen) e.preventDefault(); });
    // Boşken dışarı tıklanırsa kapanır; yazılı aramada açık kalır
    searchInp.addEventListener('blur', () => setTimeout(() => {
      if (searchOpen && !searchInp.value && container.contains(searchInp)) setOpen(false);
    }, 120));
    searchInp.addEventListener('input', () => setQuery(searchInp.value));
    searchInp.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false); searchInp.blur();
      } else if (e.key === 'Enter') {
        // Tek/ilk eşleşen board'u aç
        const first = container.querySelector('#sidebar-boards .board-btn-row:not([hidden]) .board-select');
        if (first) { e.preventDefault(); first.click(); }
      }
    });
    container.querySelector('#board-search-clear').addEventListener('click', () => {
      searchInp.value = ''; setQuery(''); searchInp.focus();
    });
    applyBoardFilter(container);
    if (searchFocus) {
      searchInp.focus();
      try { searchInp.setSelectionRange(...searchFocus); } catch {}
    }
  }

  // Board seç — geçici UI durumlarını temizle
  container.querySelectorAll('.board-select').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.page !== 'boards') setState({ page: 'boards' });
      if (btn.dataset.id !== state.activeBoardId) selectBoard(btn.dataset.id);
      else setState({ navOpen: false });
    });
  });

  container.querySelectorAll('.page-btn[data-page]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.page === 'community') social.unseenPosts = 0;
    setState({ page: btn.dataset.page, navOpen: false, openCardId: null });
  }));
  syncCommunityBadge();

  // Edit başlat
  container.querySelectorAll('.edit-board-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setState({ editingBoardId: btn.dataset.id });
    });
  });

  // Edit onayla
  const confirmBtn = container.querySelector('.confirm-edit');
  if (confirmBtn) {
    const inp = container.querySelector('#edit-board-inp');
    const save = () => {
      const name = (inp?.value || '').trim();
      if (!name) return;
      const board = state.boards.find(b => b.id === confirmBtn.dataset.id);
      if (name === board?.name) { setState({ editingBoardId: null }); return; }
      renameBoard(confirmBtn.dataset.id, name);
    };
    confirmBtn.addEventListener('click', save);
    inp?.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setState({ editingBoardId: null }); });
    inp?.focus();
  }
  restoreDrafts();

  // Edit iptal
  container.querySelector('.cancel-edit')?.addEventListener('click', () => setState({ editingBoardId: null }));

  // Sil
  container.querySelectorAll('.delete-board-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const board = state.boards.find(b => b.id === btn.dataset.id);
      // Geri alınamaz: tüm listeler, kartlar ve dosyalar da silinir
      const ok = await confirmDialog({
        title: `"${board?.name}" silinsin mi?`,
        message: 'Board, içindeki tüm listeler, kartlar ve dosyalarla birlikte kalıcı olarak silinecek. Bu işlem geri alınamaz.',
        confirmText: 'Board\'u sil', danger: true,
      });
      if (ok) deleteBoard(btn.dataset.id);
    });
  });

  // Yeni board
  container.querySelector('#add-board-btn').addEventListener('click', () => setState({ newBoardModal: true, navOpen: false }));

  // Profil
  container.querySelector('#sidebar-user-btn').addEventListener('click', () => setState({ profileOpen: true, navOpen: false }));
  container.querySelector('#sidebar-toggle')?.addEventListener('click', () => setState({ sideExpanded: !state.sideExpanded }));

  // Ayarlar (tema)
  closeSettings(); // sidebar yeniden çizildiyse eski çapaya bağlı popover kalmasın
  const settingsBtn = container.querySelector('#sidebar-settings-btn');
  settingsBtn?.addEventListener('click', e => { e.stopPropagation(); openSettings(settingsBtn); });

  // Açılıp kapanırken genişlik yumuşakça değişsin (yeni çizilen öğe eski genişlikten başlar)
  const aside = container.querySelector('#sidebar');
  if (w && lastWidth && lastWidth !== w) {
    requestAnimationFrame(() => requestAnimationFrame(() => { aside.style.width = w; }));
  }
  lastWidth = w || null;
}
