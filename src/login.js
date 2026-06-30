// ============================================================
// LOGIN — Demo giriş ekranı (iki kolonlu: form + marka paneli)
// ============================================================
import { state, setState } from './state.js';
import { escHtml } from './helpers.js';

export function renderLogin(container) {
  if (state.authed) { container.innerHTML = ''; container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  if (container.querySelector('#login-card')) return; // build-once (focus korunur)

  container.innerHTML = `
    <div id="login-bg">
      <!-- SOL: Form -->
      <div id="login-left">
        <div id="login-card">
          <div class="login-brand">
            <span class="login-logo">F</span>
            <span class="login-brand-name">Flowdesk</span>
          </div>
          <h1 class="login-title">Tekrar hoş geldin</h1>
          <p class="login-sub">Çalışma alanına giriş yap</p>

          <form id="login-form" autocomplete="off">
            <label class="login-label">E-posta</label>
            <input id="login-email" type="email" class="login-input" placeholder="ornek@firma.com" value="${escHtml(state.userEmail || '')}">

            <label class="login-label" style="margin-top:14px">Şifre</label>
            <div class="login-pw-wrap">
              <input id="login-password" type="password" class="login-input" placeholder="••••••••">
              <button type="button" id="login-pw-toggle" class="login-pw-toggle" title="Göster/Gizle">👁</button>
            </div>

            <div id="login-error" class="login-error"></div>

            <button type="submit" id="login-submit" class="login-btn">Giriş Yap</button>
          </form>

          <div class="login-divider"><span>veya</span></div>
          <button id="login-sso" class="login-btn-secondary">Google ile devam et</button>

          <p class="login-hint">Demo — herhangi bir e-posta ve şifre ile giriş yapabilirsin.</p>
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
          <h2>İşini akışta tut.</h2>
          <p>Board'lar, listeler ve kartlarla ekibinin tüm işini tek yerde organize et.</p>
        </div>
      </div>
    </div>
  `;

  const emailInp = container.querySelector('#login-email');
  const pwInp = container.querySelector('#login-password');
  const errEl = container.querySelector('#login-error');

  const submit = () => {
    const email = (emailInp.value || '').trim();
    const pw = (pwInp.value || '').trim();
    if (!email || !email.includes('@')) { errEl.textContent = 'Geçerli bir e-posta gir.'; emailInp.focus(); return; }
    if (!pw) { errEl.textContent = 'Şifreni gir.'; pwInp.focus(); return; }
    container.innerHTML = '';
    setState({ authed: true, userEmail: email });
  };

  container.querySelector('#login-form').addEventListener('submit', e => { e.preventDefault(); submit(); });

  container.querySelector('#login-pw-toggle').addEventListener('click', () => {
    pwInp.type = pwInp.type === 'password' ? 'text' : 'password';
    pwInp.focus();
  });

  container.querySelector('#login-sso').addEventListener('click', () => {
    container.innerHTML = '';
    setState({ authed: true });
  });

  emailInp.focus();
}
