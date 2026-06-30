// ============================================================
// MAIN — Uygulama giriş noktası
// ============================================================
import './style.css';
import { state, setState, subscribe } from './state.js';
import { applyTheme } from './theme.js';
import { renderSidebar } from './sidebar.js';
import { renderBoard }   from './board.js';
import { renderModal }   from './modal.js';
import { renderMobile }  from './mobile.js';
import { ICONS } from './helpers.js';

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
        <button class="seg-btn" id="seg-desktop">Masaüstü</button>
        <button class="seg-btn" id="seg-mobile">Mobil</button>
      </div>
      <div class="seg-group">
        <button class="seg-btn" id="seg-light">Açık</button>
        <button class="seg-btn" id="seg-dark">Koyu</button>
      </div>
      <div class="seg-group">
        <button class="seg-btn" id="seg-styleA">Stil A</button>
        <button class="seg-btn" id="seg-styleB">Stil B</button>
      </div>
      <div class="seg-group">
        <button class="seg-btn" id="seg-full">Dolu</button>
        <button class="seg-btn" id="seg-empty">Boş</button>
      </div>
    </div>
  </div>

  <!-- CONTENT -->
  <div id="content">
    <!-- Desktop view -->
    <div id="desktop-view" class="hidden">
      <div id="sidebar-slot"></div>
      <main id="main">
        <header id="topbar"></header>
        <div id="empty-state" class="hidden"></div>
        <div id="board-area" class="hidden"></div>
      </main>
      <div id="modal-slot"></div>
    </div>

    <!-- Mobile view -->
    <div id="mobile-slot" class="hidden"></div>
  </div>
`;

// ---- Element refs ----
const desktopView  = app.querySelector('#desktop-view');
const mobileSlot   = app.querySelector('#mobile-slot');
const sidebarSlot  = app.querySelector('#sidebar-slot');
const mainEl       = app.querySelector('#main');
const modalSlot    = app.querySelector('#modal-slot');
const contentEl    = app.querySelector('#content');

// ---- Dock buttons ----
const DOCK_BTNS = {
  desktop: app.querySelector('#seg-desktop'),
  mobile:  app.querySelector('#seg-mobile'),
  light:   app.querySelector('#seg-light'),
  dark:    app.querySelector('#seg-dark'),
  styleA:  app.querySelector('#seg-styleA'),
  styleB:  app.querySelector('#seg-styleB'),
  full:    app.querySelector('#seg-full'),
  empty:   app.querySelector('#seg-empty'),
};

DOCK_BTNS.desktop.addEventListener('click', () => setState({ device: 'desktop' }));
DOCK_BTNS.mobile.addEventListener('click',  () => setState({ device: 'mobile'  }));
DOCK_BTNS.light.addEventListener('click',   () => setState({ theme: 'light'    }));
DOCK_BTNS.dark.addEventListener('click',    () => setState({ theme: 'dark'     }));
DOCK_BTNS.styleA.addEventListener('click',  () => setState({ style: 'A'        }));
DOCK_BTNS.styleB.addEventListener('click',  () => setState({ style: 'B'        }));
DOCK_BTNS.full.addEventListener('click',    () => setState({ showEmpty: false  }));
DOCK_BTNS.empty.addEventListener('click',   () => setState({ showEmpty: true, openCardId: null, addingCardFor: null, addingList: false }));

// ---- Render ----
function render(s) {
  // Theme
  applyTheme(document.documentElement, s.theme, s.style);
  applyTheme(contentEl, s.theme, s.style);

  // Dock active states
  DOCK_BTNS.desktop.classList.toggle('active', s.device === 'desktop');
  DOCK_BTNS.mobile.classList.toggle('active',  s.device === 'mobile');
  DOCK_BTNS.light.classList.toggle('active',   s.theme  === 'light');
  DOCK_BTNS.dark.classList.toggle('active',    s.theme  === 'dark');
  DOCK_BTNS.styleA.classList.toggle('active',  s.style  === 'A');
  DOCK_BTNS.styleB.classList.toggle('active',  s.style  === 'B');
  DOCK_BTNS.full.classList.toggle('active',    !s.showEmpty);
  DOCK_BTNS.empty.classList.toggle('active',   s.showEmpty);

  // Device switch
  if (s.device === 'desktop') {
    desktopView.classList.remove('hidden');
    mobileSlot.classList.add('hidden');
    renderSidebar(sidebarSlot);
    renderBoard(mainEl);
    renderModal(modalSlot);
  } else {
    desktopView.classList.add('hidden');
    mobileSlot.classList.remove('hidden');
    renderMobile(mobileSlot);
  }
}

// ---- Subscribe ----
subscribe(render);

// ---- Initial render ----
render(state);
