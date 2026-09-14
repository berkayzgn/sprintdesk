// ============================================================
// MAIN — Uygulama giriş noktası
// ============================================================
import './style.css';
import { state, setState, subscribe, onPersistError, liveFileKeys } from './state.js';
import { onFileLoaded, collectGarbage, putFile } from './files.js';
import { showToast } from './toast.js';
import { applyTheme } from './theme.js';
import { compactQuery } from './helpers.js';
import { renderSidebar } from './sidebar.js';
import { renderBoard }   from './board.js';
import { renderModal, renderNewBoardModal, renderProfileModal } from './modal.js';
import { renderLogin } from './login.js';

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

  // Auth değilse yalnızca login ekranını göster
  if (!s.authed) {
    renderLogin(loginSlot);
    contentEl.classList.add('hidden');
    return;
  }
  loginSlot.classList.add('hidden');
  loginSlot.innerHTML = '';
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

onPersistError(err => {
  console.error('[state] kaydedilemedi', err);
  showToast('Değişiklikler kaydedilemedi: tarayıcı depolama alanı dolu olabilir.', 'error', 8000);
});

// IndexedDB'den geç yüklenen ek görselleri göster
let fileRenderQueued = false;
onFileLoaded(() => {
  if (fileRenderQueued) return;
  fileRenderQueued = true;
  requestAnimationFrame(() => { fileRenderQueued = false; render(state); });
});

// ---- Initial render ----
render(state);

// Eski sürümde base64 olarak localStorage'a yazılmış yüklemeleri IndexedDB'ye
// taşı, ardından hiçbir karta bağlı olmayan dosyaları temizle
migrateInlineUploads()
  .catch(err => console.error('[main] ek göçü başarısız', err))
  .finally(() => collectGarbage(liveFileKeys()));

async function migrateInlineUploads() {
  const isInline = a => !a.fileKey && a.size != null && (a.url || '').startsWith('data:');
  let changed = false;
  const listsByBoard = {};
  for (const [boardId, lists] of Object.entries(state.listsByBoard)) {
    listsByBoard[boardId] = await Promise.all(lists.map(async l => ({
      ...l,
      cards: await Promise.all(l.cards.map(async c => {
        if (!(c.attachments || []).some(isInline)) return c;
        const attachments = await Promise.all(c.attachments.map(async a => {
          if (!isInline(a)) return a;
          const blob = await (await fetch(a.url)).blob();
          await putFile(a.id, blob);
          changed = true;
          const { url, ...rest } = a;
          return { ...rest, fileKey: a.id, mime: blob.type };
        }));
        return { ...c, attachments };
      })),
    })));
  }
  if (changed) setState({ listsByBoard });
}
