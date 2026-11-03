/**
 * Kişisel notlar: liste + otomatik kaydeden zengin metin editörü.
 * Boş not kaydedilmez. Paylaşım, notun o anki kopyasını alıcıya gönderir.
 */
import { state, setState } from '../core/state.js';
import { supabase } from '../core/supabase.js';
import { escHtml, relativeTime, descText, cssColor, ICONS } from '../lib/helpers.js';
import { confirmDialog } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { headerActionsHTML } from './notifications.js';
import { tilesSkeleton } from '../components/skeleton.js';
import { createEditor, descToHtml, hydrateImages } from '../components/richtext.js';
import { social, person } from '../core/social.js';
import { BUCKETS, FileTooLargeError, signedUrl, uploadUserImage, removeObjects } from '../core/storage.js';

const SHARE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>`;
const PIN = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>`;
const GRID = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;

const COLORS = ['#fef08a', '#fed7aa', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#f1f5f9'];
const AUTOSAVE_DELAY_MS = 1000;
const COLOR_SAVE_DELAY_MS = 300;
const SHARES_LIMIT = 50;
const NOTE_LIMIT_ERROR = '54000'; // DB sınır tetikleyicisi; mesajı kullanıcıya gösterilir

const STATUS_EMPTY = 'Yazmaya başla, kendiliğinden kaydedilir';
const STATUS_SAVED = 'Kaydedildi ✓';

let notes = null;
let shares = null; // gelen, henüz kaydedilmemiş paylaşımlar
let host = null;
let query = '';
let mode = 'list'; // 'list' | 'edit'
let current = null; // düzenlenen not; yeni not ilk kayda kadar null
let draftColor = COLORS[0];
let draftTitle = ''; // DOM'dan bağımsız tutulur, sayfa değişse de kaydedilebilsin
let editor = null;
let saveTimer = null;
let saving = Promise.resolve();

const noteImageUrl = path => signedUrl(BUCKETS.notes, path);

async function uploadNoteImage(file) {
  showToast('Görsel ekleniyor…');
  try {
    const path = await uploadUserImage(BUCKETS.notes, state.userId, file);
    return { path, url: await noteImageUrl(path) };
  } catch (err) {
    if (err instanceof FileTooLargeError) showToast('Görsel çok büyük (en fazla 5 MB).', 'error');
    else {
      console.error('[notes] görsel yüklenemedi', err);
      showToast('Görsel yüklenemedi.', 'error');
    }
    return null;
  }
}

/** Notun kendi yüklediğin görsellerinin storage yolları */
const imagePaths = html =>
  [...(html || '').matchAll(/data-path="([^"]+)"/g)].map(m => m[1]).filter(p => p.startsWith(`${state.userId}/`));

async function loadShares() {
  const { data, error } = await supabase
    .from('note_shares')
    .select('*')
    .eq('recipient_id', state.userId)
    .is('saved_at', null)
    .order('created_at', { ascending: false })
    .limit(SHARES_LIMIT);
  if (error) {
    console.error('[notes] paylaşımlar', error);
    shares = [];
  } else shares = data;
  if (mode === 'list') paintShares();
}

async function load() {
  loadShares();
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[notes]', error);
    showToast('Notlar yüklenemedi.', 'error');
    notes = [];
  } else notes = data;
  if (mode === 'list') paintList();
}

export function renderNotes(el) {
  if (host === el && el.querySelector('.nt')) return;
  host = el;
  el.onclick = el.onchange = null;
  el.innerHTML = '<div class="nt"></div>';
  paint();
  if (notes === null) load();
}

function headHTML() {
  return `
    <header class="page-head nt-head">
      <button type="button" class="topbar-menu-btn page-menu-btn" aria-label="Menü">${ICONS.menu}</button>
      <div class="nt-switch" role="tablist" aria-label="Notlar">
        <button type="button" class="view-option ${mode === 'list' ? 'is-active' : ''}" data-mode="list" role="tab" aria-selected="${mode === 'list'}">${GRID}<span>Tüm notlar</span></button>
        <button type="button" class="view-option ${mode === 'edit' && !current ? 'is-active' : ''}" data-mode="new" role="tab" aria-selected="${mode === 'edit' && !current}">${ICONS.plus}<span>Yeni not</span></button>
      </div>
      <span style="flex:1"></span>
      ${mode === 'list' ? `<input type="search" class="nt-search" placeholder="Notlarda ara…" aria-label="Notlarda ara" value="${escHtml(query)}">` : ''}
      ${headerActionsHTML()}
    </header>`;
}

