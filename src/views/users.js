/**
 * Yönetici kullanıcı paneli. Kayıt kapalı; hesapları yönetici geçici şifreyle açar.
 * Yetki sunucuda denetlenir (admin_* RPC'leri); buradaki isAdmin kontrolü yalnızca arayüz için.
 */
import { state, setState } from '../core/state.js';
import { supabase } from '../core/supabase.js';
import { escHtml, cssColor, initialsOf, relativeTime, ICONS } from '../lib/helpers.js';
import { MIN_PASSWORD } from './login.js';
import { loadBoards } from '../core/store.js';
import { confirmDialog, promptDialog } from '../components/dialog.js';
import { rowsSkeleton } from '../components/skeleton.js';

const DOTS_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;

// Karışan karakterler (0/O, 1/l/I) yok: şifre elle iletilecek
const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const PW_LENGTH = 12;
const COPY_FEEDBACK_MS = 1600;
const MENU_GAP = 4;
const MENU_MARGIN = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Sunucunun bilinçli fırlattığı, mesajı kullanıcıya gösterilebilir hata kodları
const USER_FACING_CODES = ['42501', '22023', '23505', 'P0002'];

const displayName = u => u.full_name || u.email.split('@')[0];

function generatePassword(length = PW_LENGTH) {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, b => PW_ALPHABET[b % PW_ALPHABET.length]).join('');
}

/** Sunucudaki raise mesajları zaten Türkçe; diğer hatalar genel mesajla gösterilir */
function rpcErrorMessage(error) {
  if (USER_FACING_CODES.includes(error?.code)) return error.message;
  console.error('[users]', error);
  return 'Bir şeyler ters gitti, tekrar dene.';
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const label = btn.textContent;
    btn.textContent = 'Kopyalandı ✓';
    setTimeout(() => {
      btn.textContent = label;
    }, COPY_FEEDBACK_MS);
  } catch {
    btn.textContent = 'Kopyalanamadı';
  }
}

function credentialsHTML(title, email, password) {
  const text = `E-posta: ${email}\nGeçici şifre: ${password}`;
  return `
    <div class="um-cred" role="status">
      <div class="um-cred-title">${escHtml(title)}</div>
      <div class="um-cred-row"><span>E-posta</span><code>${escHtml(email)}</code></div>
      <div class="um-cred-row"><span>Geçici şifre</span><code>${escHtml(password)}</code></div>
      <div class="um-cred-foot">
        <span>Bu bilgileri kişiye ilet. İlk girişte kendi şifresini belirleyecek.</span>
        <button type="button" class="um-btn-ghost um-copy" data-text="${escHtml(text)}">Kopyala</button>
      </div>
    </div>`;
}

function userRowHTML(u) {
  const name = displayName(u);
  const isMe = u.id === state.userId;
  const badges = [
    u.is_admin ? '<span class="um-badge um-badge-admin">Yönetici</span>' : '',
    u.is_suspended ? '<span class="um-badge um-badge-suspended">Askıda</span>' : '',
    u.must_change_password ? '<span class="um-badge um-badge-pending">Şifre belirlemedi</span>' : '',
  ].join('');
  const seen = u.last_sign_in_at ? `Son giriş ${relativeTime(u.last_sign_in_at)}` : 'Hiç giriş yapmadı';
  return `
    <li class="um-user ${u.is_suspended ? 'is-suspended' : ''}">
      <span class="avatar um-avatar" style="background:${cssColor(u.avatar_color)}">${escHtml(initialsOf(name))}</span>
      <div class="um-user-info">
        <div class="um-user-name">${escHtml(name)}${isMe ? ' <span class="um-me">(sen)</span>' : ''} ${badges}</div>
        <div class="um-user-meta">${escHtml(u.email)} · ${escHtml(seen)}</div>
      </div>
      ${isMe ? '' : `<button type="button" class="um-more" data-id="${u.id}" aria-label="${escHtml(name)} için işlemler" aria-haspopup="menu">${DOTS_ICON}</button>`}
    </li>`;
}

