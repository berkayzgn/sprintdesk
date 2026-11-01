// ============================================================
// MAIN — Uygulama giriş noktası
// ============================================================
import './style.css';
import { state, setState, subscribe } from './state.js';
import { onFileLoaded } from './files.js';
import { applyTheme } from './theme.js';
import { compactQuery } from './helpers.js';
import { renderSidebar } from './sidebar.js';
import { renderBoard }   from './board.js';
import { renderModal, renderNewBoardModal, renderProfileModal } from './modal.js';
import { renderLogin } from './login.js';
import { renderUsersModal } from './users.js';
import { renderCommunity } from './community.js';
import { renderPerformance } from './performance.js';
import { renderCalendar } from './calendar.js';
import { renderNotes } from './notes.js';
import { syncMessagesDock } from './messages.js';
import { initHovercards } from './hovercard.js';
import { renderNotificationsPage, headerActionsHTML, syncThemeToggle } from './notifications.js';
import { initAuth } from './auth.js';

// ---- Root DOM ----
const app = document.getElementById('app');

app.innerHTML = `
  <!-- LOGIN (auth değilse gösterilir) -->
  <div id="login-slot" class="hidden"></div>

  <!-- CONTENT -->
  <div id="content">
    <div id="desktop-view">
      <div id="sidebar-slot"></div>
      <div id="nav-scrim"></div>
      <main id="main">
        <header id="topbar"></header>
        <div id="empty-state" class="hidden"></div>
        <div id="board-area" class="hidden"></div>
        <div id="page-area" class="hidden"></div>
      </main>
      <div id="modal-slot"></div>
      <div id="new-board-modal-slot"></div>
      <div id="profile-modal-slot"></div>
      <div id="users-modal-slot"></div>
    </div>
  </div>
`;

// ---- Element refs ----
const sidebarSlot  = app.querySelector('#sidebar-slot');
const mainEl       = app.querySelector('#main');
const modalSlot           = app.querySelector('#modal-slot');
const newBoardModalSlot   = app.querySelector('#new-board-modal-slot');
const profileModalSlot    = app.querySelector('#profile-modal-slot');
const usersModalSlot      = app.querySelector('#users-modal-slot');
const loginSlot    = app.querySelector('#login-slot');
const contentEl    = app.querySelector('#content');

app.querySelector('#nav-scrim').addEventListener('click', () => setState({ navOpen: false }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.navOpen) setState({ navOpen: false });
});
// Genişlik eşiği aşılınca yeniden çiz (sidebar modu değişir), çekmeceyi kapat
compactQuery.addEventListener('change', () => setState({ navOpen: false }));

// ---- Render ----
function render(s) {
  // Theme
  applyTheme(document.documentElement, s.theme, s.style);
  applyTheme(contentEl, s.theme, s.style);

  // Oturum kontrolü bitene kadar hiçbir şey gösterme (login ekranı yanıp sönmesin)
  if (!s.authReady) {
    contentEl.classList.add('hidden');
    return;
  }

  // Giriş yoksa ya da ilk girişte şifre belirlenmediyse yalnızca login ekranını göster
  renderLogin(loginSlot); // oturum tamamsa kendini gizler
  if (!s.authed || s.mustChangePassword) {
    contentEl.classList.add('hidden');
    return;
  }
  contentEl.classList.remove('hidden');

  // Uygulama görünümü
  document.body.classList.toggle('nav-open', !!s.navOpen && compactQuery.matches);
  renderSidebar(sidebarSlot);
  renderPage(s);
  renderModal(modalSlot);
  renderNewBoardModal(newBoardModalSlot);
  renderProfileModal(profileModalSlot);
  renderUsersModal(usersModalSlot);
}

function renderGlobal(s) {
  syncMessagesDock();
  syncThemeToggle(s.theme);
}

/** Giriş animasyonunu (yeniden) oynat */
function playEnter(el) {
  el.classList.remove('view-enter');
  void el.offsetWidth; // animasyonu sıfırla
  el.classList.add('view-enter');
  // Alt öğelerin animationend'i de buraya kabarcıklanır: yalnızca kendi animasyonu bitince temizle
  // (sınıf kalırsa sonraki her yeniden çizimde listeler tekrar animasyon oynatır)
  clearTimeout(el.__enterTimer);
  el.__enterTimer = setTimeout(() => el.classList.remove('view-enter'), 700);
}
let lastBoardView = '';

/** Board'lar ya da Topluluk / Performans sayfası */
const pageArea = app.querySelector('#page-area');
function renderPage(s) {
  const page = s.page === 'performance' && !s.isAdmin ? 'boards' : s.page;
  const onBoards = page === 'boards';
  for (const id of ['#topbar', '#empty-state', '#board-area']) {
    if (!onBoards) mainEl.querySelector(id).classList.add('hidden');
  }
  mainEl.querySelector('#topbar').classList.toggle('hidden', !onBoards);
  pageArea.classList.toggle('hidden', onBoards);
  if (onBoards) {
    if (pageArea.dataset.page) { pageArea.dataset.page = ''; pageArea.innerHTML = ''; pageArea.onclick = pageArea.onchange = null; }
    renderBoard(mainEl);
    const boardView = `${s.activeBoardId}|${s.viewMode}|${!!s.listsByBoard[s.activeBoardId]}`;
    if (boardView !== lastBoardView) {
      lastBoardView = boardView;
      const area = mainEl.querySelector('#board-area');
      if (!area.classList.contains('hidden')) playEnter(area);
    }
    return;
  }
  lastBoardView = '';
  if (pageArea.dataset.page !== page) {
    pageArea.dataset.page = page; pageArea.innerHTML = ''; pageArea.onclick = pageArea.onchange = null;
    playEnter(pageArea);
  }
  if (page === 'community') renderCommunity(pageArea);
  else if (page === 'calendar') renderCalendar(pageArea);
  else if (page === 'notes') renderNotes(pageArea);
  else if (page === 'notifications') renderNotificationsPage(pageArea, headerActionsHTML());
  else renderPerformance(pageArea);
}

// ---- Subscribe ----
subscribe(render);
subscribe(renderGlobal);
initHovercards();

// İmzalı URL'i geç gelen ek görselleri göster
let fileRenderQueued = false;
onFileLoaded(() => {
  if (fileRenderQueued) return;
  fileRenderQueued = true;
  requestAnimationFrame(() => { fileRenderQueued = false; render(state); });
});

// ---- Initial render ----
render(state);
initAuth();
