// ============================================================
// LOGIN — Giriş ekranı + ilk girişte şifre belirleme
// (iki kolonlu: form + marka paneli)
// ============================================================
// Kayıt yok: hesapları yönetici açar (bkz. users.js). Yöneticinin açtığı
// ya da şifresini sıfırladığı hesap ilk girişte 'setup' moduna düşer ve
// yeni şifre belirlemeden uygulamaya geçemez.
// ============================================================
import { state } from './state.js';
import { escHtml } from './helpers.js';
import { signIn, signOut, setInitialPassword } from './auth.js';
import logoUrl from './assets/logo.webp';

export const MIN_PASSWORD = 8;

const COPY = {
  login: {
    title: 'Tekrar hoş geldin',
    sub: 'Çalışma alanına giriş yap',
    submit: 'Giriş yap',
    busy: 'Giriş yapılıyor…',
    heroTitle: 'İşini akışta tut.',
    heroText: "Board'lar, listeler ve kartlarla ekibinin tüm işini tek yerde organize et.",
  },
  setup: {
    title: 'Yeni şifreni belirle',
    sub: 'Hesabın geçici bir şifreyle açıldı. Devam etmek için kendine ait bir şifre belirle.',
    submit: 'Şifreyi kaydet ve devam et',
    busy: 'Kaydediliyor…',
    heroTitle: 'Hoş geldin!',
    heroText: 'Şifreni belirledikten sonra ekibinin board’larına hemen ulaşabilirsin.',
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

function formHTML(mode) {
  if (mode === 'setup') {
    return `
      <form id="login-form" class="login-form" novalidate>
        <input type="email" autocomplete="username" value="${escHtml(state.userEmail || '')}" hidden>
        ${passwordField('login-password', 'Yeni şifre', `En az ${MIN_PASSWORD} karakter`, 'new-password')}
        ${passwordField('setup-password-confirm', 'Yeni şifre (tekrar)', 'Şifreni tekrar gir', 'new-password')}

        <div id="login-error" class="login-error" role="alert"></div>

        <button type="submit" class="login-btn">${COPY.setup.submit}</button>
      </form>`;
  }
  return `
    <form id="login-form" class="login-form" novalidate>
      <label class="login-label" for="login-email">E-posta</label>
      <input id="login-email" type="email" class="login-input" placeholder="ornek@firma.com" autocomplete="email" value="${escHtml(state.userEmail || '')}">

      ${passwordField('login-password', 'Şifre', '••••••••', 'current-password')}

      <div id="login-error" class="login-error" role="alert"></div>

      <button type="submit" class="login-btn">${COPY.login.submit}</button>
    </form>`;
}

function footerHTML(mode) {
  if (mode === 'setup') {
    return `
      <p class="login-switch">
        ${escHtml(state.userEmail || '')} değil misin?
        <button type="button" id="login-signout" class="login-link">Çıkış yap</button>
      </p>`;
  }
  return `<p class="login-switch">Hesabın yok mu? Yöneticinden hesap açmasını iste.</p>`;
}

export function renderLogin(container) {
  const mode = !state.authed ? 'login' : state.mustChangePassword ? 'setup' : null;
  if (!mode) { container.innerHTML = ''; container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  if (container.querySelector('#login-card')?.dataset.mode === mode) return; // build-once (focus korunur)

  const copy = COPY[mode];
  container.innerHTML = `
    <div id="login-bg">
      <!-- SOL: Form -->
      <div id="login-left">
        <div id="login-card" data-mode="${mode}">
          <div class="login-brand">
            <span class="brand-logo"><img src="${logoUrl}" alt="KYNC Teknoloji"></span>
            <span class="login-brand-name">Sprintdesk</span>
          </div>
          <h1 class="login-title">${copy.title}</h1>
          <p class="login-sub">${copy.sub}</p>

          ${formHTML(mode)}

          ${footerHTML(mode)}
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
  const emailInp = container.querySelector('#login-email');
  const pwInp = container.querySelector('#login-password');
  const confirmInp = container.querySelector('#setup-password-confirm');
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
    const pw = pwInp.value || '';

    if (mode === 'setup') {
      if (pw.length < MIN_PASSWORD) return fail(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`, pwInp);
      if (pw !== confirmInp.value) return fail('Şifreler eşleşmiyor.', confirmInp);

      setBusy(true);
      const res = await setInitialPassword(pw);
      // Başarılıysa oturum yenilenir, bayrak kalkar ve onAuthStateChange uygulamaya geçirir
      if (res.error) { setBusy(false); fail(res.error, pwInp); }
      return;
    }

    const email = (emailInp.value || '').trim();
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

  container.querySelector('#login-signout')?.addEventListener('click', () => signOut());

  (mode === 'setup' ? pwInp : emailInp).focus();
}