export function renderUsersModal(container) {
  if (!state.usersOpen || !state.isAdmin) {
    container.innerHTML = '';
    return;
  }
  // Bir kez kurulur; yeniden çizim odağı bozmasın
  if (container.querySelector('#um-scrim')) return;

  container.innerHTML = `
    <div id="um-scrim" class="um-scrim">
      <div class="um-dialog" role="dialog" aria-modal="true" aria-labelledby="um-title">
        <div class="um-head">
          <h2 id="um-title">Kullanıcılar</h2>
          <button type="button" id="um-close" class="um-close" aria-label="Kapat">${ICONS.x}</button>
        </div>

        <div class="um-body">
          <div class="um-section">
            <div class="um-section-title">Hesaplar <span id="um-count" class="um-count"></span></div>
            <div id="um-reset-result"></div>
            <ul id="um-list" class="um-list"><li>${rowsSkeleton(5, { avatar: true })}</li></ul>
          </div>

          <div id="um-created"></div>
          <button type="button" id="um-add" class="um-add">${ICONS.plus}<span>Yeni kullanıcı ekle</span></button>
          <form id="um-form" class="um-section um-new" novalidate hidden>
            <div class="um-section-title">Yeni kullanıcı</div>
            <div class="um-grid">
              <div>
                <label class="um-label" for="um-name">Ad Soyad</label>
                <input id="um-name" class="um-input" maxlength="80" placeholder="Ayşe Yılmaz" autocomplete="off">
              </div>
              <div>
                <label class="um-label" for="um-email">E-posta</label>
                <input id="um-email" type="email" class="um-input" placeholder="ayse@kyncteknoloji.com" autocomplete="off">
              </div>
            </div>
            <span class="um-label">Rol</span>
            <div class="um-roles" role="radiogroup" aria-label="Rol">
              <label class="um-role"><input type="radio" name="um-role" value="user" checked><span><b>Kullanıcı</b><small>Board'larda çalışır, görev ve not ekler.</small></span></label>
              <label class="um-role"><input type="radio" name="um-role" value="admin"><span><b>Yönetici</b><small>Hesap açar, askıya alır, siler; performansı görür.</small></span></label>
            </div>
            <label class="um-label" for="um-pw">Geçici şifre <small>(ilk girişte kendi şifresini belirler)</small></label>
            <div class="um-pw-row">
              <input id="um-pw" class="um-input" autocomplete="off" spellcheck="false">
              <button type="button" id="um-pw-gen" class="um-btn-ghost" title="Yeni şifre üret">Yeni üret</button>
            </div>
            <div id="um-form-msg" class="um-msg" role="alert"></div>
            <div class="um-form-actions">
              <button type="button" id="um-cancel" class="um-btn-ghost">Vazgeç</button>
              <button type="submit" id="um-create" class="um-btn-primary">Hesabı aç</button>
            </div>
          </form>

        </div>
      </div>
    </div>
  `;

  const $ = sel => container.querySelector(sel);
  const nameInp = $('#um-name');
  const emailInp = $('#um-email');
  const pwInp = $('#um-pw');
  const formMsg = $('#um-form-msg');
  const createBtn = $('#um-create');
  pwInp.value = generatePassword();

  let users = [];
  let menu = null;
  let busy = false;

  const close = () => {
    container.innerHTML = '';
    setState({ usersOpen: false });
  };
  $('#um-scrim').addEventListener('click', e => {
    if (e.target.id === 'um-scrim') close();
  });
  $('#um-close').addEventListener('click', close);
  $('#um-scrim').addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menu) {
      e.stopPropagation();
      closeMenu();
      return;
    }
    close();
  });

  // Kopyala butonları sonradan eklenen kutularda: delegasyonla tek dinleyici
  $('#um-scrim').addEventListener('click', e => {
    const btn = e.target.closest('.um-copy');
    if (btn) copyText(btn.dataset.text, btn);
  });

  $('#um-pw-gen').addEventListener('click', () => {
    pwInp.value = generatePassword();
  });

  const loadUsers = async () => {
    const list = $('#um-list');
    if (!list) return;
    const { data, error } = await supabase.rpc('admin_list_users');
    if (!$('#um-list')) return; // Pencere bu arada kapandı
    if (error) {
      list.innerHTML = `<li class="um-empty">${escHtml(rpcErrorMessage(error))}</li>`;
      return;
    }
    users = data;
    $('#um-count').textContent = String(data.length);
    list.innerHTML = data.length ? data.map(userRowHTML).join('') : '<li class="um-empty">Henüz hesap yok.</li>';
  };

  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };
  const notify = html => {
    const result = $('#um-reset-result');
    result.innerHTML = html;
    result.scrollIntoView({ block: 'nearest' });
  };
  const notifyError = error => notify(`<div class="um-msg">${escHtml(rpcErrorMessage(error))}</div>`);

  // Satırdaki ⋯ menüsünün işlemleri
  const ACTIONS = {
    async reset(u, name) {
      if (
        !(await confirmDialog({
          title: 'Geçici şifre verilsin mi?',
          message: `${name} için yeni bir geçici şifre oluşturulacak. Açık oturumları kapanacak ve bir sonraki girişte kendi şifresini belirleyecek.`,
          confirmText: 'Şifre ver',
        }))
      )
        return;
      const password = generatePassword();
      const { error } = await supabase.rpc('admin_reset_password', { p_user_id: u.id, p_password: password });
      if (error) return notifyError(error);
      notify(credentialsHTML(`${name} için geçici şifre oluşturuldu`, u.email, password));
    },
    async suspend(u, name) {
      const on = !u.is_suspended;
      if (
        on &&
        !(await confirmDialog({
          title: `${name} askıya alınsın mı?`,
          message:
            "Giriş yapamayacak ve açık oturumları kapanacak. Verileri ve board'ları silinmez; istediğin zaman askıdan çıkarabilirsin.",
          confirmText: 'Askıya al',
          danger: true,
        }))
      )
        return;
      const { error } = await supabase.rpc('admin_set_suspended', { p_user_id: u.id, p_suspended: on });
      if (error) return notifyError(error);
      notify(`<div class="um-ok">${escHtml(on ? `${name} askıya alındı.` : `${name} tekrar giriş yapabilir.`)}</div>`);
    },
    async admin(u, name) {
      const on = !u.is_admin;
      const ok = await confirmDialog(
        on
          ? {
              title: `${name} yönetici yapılsın mı?`,
              message: 'Hesap açabilecek, askıya alabilecek, silebilecek ve performans ekranını görebilecek.',
              confirmText: 'Yönetici yap',
            }
          : {
              title: 'Yöneticilik kaldırılsın mı?',
              message: `${name} artık yönetici olmayacak.`,
              confirmText: 'Kaldır',
              danger: true,
            },
      );
      if (!ok) return;
      const { error } = await supabase.rpc('admin_set_admin', { p_user_id: u.id, p_is_admin: on });
      if (error) return notifyError(error);
      notify(`<div class="um-ok">${escHtml(on ? `${name} artık yönetici.` : `${name} artık yönetici değil.`)}</div>`);
    },
    async delete(u, name) {
      const boards = u.owned_boards
        ? `\n\nSahibi olduğu ${u.owned_boards} board silinmez: sahipliği board'daki başka bir üyeye, kimse yoksa sana geçer.`
        : '';
      const typed = await promptDialog({
        title: `${name} silinsin mi?`,
        message: `Hesap kalıcı olarak silinecek. Bu işlem geri alınamaz.${boards}`,
        placeholder: u.email,
        expect: u.email,
        confirmText: 'Hesabı sil',
        danger: true,
      });
      if (typed === null) return;
      const { data, error } = await supabase.rpc('admin_delete_user', { p_user_id: u.id });
      if (error) return notifyError(error);
      const moved = data?.transferred_boards ? ` ${data.transferred_boards} board devredildi.` : '';
      notify(`<div class="um-ok">${escHtml(`${name} silindi.${moved}`)}</div>`);
      // Bize devredilen board'lar sidebar'a gelsin
      if (data?.transferred_boards) loadBoards();
    },
  };

  const openMenu = btn => {
    const u = users.find(x => x.id === btn.dataset.id);
    if (!u) return;
    const name = displayName(u);
    menu = document.createElement('div');
    menu.className = 'um-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="reset">Geçici şifre ver</button>
      <button type="button" role="menuitem" data-act="suspend">${u.is_suspended ? 'Askıdan çıkar' : 'Askıya al'}</button>
      <button type="button" role="menuitem" data-act="admin">${u.is_admin ? 'Yöneticiliği kaldır' : 'Yönetici yap'}</button>
      <div class="um-menu-sep"></div>
      <button type="button" role="menuitem" data-act="delete" class="is-danger">Hesabı sil</button>`;
    container.querySelector('.um-dialog').appendChild(menu);
    // Butonun altında, sığmazsa üstünde
    const r = btn.getBoundingClientRect();
    const h = menu.offsetHeight;
    const w = menu.offsetWidth;
    const fitsBelow = r.bottom + MENU_GAP + h <= window.innerHeight - MENU_MARGIN;
    const top = fitsBelow ? r.bottom + MENU_GAP : r.top - MENU_GAP - h;
    menu.style.top = `${Math.max(MENU_MARGIN, top)}px`;
    menu.style.left = `${Math.max(MENU_MARGIN, r.right - w)}px`;
    menu.querySelector('button').focus();

    menu.addEventListener('click', async e => {
      const item = e.target.closest('[data-act]');
      if (!item) return;
      closeMenu();
      btn.disabled = true;
      try {
        await ACTIONS[item.dataset.act](u, name);
      } finally {
        if (btn.isConnected) btn.disabled = false;
      }
      if ($('#um-list')) loadUsers();
    });
  };

  $('#um-list').addEventListener('click', e => {
    const btn = e.target.closest('.um-more');
    if (!btn || btn.disabled) return;
    const wasOpenFor = menu?.dataset.for;
    closeMenu();
    if (wasOpenFor === btn.dataset.id) return; // İkinci tıklama kapatır
    openMenu(btn);
    menu.dataset.for = btn.dataset.id;
  });
  $('#um-scrim').addEventListener('pointerdown', e => {
    if (menu && !menu.contains(e.target) && !e.target.closest('.um-more')) closeMenu();
  });
  $('.um-body').addEventListener('scroll', closeMenu, { passive: true });
  $('.um-dialog').addEventListener('scroll', closeMenu, { passive: true });

  $('#um-form').addEventListener('input', () => {
    formMsg.textContent = '';
  });
  $('#um-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const name = nameInp.value.trim();
    const email = emailInp.value.trim().toLowerCase();
    const password = pwInp.value;
    const fail = (msg, inp) => {
      formMsg.textContent = msg;
      inp?.focus();
    };
    if (!name) return fail('Ad soyad gir.', nameInp);
    if (!EMAIL_RE.test(email)) return fail('Geçerli bir e-posta gir.', emailInp);
    if (password.length < MIN_PASSWORD) return fail(`Geçici şifre en az ${MIN_PASSWORD} karakter olmalı.`, pwInp);

    busy = true;
    createBtn.disabled = true;
    createBtn.textContent = 'Açılıyor…';
    const isAdminRole = container.querySelector('input[name="um-role"]:checked')?.value === 'admin';
    const { error } = await supabase.rpc('admin_create_user', {
      p_email: email,
      p_password: password,
      p_full_name: name,
      p_is_admin: isAdminRole,
    });
    busy = false;
    if (!$('#um-form')) return;
    createBtn.disabled = false;
    createBtn.textContent = 'Hesabı aç';
    if (error) return fail(rpcErrorMessage(error), error.code === '23505' ? emailInp : null);

    $('#um-created').innerHTML = credentialsHTML(
      `${name} için ${isAdminRole ? 'yönetici ' : ''}hesabı açıldı`,
      email,
      password,
    );
    toggleForm(false);
    $('#um-created').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    nameInp.value = '';
    emailInp.value = '';
    loadUsers();
  });

  const toggleForm = open => {
    $('#um-form').hidden = !open;
    $('#um-add').hidden = open;
    if (open) {
      formMsg.textContent = '';
      $('#um-created').innerHTML = '';
      pwInp.value = generatePassword();
      container.querySelector('input[name="um-role"][value="user"]').checked = true;
      $('#um-form').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      nameInp.focus();
    }
  };
  $('#um-add').addEventListener('click', () => toggleForm(true));
  $('#um-cancel').addEventListener('click', () => {
    nameInp.value = '';
    emailInp.value = '';
    toggleForm(false);
  });

  loadUsers();
}
