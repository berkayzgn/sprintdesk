// ============================================================
// COMMUNITY — Ofisin ortak akışı: herkes yazar, yönetici duyuru yapar
// ============================================================
// Yazı + isteğe bağlı tek görsel (tarayıcıda küçültülür, bkz. social.js).
// Enter paylaşır, Shift+Enter alt satır. Duyurular sarı şeritle öne çıkar
// ve herkese bildirim gider. Kendi gönderini, yönetici her gönderiyi siler.
// ============================================================
import { state, setState } from './state.js';
import { escHtml, cssColor, relativeTime, compactQuery, ICONS, currentUserDisplay } from './helpers.js';
import { social, subscribeSocial, loadPosts, createPost, deletePost, postImageUrl, person } from './social.js';
import { showToast } from './toast.js';
import { confirmDialog } from './dialog.js';
import { headerActionsHTML } from './notifications.js';
import { feedSkeleton } from './skeleton.js';

const IMAGE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
const MAX_IMAGE = 15 * 1024 * 1024; // küçültmeden önce kabul edilen ham boyut

/** Düz metni güvenli HTML'e çevirir; bağlantıları tıklanabilir yapar */
function formatBody(text) {
  return escHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
}

function postHTML(p) {
  const a = person(p.authorId);
  const canDelete = p.authorId === state.userId || state.isAdmin;
  return `
    <article class="cm-post ${p.isAnnouncement ? 'is-announcement' : ''}" data-id="${p.id}">
      ${p.isAnnouncement ? '<div class="cm-ann-tag">📢 Duyuru</div>' : ''}
      <header class="cm-post-head">
        <span class="cm-avatar" data-user-id="${escHtml(p.authorId || '')}" style="background:${cssColor(a.color)}">${escHtml(a.initials)}</span>
        <div class="cm-meta">
          <span class="cm-name" data-user-id="${escHtml(p.authorId || '')}">${escHtml(a.name)}</span>
          <span class="cm-time" title="${escHtml(new Date(p.createdAt).toLocaleString('tr-TR'))}">${escHtml(relativeTime(p.createdAt))}</span>
        </div>
        ${canDelete ? `<button type="button" class="cm-del" data-act="delete" title="Sil" aria-label="Gönderiyi sil">${ICONS.trash13}</button>` : ''}
      </header>
      ${p.body ? `<div class="cm-body">${formatBody(p.body)}</div>` : ''}
      ${p.imagePath ? `<a class="cm-image" data-path="${escHtml(p.imagePath)}" target="_blank" rel="noopener"><img alt="Paylaşılan görsel" loading="lazy"></a>` : ''}
    </article>`;
}

let built = null;
let pendingImage = null;

export function renderCommunity(el) {
  if (built !== el || !el.querySelector('.cm')) build(el);
  renderFeed();
}

