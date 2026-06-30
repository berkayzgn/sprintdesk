// ============================================================
// MAIN — Uygulama giriş noktası
// ============================================================
import './style.css';
import { state, setState, subscribe } from './state.js';
import { applyTheme } from './theme.js';
import { renderSidebar } from './sidebar.js';
import { renderBoard }   from './board.js';
import { renderModal, renderNewBoardModal, renderProfileModal } from './modal.js';
import { renderLogin } from './login.js';

// ---- Root DOM ----
const app = document.getElementById('app');

app.innerHTML = `
  <!-- DOCK (chrome bar) -->
  <div id="dock">
    <div class="dock-logo">
      <span class="dock-logo-icon">F</span>
      Flowdesk<span style="color:var(--dock-fg,#9296b3);font-weight:500;font-size:12.5px;margin-left:1px"> · Önizleme</span>
    </div>
    <div class="dock-controls">
      <div class="seg-group">
        <button class="seg-btn" id="seg-light">Açık</button>
        <button class="seg-btn" id="seg-dark">Koyu</button>
      </div>
    </div>
  </div>

  <!-- LOGIN (auth değilse gösterilir) -->
  <div id="login-slot" class="hidden"></div>

  <!-- CONTENT -->
  <div id="content">
    <div id="desktop-view">
      <div id="sidebar-slot"></div>
      <main id="main">
        <header id="topbar"></header>
        <div id="empty-state" class="hidden"></div>
        <div id="board-area" class="hidden"></div>
      </main>
      <div id="modal-slot"></div>
      <div id="new-board-modal-slot"></div>
      <div id="profile-modal-slot"></div>
    </div>
  </div>
`;

// ---- Element refs ----
const sidebarSlot  = app.querySelector('#sidebar-slot');
const mainEl       = app.querySelector('#main');
const modalSlot           = app.querySelector('#modal-slot');
const newBoardModalSlot   = app.querySelector('#new-board-modal-slot');
const profileModalSlot    = app.querySelector('#profile-modal-slot');
const loginSlot    = app.querySelector('#login-slot');
const dockEl       = app.querySelector('#dock');
const contentEl    = app.querySelector('#content');

// ---- Dock buttons ----
const DOCK_BTNS = {
  light:   app.querySelector('#seg-light'),
  dark:    app.querySelector('#seg-dark'),
};

DOCK_BTNS.light.addEventListener('click',   () => setState({ theme: 'light'    }));
DOCK_BTNS.dark.addEventListener('click',    () => setState({ theme: 'dark'     }));

// ---- Render ----
function render(s) {
  // Theme
  applyTheme(document.documentElement, s.theme, s.style);
  applyTheme(contentEl, s.theme, s.style);

  // Dock active states
  DOCK_BTNS.light.classList.toggle('active',   s.theme  === 'light');
  DOCK_BTNS.dark.classList.toggle('active',    s.theme  === 'dark');

  // Auth değilse yalnızca login ekranını göster
  if (!s.authed) {
    renderLogin(loginSlot);
    dockEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  loginSlot.classList.add('hidden');
  loginSlot.innerHTML = '';
  dockEl.classList.remove('hidden');
  contentEl.classList.remove('hidden');

  // Uygulama görünümü
  renderSidebar(sidebarSlot);
  renderBoard(mainEl);
  renderModal(modalSlot);
  renderNewBoardModal(newBoardModalSlot);
  renderProfileModal(profileModalSlot);
}

// ---- Subscribe ----
subscribe(render);

// ---- Initial render ----
render(state);