function paint() {
  const root = host?.querySelector('.nt');
  if (!root) return;
  editor?.destroy?.();
  editor = null;

  if (mode === 'list') {
    root.innerHTML = `${headHTML()}<p class="nt-sub">Notlarını yalnızca sen görürsün. Bir nota tıklayarak aç; <b>Paylaş</b> ile birine gönderebilirsin.</p><section class="nt-shares hidden"></section><div class="nt-grid"></div>`;
    root.querySelector('.nt-shares').addEventListener('click', onSharesClick);
    paintShares();
    if (shares === null || notes !== null) loadShares();
    root.querySelector('.nt-search').addEventListener('input', e => {
      query = e.target.value.trim().toLocaleLowerCase('tr');
      paintList();
    });
    root.querySelector('.nt-grid').addEventListener('click', onGridClick);
    paintList();
  } else {
    const n = current;
    draftColor = n?.color || draftColor;
    draftTitle = n?.title || '';
    root.innerHTML = `
      ${headHTML()}
      <article class="nt-editor" style="--note:${escHtml(draftColor)}">
        <div class="nt-editor-bar">
          <div class="nt-colors">${COLORS.map(c => `<button type="button" class="nt-color ${c === draftColor ? 'is-selected' : ''}" data-color="${c}" style="background:${c}" aria-label="Not rengi"></button>`).join('')}</div>
          <span class="nt-status" aria-live="polite">${n ? `Kaydedildi · ${escHtml(relativeTime(n.updated_at))}` : STATUS_EMPTY}</span>
          ${
            n
              ? `
            <button type="button" class="nt-share-btn" data-act="share" title="Bu notu birine gönder">${SHARE}<span>Paylaş</span></button>
            <button type="button" class="nt-icon ${n.pinned ? 'is-on' : ''}" data-act="pin" title="${n.pinned ? 'Sabitlemeyi kaldır' : 'Üste sabitle'}">${PIN}</button>
            <button type="button" class="nt-icon" data-act="delete" title="Notu sil">${ICONS.trash13}</button>`
              : ''
          }
        </div>
        <input class="nt-title" maxlength="200" placeholder="Başlık" value="${escHtml(n?.title || '')}" aria-label="Not başlığı">
        <div class="nt-editor-slot"></div>
        <div class="nt-editor-foot">
          <button type="button" class="nt-btn" data-act="back">Vazgeç</button>
          <button type="button" class="nt-btn is-primary nt-save-btn" data-act="save">Kaydet</button>
        </div>
      </article>`;
    editor = createEditor({
      html: n?.body || '',
      editable: true,
      placeholder:
        'Notunu yaz… (Enter alt satıra geçer; görsel yapıştırabilir, üstteki düğmelerle başlık, kalın, renk, liste ekleyebilirsin)',
      onCommit: () => scheduleSave(0),
      onImageFile: uploadNoteImage,
      resolveImage: noteImageUrl,
    });
    root.querySelector('.nt-editor-slot').replaceWith(editor);
    const title = root.querySelector('.nt-title');
    title.addEventListener('input', () => {
      draftTitle = title.value;
      scheduleSave();
    });
    title.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        editor.querySelector('.rte-content').focus();
      }
    });
    editor.addEventListener('input', () => scheduleSave());
    root.querySelector('.nt-editor-bar').addEventListener('click', onEditorBarClick);
    // Vazgeç de otomatik kaydedilmiş hali korur; ikisi de listeye döner
    root.querySelector('.nt-editor-foot').addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      const btn = e.target.closest('button');
      btn.disabled = true;
      await flushSave();
      if (act === 'save') {
        if (current) showToast('Not kaydedildi ✓');
        else showToast('Boş not kaydedilmedi.');
      }
      mode = 'list';
      current = null;
      paint();
    });
    (n ? editor.querySelector('.rte-content') : title).focus();
  }

  root.querySelector('.page-menu-btn').addEventListener('click', () => setState({ navOpen: !state.navOpen }));
  root.querySelector('.nt-switch').addEventListener('click', async e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    await flushSave();
    if (b.dataset.mode === 'list') {
      mode = 'list';
      current = null;
    } else {
      mode = 'edit';
      current = null;
      draftColor = COLORS[0];
    }
    paint();
  });
}

function setStatus(text) {
  const el = host?.querySelector('.nt-status');
  if (el) el.textContent = text;
}

function scheduleSave(delay = AUTOSAVE_DELAY_MS) {
  clearTimeout(saveTimer);
  setStatus('Yazılıyor…');
  saveTimer = setTimeout(() => {
    saving = saving.then(save);
  }, delay);
}

