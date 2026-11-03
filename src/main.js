import './styles/main.css';
import { state, setState, subscribe } from './core/state.js';
import { onFileLoaded } from './core/storage.js';
import { applyTheme } from './lib/theme.js';
import { compactQuery } from './lib/helpers.js';
import { renderSidebar } from './views/sidebar.js';
import { renderBoard } from './views/board.js';
import { renderModal, renderNewBoardModal, renderProfileModal } from './views/modal.js';
import { renderLogin } from './views/login.js';
import { renderUsersModal } from './views/users.js';
import { renderCommunity } from './views/community.js';
import { renderPerformance } from './views/performance.js';
import { renderCalendar } from './views/calendar.js';
import { renderNotes } from './views/notes.js';
import { syncMessagesDock } from './views/messages.js';
import { initHovercards } from './components/hovercard.js';
import { renderNotificationsPage, headerActionsHTML, syncThemeToggle } from './views/notifications.js';
import { initAuth } from './core/auth.js';

const ENTER_ANIMATION_MS = 700;

const app = document.getElementById('app');

app.innerHTML = `
  <div id="login-slot" class="hidden"></div>
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

const sidebarSlot = app.querySelector('#sidebar-slot');
const mainEl = app.querySelector('#main');
const modalSlot = app.querySelector('#modal-slot');
const newBoardModalSlot = app.querySelector('#new-board-modal-slot');
const profileModalSlot = app.querySelector('#profile-modal-slot');
const usersModalSlot = app.querySelector('#users-modal-slot');
const loginSlot = app.querySelector('#login-slot');
const contentEl = app.querySelector('#content');
const pageArea = app.querySelector('#page-area');

app.querySelector('#nav-scrim').addEventListener('click', () => setState({ navOpen: false }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.navOpen) setState({ navOpen: false });
});
// Eşik aşılınca sidebar modu değişir: çekmeceyi kapatıp yeniden çiz
compactQuery.addEventListener('change', () => setState({ navOpen: false }));

function render(s) {
  applyTheme(document.documentElement, s.theme);
  applyTheme(contentEl, s.theme);

  // Oturum kontrolü bitene kadar boş kal (login ekranı yanıp sönmesin)
  if (!s.authReady) {
    contentEl.classList.add('hidden');
    return;
  }

  renderLogin(loginSlot); // oturum tamamsa kendini gizler
  if (!s.authed || s.mustChangePassword) {
    contentEl.classList.add('hidden');
    return;
  }
  contentEl.classList.remove('hidden');

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

const enterTimers = new WeakMap();

/** Giriş animasyonunu baştan oynatır */
function playEnter(el) {
  el.classList.remove('view-enter');
  void el.offsetWidth; // reflow: animasyonu sıfırlar
  el.classList.add('view-enter');
  // animationend yerine timer: alt öğelerin olayları da kabarcıklanıyor.
  // Sınıf kalırsa her yeniden çizimde animasyon tekrar oynar.
  clearTimeout(enterTimers.get(el));
  enterTimers.set(
    el,
    setTimeout(() => el.classList.remove('view-enter'), ENTER_ANIMATION_MS),
  );
}

function resetPageArea(page) {
  pageArea.dataset.page = page;
  pageArea.innerHTML = '';
  pageArea.onclick = pageArea.onchange = null;
}

let lastBoardView = '';

function renderPage(s) {
  const page = s.page === 'performance' && !s.isAdmin ? 'boards' : s.page;
  const onBoards = page === 'boards';
  if (!onBoards) {
    mainEl.querySelector('#empty-state').classList.add('hidden');
    mainEl.querySelector('#board-area').classList.add('hidden');
  }
  mainEl.querySelector('#topbar').classList.toggle('hidden', !onBoards);
  pageArea.classList.toggle('hidden', onBoards);
  if (onBoards) {
    if (pageArea.dataset.page) resetPageArea('');
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
    resetPageArea(page);
    playEnter(pageArea);
  }
  if (page === 'community') renderCommunity(pageArea);
  else if (page === 'calendar') renderCalendar(pageArea);
  else if (page === 'notes') renderNotes(pageArea);
  else if (page === 'notifications') renderNotificationsPage(pageArea, headerActionsHTML());
  else renderPerformance(pageArea);
}

subscribe(render);
subscribe(renderGlobal);
initHovercards();

// İmzalı URL'i sonradan gelen ekler için tek karede yeniden çiz
let fileRenderQueued = false;
onFileLoaded(() => {
  if (fileRenderQueued) return;
  fileRenderQueued = true;
  requestAnimationFrame(() => {
    fileRenderQueued = false;
    render(state);
  });
});

render(state);
initAuth();