function build(el) {
  built = el;
  pendingImage = null;
  const me = currentUserDisplay(state);
  el.innerHTML = `
    <div class="cm">
      <header class="page-head">
        <button type="button" class="topbar-menu-btn page-menu-btn" aria-label="Menü">${ICONS.menu}</button>
        <div>
          <h1 class="page-title">Topluluk</h1>
          <p class="page-sub">Ofisin ortak alanı: duyurular, haberler, sohbet.</p>
        </div>
        <span style="flex:1"></span>
        ${headerActionsHTML()}
      </header>

      <form class="cm-composer" novalidate>
        <span class="cm-avatar" style="background:${cssColor(me.color)}">${escHtml(me.initials)}</span>
        <div class="cm-composer-main">
          <textarea class="cm-input" rows="2" maxlength="4000" placeholder="Ekibe bir şey yaz… (Enter ile paylaş, alt satır için Shift + Enter)"></textarea>
          <div class="cm-preview hidden"><img alt=""><button type="button" class="cm-preview-x" aria-label="Görseli kaldır">${ICONS.x}</button></div>
          <div class="cm-composer-bar">
            <label class="cm-tool" title="Görsel ekle">
              ${IMAGE_ICON}<span>Görsel ekle</span>
              <input type="file" accept="image/*" class="cm-file" hidden>
            </label>
            ${state.isAdmin ? `<label class="cm-ann-toggle"><input type="checkbox" class="cm-ann"> 📢 Duyuru olarak paylaş <small>(herkese bildirim gider)</small></label>` : ''}
            <span style="flex:1"></span>
            <button type="submit" class="cm-share">Paylaş</button>
          </div>
        </div>
      </form>

      <div class="cm-feed" aria-live="polite"></div>
      <button type="button" class="cm-more hidden">Daha eski gönderileri göster</button>
    </div>
  `;

  const form = el.querySelector('.cm-composer');
  const input = el.querySelector('.cm-input');
  const fileInp = el.querySelector('.cm-file');
  const preview = el.querySelector('.cm-preview');
  const shareBtn = el.querySelector('.cm-share');

  el.querySelector('.page-menu-btn').addEventListener('click', () => setState({ navOpen: !state.navOpen }));

  const setImage = file => {
    if (preview.querySelector('img').src) URL.revokeObjectURL(preview.querySelector('img').src);
    pendingImage = file;
    preview.classList.toggle('hidden', !file);
    preview.querySelector('img').src = file ? URL.createObjectURL(file) : '';
  };
  fileInp.addEventListener('change', () => {
    const f = fileInp.files?.[0];
    fileInp.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('Sadece görsel ekleyebilirsin.', 'error'); return; }
    if (f.size > MAX_IMAGE) { showToast('Görsel çok büyük (en fazla 15 MB).', 'error'); return; }
    setImage(f);
  });
  preview.querySelector('.cm-preview-x').addEventListener('click', () => setImage(null));
  // Panodan görsel yapıştırma
  input.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); setImage(item.getAsFile()); }
  });

  let busy = false;
  const submit = async () => {
    if (busy) return;
    const body = input.value.trim();
    if (!body && !pendingImage) { input.focus(); return; }
    const announcement = !!el.querySelector('.cm-ann')?.checked;
    busy = true;
    shareBtn.disabled = true;
    shareBtn.textContent = pendingImage ? 'Yükleniyor…' : 'Paylaşılıyor…';
    const ok = await createPost({ body, image: pendingImage, announcement });
    busy = false;
    shareBtn.disabled = false;
    shareBtn.textContent = 'Paylaş';
    if (!ok) return;
    input.value = '';
    setImage(null);
    const ann = el.querySelector('.cm-ann');
    if (ann) ann.checked = false;
    input.focus();
  };
  form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });

  el.querySelector('.cm-feed').addEventListener('click', async e => {
    if (!e.target.closest('[data-act="delete"]')) return;
    const post = social.posts.find(p => p.id === e.target.closest('.cm-post').dataset.id);
    if (!post) return;
    const ok = await confirmDialog({ title: 'Gönderi silinsin mi?', message: 'Bu gönderi herkesten kaldırılacak.', confirmText: 'Sil', danger: true });
    if (ok) deletePost(post);
  });
  el.querySelector('.cm-more').addEventListener('click', () => loadPosts(true));

  if (!social.postsLoaded) loadPosts();
  input.focus();
}

function renderFeed() {
  if (!built || !built.isConnected) return;
  const feed = built.querySelector('.cm-feed');
  if (!feed) return;
  if (!social.postsLoaded) { feed.innerHTML = feedSkeleton(3); return; }
  // Yalnızca değiştiyse çiz (görseller yeniden yüklenip titremesin)
  const key = social.posts.map(p => p.id).join(',') + '|' + Object.keys(social.directory).length;
  if (feed.dataset.key !== key) {
    feed.dataset.key = key;
    feed.innerHTML = social.posts.length ? social.posts.map(postHTML).join('')
      : '<div class="cm-empty">Henüz paylaşım yok. İlk mesajı sen yaz! 👋</div>';
    feed.querySelectorAll('.cm-image').forEach(async a => {
      const url = await postImageUrl(a.dataset.path);
      if (!url) return;
      a.href = url;
      a.querySelector('img').src = url;
    });
  }
  built.querySelector('.cm-more').classList.toggle('hidden', !social.postsMore || !social.posts.length);
}

subscribeSocial(() => { if (state.page === 'community') renderFeed(); });
compactQuery.addEventListener('change', () => {});