async function flushSave() {
  if (mode !== 'edit') return;
  clearTimeout(saveTimer);
  saving = saving.then(save);
  await saving;
}

async function save() {
  if (mode !== 'edit' || !editor) return;
  const title = draftTitle.trim();
  const body = editor.getHtml();
  const empty = !title && !descText(body);
  if (!current) {
    if (empty) {
      setStatus(STATUS_EMPTY);
      return;
    }
    setStatus('Kaydediliyor…');
    const { data, error } = await supabase.from('notes').insert({ title, body, color: draftColor }).select().single();
    if (error) {
      setStatus('Kaydedilemedi');
      showToast(error.code === NOTE_LIMIT_ERROR ? error.message : 'Not kaydedilemedi.', 'error');
      return;
    }
    current = data;
    notes = [data, ...(notes || [])];
    // Editör yeniden çizilmeden mevcut nota dönüşür: sekmeyi ve sabitle/sil düğmelerini güncelle
    const root = host?.querySelector('.nt');
    root?.querySelector('[data-mode="new"]')?.classList.remove('is-active');
    root?.querySelector('.nt-status')?.insertAdjacentHTML(
      'afterend',
      `
      <button type="button" class="nt-icon" data-act="pin" title="Üste sabitle">${PIN}</button>
      <button type="button" class="nt-icon" data-act="delete" title="Notu sil">${ICONS.trash13}</button>`,
    );
    setStatus(STATUS_SAVED);
    return;
  }
  if (current.title === title && current.body === body && current.color === draftColor) {
    setStatus(STATUS_SAVED);
    return;
  }
  setStatus('Kaydediliyor…');
  const fields = { title, body, color: draftColor };
  Object.assign(current, fields, { updated_at: new Date().toISOString() });
  const { error } = await supabase.from('notes').update(fields).eq('id', current.id);
  setStatus(error ? 'Kaydedilemedi' : STATUS_SAVED);
  if (error) showToast('Not kaydedilemedi.', 'error');
}

async function onEditorBarClick(e) {
  const color = e.target.closest('.nt-color');
  if (color) {
    draftColor = color.dataset.color;
    host.querySelectorAll('.nt-editor .nt-color').forEach(x => x.classList.toggle('is-selected', x === color));
    host.querySelector('.nt-editor').style.setProperty('--note', draftColor);
    scheduleSave(COLOR_SAVE_DELAY_MS);
    return;
  }
  if (!current) return;
  if (e.target.closest('[data-act="share"]')) {
    await flushSave();
    openSharePicker(current);
    return;
  }
  if (e.target.closest('[data-act="pin"]')) {
    current.pinned = !current.pinned;
    e.target.closest('[data-act="pin"]').classList.toggle('is-on', current.pinned);
    await supabase.from('notes').update({ pinned: current.pinned }).eq('id', current.id);
    return;
  }
  if (e.target.closest('[data-act="delete"]')) {
    if (await deleteNote(current)) {
      mode = 'list';
      current = null;
      paint();
    }
  }
}

async function deleteNote(note) {
  const ok = await confirmDialog({
    title: 'Not silinsin mi?',
    message: `"${note.title || descText(note.body).slice(0, 40) || 'Başlıksız not'}" kalıcı olarak silinecek.`,
    confirmText: 'Sil',
    danger: true,
  });
  if (!ok) return false;
  clearTimeout(saveTimer);
  notes = (notes || []).filter(n => n.id !== note.id);
  const { error } = await supabase.from('notes').delete().eq('id', note.id);
  if (error) {
    showToast('Silinemedi.', 'error');
    load();
    return false;
  }
  // Paylaşılan kopyalar aynı görselleri kullanır; hiç paylaşım yapılmadıysa silmek güvenli
  const paths = imagePaths(note.body);
  if (paths.length) {
    const { count } = await supabase
      .from('note_shares')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', state.userId);
    if (!count) removeObjects(BUCKETS.notes, paths);
  }
  return true;
}

async function onGridClick(e) {
  const card = e.target.closest('.nt-card');
  if (!card) return;
  const note = notes.find(n => n.id === card.dataset.id);
  if (!note) return;
  if (e.target.closest('[data-act="pin"]')) {
    note.pinned = !note.pinned;
    sortNotes();
    paintList();
    await supabase.from('notes').update({ pinned: note.pinned }).eq('id', note.id);
    return;
  }
  if (e.target.closest('[data-act="delete"]')) {
    if (await deleteNote(note)) paintList();
    return;
  }
  if (e.target.closest('[data-act="share"]')) {
    openSharePicker(note);
    return;
  }
  mode = 'edit';
  current = note;
  paint();
}

