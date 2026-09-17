// ============================================================
// LOGIN — Giriş / kayıt ekranı (iki kolonlu: form + marka paneli)
// ============================================================
import { state } from './state.js';
import { escHtml } from './helpers.js';
import { signIn, signUp } from './auth.js';

const MIN_PASSWORD = 8;

let mode = 'login'; // 'login' | 'register'
let draftEmail = null; // mod değişirken yazılmış e-posta kaybolmasın
let notice = '';       // form üstünde gösterilecek bilgi mesajı (ör. doğrulama maili)

const COPY = {
  login: {
    title: 'Tekrar hoş geldin',
    sub: 'Çalışma alanına giriş yap',
    submit: 'Giriş yap',
    busy: 'Giriş yapılıyor…',
    switchText: 'Hesabın yok mu?',
    switchLink: 'Kayıt ol',
    heroTitle: 'İşini akışta tut.',
    heroText: "Board'lar, listeler ve kartlarla ekibinin tüm işini tek yerde organize et.",
  },
  register: {
    title: 'Hesap oluştur',
    sub: 'Birkaç saniyede ekibinle çalışmaya başla',
    submit: 'Kayıt ol',
    busy: 'Hesap oluşturuluyor…',
    switchText: 'Zaten hesabın var mı?',
    switchLink: 'Giriş yap',
    heroTitle: 'Ekibini tek board’da topla.',
    heroText: "Board oluştur, ekip arkadaşlarını davet et, kartları birlikte ilerletin.",
  },
};

function passwordField(id, label, placeholder, autocomplete) {
  return `
    <label class="login-label" for="${id}">${label}</label>
    <div class="login-pw-wrap">
      <input id="${id}" type="password" class="login-input" placeholder="${placeholder}" autocomplete="${autocomplete}">
      <button type="button" class="login-pw-toggle" data-for="${id}" title="Göster/Gizle" aria-label="Şifreyi göster/gizle">👁</button>
    </div>`;
}

function formHTML() {
  const email = escHtml(draftEmail ?? state.userEmail ?? '');
  if (mode === 'register') {
    return `
      <form id="login-form" class="login-form" novalidate>
        <label class="login-label" for="reg-name">Ad Soyad</label>
        <input id="reg-name" type="text" class="login-input" placeholder="Ayşe Yılmaz" autocomplete="name">

        <label class="login-label" for="login-email">E-posta</label>
        <input id="login-email" type="email" class="login-input" placeholder="ornek@firma.com" autocomplete="email" value="${email}">

        ${passwordField('login-password', 'Şifre', `En az ${MIN_PASSWORD} karakter`, 'new-password')}
        ${passwordField('reg-password-confirm', 'Şifre (tekrar)', 'Şifreni tekrar gir', 'new-password')}

        <div id="login-error" class="login-error" role="alert"></div>

        <button type="submit" class="login-btn">${COPY.register.submit}</button>
      </form>`;
  }
  return `
    <form id="login-form" class="login-form" novalidate>
      <label class="login-label" for="login-email">E-posta</label>
      <input id="login-email" type="email" class="login-input" placeholder="ornek@firma.com" autocomplete="email" value="${email}">

      ${passwordField('login-password', 'Şifre', '••••••••', 'current-password')}

      <div id="login-error" class="login-error" role="alert"></div>

      <button type="submit" class="login-btn">${COPY.login.submit}</button>
    </form>`;
}

export function renderLogin(container) {
  if (state.authed) { mode = 'login'; draftEmail = null; notice = ''; container.innerHTML = ''; container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  if (container.querySelector('#login-card')?.dataset.mode === mode) return; // build-once (focus korunur)

  const copy = COPY[mode];
  container.innerHTML = `
    <div id="login-bg">
      <!-- SOL: Form -->
      <div id="login-left">
        <div id="login-card" data-mode="${mode}">
          <div class="login-brand">
            <span class="login-logo">F</span>
            <span class="login-brand-name">Sprintdesk</span>
          </div>
          <h1 class="login-title">${copy.title}</h1>
          <p class="login-sub">${copy.sub}</p>

          ${notice ? `<div class="login-notice" role="status">${escHtml(notice)}</div>` : ''}

          ${formHTML()}

          <p class="login-switch">
            ${copy.switchText}
            <button type="button" id="login-switch" class="login-link">${copy.switchLink}</button>
          </p>
        </div>
      </div>

      <!-- SAĞ: Marka paneli + 3'lü kutu illüstrasyonu -->
      <div id="login-right">
        <div class="login-illustration">
          <div class="illu-col">
            <div class="illu-card teal"></div>
            <div class="illu-card sm"></div>
            <div class="illu-card pink"></div>
          </div>
          <div class="illu-col">
            <div class="illu-card sm"></div>
            <div class="illu-card yellow"></div>
            <div class="illu-card"></div>
          </div>
          <div class="illu-col">
            <div class="illu-card"></div>
            <div class="illu-card pink sm"></div>
            <div class="illu-card teal"></div>
          </div>
        </div>
        <div class="login-right-copy">
          <h2>${copy.heroTitle}</h2>
          <p>${copy.heroText}</p>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const nameInp = container.querySelector('#reg-name');
  const emailInp = container.querySelector('#login-email');
  const pwInp = container.querySelector('#login-password');
  const confirmInp = container.querySelector('#reg-password-confirm');
  const errEl = container.querySelector('#login-error');

  const submitBtn = container.querySelector('.login-btn');
  let busy = false;

  const fail = (msg, inp) => { errEl.textContent = msg; inp?.focus(); };

  const setBusy = on => {
    busy = on;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? copy.busy : copy.submit;
  };

  const submit = async () => {
    if (busy) return;
    const email = (emailInp.value || '').trim();
    const pw = pwInp.value || '';

    if (mode === 'register') {
      const name = (nameInp.value || '').trim();
      if (!name) return fail('Adını ve soyadını gir.', nameInp);
      if (!email || !email.includes('@')) return fail('Geçerli bir e-posta gir.', emailInp);
      if (pw.length < MIN_PASSWORD) return fail(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`, pwInp);
      if (pw !== confirmInp.value) return fail('Şifreler eşleşmiyor.', confirmInp);

      setBusy(true);
      const res = await signUp({ name, email, password: pw });
      if (res.error) { setBusy(false); return fail(res.error); }
      if (res.needsConfirmation) {
        // Oturum mail linkiyle açılacak: giriş ekranına dön ve bilgilendir
        notice = `${email} adresine doğrulama linki gönderdik. Linke tıkladıktan sonra giriş yapabilirsin.`;
        draftEmail = email;
        mode = 'login';
        renderLogin(container);
      }
      // Oturum açıldıysa onAuthStateChange uygulamaya geçirir
      return;
    }

    if (!email || !email.includes('@')) return fail('Geçerli bir e-posta gir.', emailInp);
    if (!pw) return fail('Şifreni gir.', pwInp);

    setBusy(true);
    const res = await signIn(email, pw);
    if (res.error) { setBusy(false); fail(res.error); }
  };

  form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  form.addEventListener('input', () => { errEl.textContent = ''; });

  container.querySelectorAll('.login-pw-toggle').forEach(btn => btn.addEventListener('click', () => {
    const inp = container.querySelector(`#${btn.dataset.for}`);
    inp.type = inp.type === 'password' ? 'text' : 'password';
    inp.focus();
  }));

  container.querySelector('#login-switch').addEventListener('click', () => {
    draftEmail = emailInp.value.trim();
    notice = '';
    mode = mode === 'login' ? 'register' : 'login';
    renderLogin(container);
  });

  (nameInp || emailInp).focus();
}
