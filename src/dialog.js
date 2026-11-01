// ============================================================
// DIALOG — Tarayıcının confirm/prompt/alert pencereleri yerine
// sayfa içi, uygulamayla aynı görünümde onay pencereleri
// ============================================================
// Hepsi Promise döndürür:
//   await confirmDialog({ title, message, confirmText, danger }) → true/false
//   await promptDialog({ title, message, placeholder, value, expect }) → metin | null
//   await alertDialog({ title, message }) → undefined
// Enter onaylar, Esc / dışarı tıklama vazgeçer. "expect" verilirse yazılan
// değer eşleşmeden onay butonu açılmaz (ör. silmek için e-postayı yaz).
// ============================================================
import { escHtml } from './helpers.js';

const ICON = {
  danger: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  info: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
};

function open({ title, message, confirmText = 'Tamam', cancelText = 'Vazgeç', danger = false, input = null, hideCancel = false }) {
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const el = document.createElement('div');
    el.className = 'dlg-scrim';
    el.innerHTML = `
      <div class="dlg ${danger ? 'is-danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
        <div class="dlg-icon">${danger ? ICON.danger : ICON.info}</div>
        <h2 id="dlg-title" class="dlg-title">${escHtml(title)}</h2>
        ${message ? `<p id="dlg-msg" class="dlg-msg">${escHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
        ${input ? `
          ${input.expect ? `<div class="dlg-expect">Onaylamak için şunu yaz: <code>${escHtml(input.expect)}</code></div>` : ''}
          <input class="dlg-input" type="text" placeholder="${escHtml(input.placeholder || '')}" value="${escHtml(input.value || '')}" autocomplete="off" spellcheck="false">` : ''}
        <div class="dlg-actions">
          ${hideCancel ? '' : `<button type="button" class="dlg-btn dlg-cancel">${escHtml(cancelText)}</button>`}
          <button type="button" class="dlg-btn dlg-ok">${escHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    const inp = el.querySelector('.dlg-input');
    const ok = el.querySelector('.dlg-ok');
    const valid = () => !input?.expect || inp.value.trim().toLowerCase() === input.expect.toLowerCase();
    const sync = () => { ok.disabled = !valid(); };
    if (inp) { inp.addEventListener('input', sync); sync(); }

    const done = result => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
      el.remove();
      prevFocus?.focus?.({ preventScroll: true });
      resolve(result);
    };
    const accept = () => {
      if (!valid()) { inp?.focus(); return; }
      done(input ? inp.value : true);
    };
    const cancel = () => done(input ? null : false);

    ok.addEventListener('click', accept);
    el.querySelector('.dlg-cancel')?.addEventListener('click', cancel);
    // Pencere seviyesinde yakala: alttaki açık menüler (etiket seçici vb.)
    // "dışarı tıklandı" sanıp kapanmasın, Esc'i de onlar yutmasın
    const onDown = e => {
      if (!el.contains(e.target)) return;
      e.stopPropagation();
      if (e.target === el) cancel();
    };
    const onKey = e => {
      if (!el.isConnected) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); accept(); }
      else if (e.key === 'Tab') {
        // Odak pencere içinde kalsın
        const f = [...el.querySelectorAll('input, button:not(:disabled)')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    (inp || (danger ? el.querySelector('.dlg-cancel') : ok) || ok).focus();
    if (inp) inp.select();
  });
}

export const confirmDialog = opts => open({ confirmText: 'Evet', ...opts });
export const promptDialog = ({ placeholder, value, expect, ...opts }) => open({ ...opts, input: { placeholder, value, expect } });
export const alertDialog = opts => open({ confirmText: 'Tamam', hideCancel: true, ...opts });
