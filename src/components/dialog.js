/**
 * Uygulama içi confirm/prompt/alert; hepsi Promise döndürür (true/false, metin/null, undefined).
 * Enter onaylar, Esc ve dışarı tıklama vazgeçer. `expect` verilirse yazılan değer eşleşmeden onaylanamaz.
 */
import { escHtml } from '../lib/helpers.js';

const ICON = {
  danger: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  info: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
};

function open({
  title,
  message,
  confirmText = 'Tamam',
  cancelText = 'Vazgeç',
  danger = false,
  input = null,
  hideCancel = false,
}) {
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const el = document.createElement('div');
    el.className = 'dlg-scrim';
    el.innerHTML = `
      <div class="dlg ${danger ? 'is-danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
        <div class="dlg-icon">${danger ? ICON.danger : ICON.info}</div>
        <h2 id="dlg-title" class="dlg-title">${escHtml(title)}</h2>
        ${message ? `<p id="dlg-msg" class="dlg-msg">${escHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
        ${
          input
            ? `
          ${input.expect ? `<div class="dlg-expect">Onaylamak için şunu yaz: <code>${escHtml(input.expect)}</code></div>` : ''}
          <input class="dlg-input" type="text" placeholder="${escHtml(input.placeholder || '')}" value="${escHtml(input.value || '')}" autocomplete="off" spellcheck="false">`
            : ''
        }
        <div class="dlg-actions">
          ${hideCancel ? '' : `<button type="button" class="dlg-btn dlg-cancel">${escHtml(cancelText)}</button>`}
          <button type="button" class="dlg-btn dlg-ok">${escHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    const inp = el.querySelector('.dlg-input');
    const ok = el.querySelector('.dlg-ok');
    const valid = () => !input?.expect || inp.value.trim().toLowerCase() === input.expect.toLowerCase();
    const sync = () => {
      ok.disabled = !valid();
    };
    if (inp) {
      inp.addEventListener('input', sync);
      sync();
    }

    const done = result => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
      el.remove();
      prevFocus?.focus?.({ preventScroll: true });
      resolve(result);
    };
    const accept = () => {
      if (!valid()) {
        inp?.focus();
        return;
      }
      done(input ? inp.value : true);
    };
    const cancel = () => done(input ? null : false);

    ok.addEventListener('click', accept);
    el.querySelector('.dlg-cancel')?.addEventListener('click', cancel);
    // Capture fazında yakalanır: alttaki açık popover'lar dışarı tıklama sanıp kapanmasın, Esc'i yutmasın
    const onDown = e => {
      if (!el.contains(e.target)) return;
      e.stopPropagation();
      if (e.target === el) cancel();
    };
    const onKey = e => {
      if (!el.isConnected) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        accept();
      } else if (e.key === 'Tab') {
        // Odak tuzağı
        const focusables = [...el.querySelectorAll('input, button:not(:disabled)')];
        const index = focusables.indexOf(document.activeElement);
        if (e.shiftKey && index <= 0) {
          e.preventDefault();
          focusables[focusables.length - 1].focus();
        } else if (!e.shiftKey && index === focusables.length - 1) {
          e.preventDefault();
          focusables[0].focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    // Tehlikeli işlemde varsayılan odak Vazgeç'te
    const initialFocus = inp || (danger && el.querySelector('.dlg-cancel')) || ok;
    initialFocus.focus();
    if (inp) inp.select();
  });
}

export const confirmDialog = opts => open({ confirmText: 'Evet', ...opts });
export const promptDialog = ({ placeholder, value, expect, ...opts }) =>
  open({ ...opts, input: { placeholder, value, expect } });
export const alertDialog = opts => open({ confirmText: 'Tamam', hideCancel: true, ...opts });