function sortNotes() {
  notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
}

function paintList() {
  const grid = host?.querySelector('.nt-grid');
  if (!grid) return;
  if (notes === null) {
    grid.innerHTML = tilesSkeleton(6, 120);
    return;
  }
  sortNotes();
  const list = query
    ? notes.filter(n => (n.title + ' ' + descText(n.body)).toLocaleLowerCase('tr').includes(query))
    : notes;
  grid.innerHTML = list.length
    ? list
        .map(n => {
          // Blok sonları önizlemede satır sonu olarak korunur
          const imageCount = ((n.body || '').match(/<img/g) || []).length;
          const text = (n.body || '')
            .split(/<(?:br|\/p|\/div|\/li|\/h[1-6])[^>]*>/i)
            .map(descText)
            .filter(Boolean)
            .join('\n');
          return `
    <article class="nt-card ${n.pinned ? 'is-pinned' : ''}" data-id="${n.id}" style="background:${escHtml(n.color)}" tabindex="0" role="button" aria-label="Notu aç">
      ${n.pinned ? `<span class="nt-pin-mark" title="Sabitlendi">${PIN}</span>` : ''}
      ${n.title ? `<h3 class="nt-card-title">${escHtml(n.title)}</h3>` : ''}
      <p class="nt-card-text">${escHtml(text) || (imageCount ? '' : '<i>Boş not</i>')}</p>
      ${imageCount ? `<span class="nt-card-img">🖼 ${imageCount} görsel</span>` : ''}
      <footer class="nt-foot">
        <span class="nt-time">${escHtml(relativeTime(n.updated_at))}</span>
        <button type="button" class="nt-icon" data-act="share" title="Birine gönder">${SHARE}</button>
        <button type="button" class="nt-icon" data-act="pin" title="${n.pinned ? 'Sabitlemeyi kaldır' : 'Üste sabitle'}">${PIN}</button>
        <button type="button" class="nt-icon" data-act="delete" title="Sil">${ICONS.trash13}</button>
      </footer>
    </article>`;
        })
        .join('')
    : `<div class="nt-empty">${query ? 'Aramana uyan not yok.' : 'Henüz not yok. Sol üstten <b>+ Yeni not</b>’a bas.'}</div>`;
}

let picker = null;
function closePicker() {
  picker?.remove();
  picker = null;
}

/** Paylaşım pencereleri için ortak scrim; dışarı tıklama, [data-x] ve Escape kapatır */
function openScrim(html, { stopEscape = false } = {}) {
  closePicker();
  picker = document.createElement('div');
  picker.className = 'cal-scrim';
  picker.innerHTML = html;
  document.body.appendChild(picker);
  picker.addEventListener('pointerdown', e => {
    if (e.target === picker) closePicker();
  });
  picker.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (stopEscape) e.stopPropagation();
    closePicker();
  });
  picker.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', closePicker));
  return picker;
}

function openSharePicker(note) {
  const people = Object.values(social.directory)
    .filter(p => p.id !== state.userId)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const el = openScrim(
    `
    <div class="cal-modal is-narrow" role="dialog" aria-modal="true" aria-label="Notu paylaş">
      <header class="cal-modal-head"><h2>Notu kime gönderelim?</h2><button type="button" class="settings-close" data-x aria-label="Kapat">${ICONS.x}</button></header>
      <p class="nt-sub" style="margin:0 0 10px">Notun şu anki hali gönderilir; o kişi kendi notlarına kaydedebilir.</p>
      <input type="search" class="cal-input nt-share-search" placeholder="Kişi ara…" aria-label="Kişi ara">
      <div class="nt-share-list">${
        people
          .map(
            p => `
        <button type="button" class="nt-share-person" data-id="${p.id}"><span class="cal-pav" style="background:${cssColor(p.color)}">${escHtml(p.initials)}</span><span>${escHtml(p.name)}<small>${escHtml(p.email || '')}</small></span></button>`,
          )
          .join('') || '<div class="nt-empty">Başka kimse yok.</div>'
      }
      </div>
    </div>`,
    { stopEscape: true },
  );
  const search = el.querySelector('.nt-share-search');
  search.focus();
  search.addEventListener('input', () => {
    const q = search.value.trim().toLocaleLowerCase('tr');
    el.querySelectorAll('.nt-share-person').forEach(b => {
      b.hidden = q && !b.textContent.toLocaleLowerCase('tr').includes(q);
    });
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.querySelector('.nt-share-person:not([hidden])')?.click();
    }
  });
  el.querySelector('.nt-share-list').addEventListener('click', async e => {
    const b = e.target.closest('.nt-share-person');
    if (!b || b.disabled) return;
    b.disabled = true;
    const { error } = await supabase
      .from('note_shares')
      .insert({ recipient_id: b.dataset.id, title: note.title, body: note.body, color: note.color });
    if (error) {
      b.disabled = false;
      showToast('Gönderilemedi, tekrar dene.', 'error');
      return;
    }
    closePicker();
    showToast(`Not ${person(b.dataset.id).name} ile paylaşıldı ✓`);
  });
}

