// ============================================================
// MAIN — Uygulama giriş noktası
// ============================================================
import './style.css';
import { state, setState, subscribe } from './state.js';
import { applyTheme } from './theme.js';
import { renderSidebar } from './sidebar.js';
import { renderBoard }   from './board.js';
import { renderModal }   from './modal.js';

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
    </div>
  </div>
`;

// ---- Element refs ----
const sidebarSlot  = app.querySelector('#sidebar-slot');
const mainEl       = app.querySelector('#main');
const modalSlot    = app.querySelector('#modal-slot');
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

  // Render (yalnızca masaüstü görünüm)
  renderSidebar(sidebarSlot);
  renderBoard(mainEl);
  renderModal(modalSlot);
}

// ---- Subscribe ----
subscribe(render);

// ---- Initial render ----
render(state);
