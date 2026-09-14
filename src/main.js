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

  // Auth değilse yalnızca login ekranını göster
  if (!s.authed) {
    renderLogin(loginSlot);
    contentEl.classList.add('hidden');
    return;
  }
  renderLogin(loginSlot); // gizler ve bir sonraki çıkış için giriş moduna sıfırlar
  contentEl.classList.remove('hidden');

  // Uygulama görünümü
  document.body.classList.toggle('nav-open', !!s.navOpen && compactQuery.matches);
  renderSidebar(sidebarSlot);
  renderBoard(mainEl);
  renderModal(modalSlot);
  renderNewBoardModal(newBoardModalSlot);
  renderProfileModal(profileModalSlot);
}

// ---- Subscribe ----
subscribe(render);

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