function paintShares() {
  const box = host?.querySelector('.nt-shares');
  if (!box) return;
  const list = shares || [];
  box.classList.toggle('hidden', !list.length);
  box.innerHTML = list.length
    ? `
    <h3 class="nt-shares-title">📥 Seninle paylaşılan notlar <span>${list.length}</span></h3>
    <div class="nt-shares-list">
      ${list
        .map(sh => {
          const from = person(sh.sender_id);
          return `
        <article class="nt-share" data-id="${sh.id}" style="--note:${escHtml(sh.color)}">
          <div class="nt-share-from"><span class="cal-pav" style="background:${cssColor(from.color)}">${escHtml(from.initials)}</span>${escHtml(from.name)} gönderdi · ${escHtml(relativeTime(sh.created_at))}</div>
          <div class="nt-share-title">${escHtml(sh.title || descText(sh.body).slice(0, 60) || 'Başlıksız not')}</div>
          <div class="nt-share-actions">
            <button type="button" class="nt-btn" data-act="view">Görüntüle</button>
            <button type="button" class="nt-btn is-primary" data-act="save">Notlarıma kaydet</button>
            <button type="button" class="nt-icon" data-act="dismiss" title="Kaldır" aria-label="Kaldır">${ICONS.x}</button>
          </div>
        </article>`;
        })
        .join('')}
    </div>`
    : '';
}

async function onSharesClick(e) {
  const card = e.target.closest('.nt-share');
  const sh = card && shares?.find(x => x.id === card.dataset.id);
  if (!sh) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'view') openSharePreview(sh);
  else if (act === 'save') saveShare(sh);
  else if (act === 'dismiss') {
    const ok = await confirmDialog({
      title: 'Paylaşılan not kaldırılsın mı?',
      message: 'Bu not listenden kaldırılacak; kaydetmediysen geri gelmez.',
      confirmText: 'Kaldır',
      danger: true,
    });
    if (!ok) return;
    shares = shares.filter(x => x.id !== sh.id);
    paintShares();
    await supabase.from('note_shares').delete().eq('id', sh.id);
  }
}

function openSharePreview(sh) {
  const from = person(sh.sender_id);
  const el = openScrim(`
    <div class="cal-modal nt-preview" role="dialog" aria-modal="true" style="border-top:6px solid ${escHtml(sh.color)}">
      <header class="cal-modal-head"><span class="nt-share-from" style="margin:0">${escHtml(from.name)} gönderdi</span><button type="button" class="settings-close" data-x aria-label="Kapat">${ICONS.x}</button></header>
      ${sh.title ? `<h2 class="nt-preview-title">${escHtml(sh.title)}</h2>` : ''}
      <div class="rte is-readonly"><div class="rte-content nt-preview-body">${descToHtml(sh.body)}</div></div>
      <div class="cal-actions"><span style="flex:1"></span><button type="button" class="cal-btn" data-x>Kapat</button><button type="button" class="cal-btn cal-save" data-save>Notlarıma kaydet ve aç</button></div>
    </div>`);
  hydrateImages(el.querySelector('.nt-preview-body'), noteImageUrl);
  const saveBtn = el.querySelector('[data-save]');
  saveBtn.addEventListener('click', () => {
    closePicker();
    saveShare(sh);
  });
  saveBtn.focus();
}

async function saveShare(sh) {
  const { data, error } = await supabase
    .from('notes')
    .insert({ title: sh.title, body: sh.body, color: sh.color })
    .select()
    .single();
  if (error) {
    showToast(error.code === NOTE_LIMIT_ERROR ? error.message : 'Kaydedilemedi.', 'error');
    return;
  }
  await supabase.from('note_shares').update({ saved_at: new Date().toISOString() }).eq('id', sh.id);
  shares = (shares || []).filter(x => x.id !== sh.id);
  notes = [data, ...(notes || [])];
  showToast('Not notlarına kaydedildi ✓');
  mode = 'edit';
  current = data;
  paint();
}

/** Oturum değişince modül durumunu sıfırlar */
export function resetNotes() {
  notes = null;
  shares = null;
  host = null;
  query = '';
  mode = 'list';
  current = null;
}
