/**
 * contenteditable tabanlı açıklama editörü. Değer HTML olarak saklanır ve hem kayıtta
 * hem gösterimde DOMPurify ile temizlenir; eski düz metin açıklamalar HTML'e çevrilir.
 */
import DOMPurify from 'dompurify';
import { escHtml } from '../lib/helpers.js';
import { alertDialog, promptDialog } from './dialog.js';

const ALLOWED_TAGS = [
  'p',
  'div',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'span',
  'font',
  'mark',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'blockquote',
  'a',
  'code',
  'pre',
  'hr',
  'img',
];
const ALLOWED_STYLE = new Set([
  'color',
  'background-color',
  'text-decoration',
  'text-decoration-line',
  'font-weight',
  'font-style',
  'text-align',
]);
const SAFE_VALUE = /^[#a-z0-9(),.%\s-]+$/i;

// style içinde yalnızca izinli özellikler ve güvenli değerler kalır (url(), expression() elenir)
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'style') {
    const kept = [];
    for (const decl of data.attrValue.split(';')) {
      const [prop, ...rest] = decl.split(':');
      const name = (prop || '').trim().toLowerCase();
      const value = rest.join(':').trim();
      if (ALLOWED_STYLE.has(name) && SAFE_VALUE.test(value)) kept.push(`${name}: ${value}`);
    }
    data.attrValue = kept.join('; ');
    if (!kept.length) data.keepAttr = false;
  }
});
// Bağlantılar yeni sekmede, opener sızdırmadan açılır
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Depo yolu: <user_id>/<dosya>
const IMG_PATH = /^[0-9a-f-]{36}\/[\w.-]+$/i;

function sanitizeHtml(html) {
  const clean = DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['style', 'href', 'target', 'rel', 'color', 'src', 'alt', 'data-path'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  });
  if (!clean.includes('<img')) return clean;
  // Yalnızca depodaki dosyaya (data-path) bağlı görseller kalır; harici/gömülü görseller atılır
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.body.querySelectorAll('img').forEach(img => {
    if (!IMG_PATH.test(img.getAttribute('data-path') || '')) img.remove();
  });
  return doc.body.innerHTML;
}

const looksLikeHtml = s => /<\/?[a-z][\s\S]*>/i.test(s || '');

/** Geçerli bir bağlantı adresi döndürür, değilse null. `loose`: elle yazılan "ornek.com" ve e-postaları da kabul et */
function normalizeUrl(s, loose = false) {
  if (!s) return null;
  if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(s)) return s;
  if (/^www\.\S+\.\S+$/i.test(s) || (loose && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s))) return 'https://' + s;
  if (loose && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'mailto:' + s;
  return null;
}

/** Açıklama değerini (eski düz metin ya da HTML) güvenli HTML'e çevirir */
export function descToHtml(desc) {
  if (!desc) return '';
  if (looksLikeHtml(desc)) return sanitizeHtml(desc);
  return escHtml(desc).replace(/\n/g, '<br>');
}

const TEXT_COLORS = [
  '#191b2c',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#10b981',
  '#0ea5a3',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
];
const HIGHLIGHTS = ['#fef08a', '#fed7aa', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8', '#e5e7eb'];

const TOOL_ICONS = {
  bold: '<b>K</b>',
  italic: '<i style="font-family:Georgia,serif">İ</i>',
  underline: '<u>A</u>',
  strike: '<s>S</s>',
  color: `<span class="rte-color-a">A</span><span class="rte-color-bar"></span>`,
  hilite: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`,
  heading: '<span style="font-weight:800">B</span><small>aşlık</small>',
  ul: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/></svg>`,
  ol: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 4.5h1v4M3.5 8.5h2.5M3.5 14a1.2 1.2 0 0 1 2.3.5c0 .8-2.3 1.7-2.3 3h2.5" stroke-width="1.5"/></svg>`,
  link: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  clear: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/><path d="m3 3 18 18" stroke="#ef4444"/></svg>`,
};

const TOOLS = [
  { cmd: 'bold', title: 'Kalın (⌘/Ctrl + B)', icon: TOOL_ICONS.bold },
  { cmd: 'italic', title: 'İtalik (⌘/Ctrl + I)', icon: TOOL_ICONS.italic },
  { cmd: 'underline', title: 'Altı çizili (⌘/Ctrl + U)', icon: TOOL_ICONS.underline },
  { cmd: 'strikeThrough', title: 'Üstü çizili', icon: TOOL_ICONS.strike },
  { sep: true },
  { menu: 'color', title: 'Yazı rengi', icon: TOOL_ICONS.color },
  { menu: 'hilite', title: 'Vurgu (fosforlu kalem)', icon: TOOL_ICONS.hilite },
  { sep: true },
  { cmd: 'heading', title: 'Başlık', icon: TOOL_ICONS.heading, wide: true },
  { cmd: 'insertUnorderedList', title: 'Madde işaretli liste', icon: TOOL_ICONS.ul },
  { cmd: 'insertOrderedList', title: 'Numaralı liste', icon: TOOL_ICONS.ol },
  { cmd: 'link', title: 'Bağlantı ekle', icon: TOOL_ICONS.link },
  { sep: true },
  { cmd: 'removeFormat', title: 'Biçimi temizle', icon: TOOL_ICONS.clear },
];

// Aktifken araç çubuğunda basılı görünen komutlar
const STATE_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'];

const LINKPOP_URL_MAX = 48;
const LINKPOP_OFFSET = 6;
const LINKPOP_MARGIN = 8;

const openInNewTab = url => window.open(url, '_blank', 'noopener');

/** data-path'li görsellerin src'sini imzalı adresle doldurur */
export function hydrateImages(root, resolve) {
  if (!resolve) return;
  root.querySelectorAll('img[data-path]').forEach(async img => {
    if (img.getAttribute('src')) return;
    const url = await resolve(img.dataset.path);
    if (url) img.src = url;
  });
}

/**
 * @param {{ html: string, editable: boolean, placeholder: string, onCommit: (html:string)=>void,
 *           onImageFile?: (file: File) => Promise<{ path: string, url: string } | null>,
 *           resolveImage?: (path: string) => Promise<string> }} opts
 *   onImageFile yoksa yapıştırılan dosya editöre gömülmez (kart modalı onu ek olarak yükler).
 * @returns {HTMLElement} .rte kapsayıcısı; getHtml(), commit() ve destroy() taşır
 */
export function createEditor({ html, editable, placeholder, onCommit, onImageFile, resolveImage }) {
  const wrap = document.createElement('div');
  wrap.className = `rte ${editable ? '' : 'is-readonly'}`;
  wrap.innerHTML = `
    ${
      editable
        ? `<div class="rte-toolbar" role="toolbar" aria-label="Metin biçimlendirme">
      ${TOOLS.map(t =>
        t.sep
          ? '<span class="rte-sep"></span>'
          : `
        <button type="button" class="rte-btn ${t.wide ? 'is-wide' : ''}" ${t.cmd ? `data-cmd="${t.cmd}"` : `data-menu="${t.menu}"`} title="${t.title}" aria-label="${t.title}">${t.icon}</button>`,
      ).join('')}
    </div>`
        : ''
    }
    <div class="rte-content" ${editable ? 'contenteditable="true" role="textbox" aria-multiline="true"' : ''} data-placeholder="${escHtml(placeholder)}" spellcheck="true">${descToHtml(html)}</div>
  `;
  const content = wrap.querySelector('.rte-content');
  hydrateImages(content, resolveImage);

  const syncEmpty = () =>
    wrap.classList.toggle('is-empty', !content.textContent.trim() && !content.querySelector('li, hr, img'));
  syncEmpty();

  wrap.getHtml = () => {
    // İmzalı adres süreli; yalnızca depo yolu (data-path) saklanır
    const copy = content.cloneNode(true);
    copy.querySelectorAll('img[data-path]').forEach(img => img.removeAttribute('src'));
    const clean = sanitizeHtml(copy.innerHTML);
    // Yalnızca boşluk kaldıysa açıklama boş sayılır
    return content.textContent.trim() || content.querySelector('li, hr, img') ? clean : '';
  };
  let lastCommitted = wrap.getHtml();
  const commit = () => {
    const next = wrap.getHtml();
    if (next === lastCommitted) return;
    lastCommitted = next;
    onCommit(next);
  };
  wrap.commit = commit;
  if (!editable) return wrap;

  try {
    document.execCommand('styleWithCSS', false, true);
  } catch {
    /* eski tarayıcı */
  }

  // Araç çubuğuna basınca editör odağı ve seçimi kaybetmesin
  wrap.querySelector('.rte-toolbar').addEventListener('mousedown', e => {
    if (!e.target.closest('input')) e.preventDefault();
  });

  let menu = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };

  const exec = (cmd, value = null) => {
    content.focus();
    if (cmd === 'heading') {
      const block = document.queryCommandValue('formatBlock').toLowerCase();
      document.execCommand('formatBlock', false, block === 'h3' ? 'p' : 'h3');
    } else if (cmd === 'link') {
      addLink();
      return;
    } else if (cmd === 'removeFormat') {
      document.execCommand('removeFormat');
      document.execCommand('unlink');
      if (/^h[23]$/i.test(document.queryCommandValue('formatBlock'))) document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand(cmd, false, value);
    }
    syncEmpty();
    syncActive();
  };

  // Diyalog açılınca seçim kaybolur: saklanıp sonra geri konur
  const addLink = async () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !content.contains(sel.anchorNode)) {
      await alertDialog({
        title: 'Önce yazıyı seç',
        message: 'Bağlantı yapmak istediğin kelimeyi fareyle seç, sonra bu düğmeye bas.',
      });
      content.focus();
      return;
    }
    const range = sel.getRangeAt(0).cloneRange();
    wrap.suspended = true; // diyalog odağı alınca focusout commit'i tetiklemesin
    let url = await promptDialog({
      title: 'Bağlantı ekle',
      message: 'Seçili yazı bu adrese bağlanacak.',
      placeholder: 'ör. www.ornek.com',
      confirmText: 'Ekle',
    });
    wrap.suspended = false;
    content.focus();
    sel.removeAllRanges();
    sel.addRange(range);
    url = normalizeUrl((url || '').trim(), true);
    if (!url) return;
    document.execCommand('createLink', false, url);
    syncEmpty();
  };

  // Düzenlenebilir alanda linke tık imleç koyar; bu yüzden Aç/Düzenle/Kaldır kutusu açılır (⌘/Ctrl + tık doğrudan açar)
  let linkPop = null;
  const closeLinkPop = () => {
    linkPop?.remove();
    linkPop = null;
  };
  const changed = () => {
    syncEmpty();
    content.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const openLinkPop = a => {
    closeLinkPop();
    linkPop = document.createElement('div');
    linkPop.className = 'rte-linkpop';
    const shortUrl = a.href.replace(/^https?:\/\//, '').slice(0, LINKPOP_URL_MAX);
    linkPop.innerHTML = `
      <a class="rte-linkpop-url" href="${escHtml(a.href)}" target="_blank" rel="noopener noreferrer" title="${escHtml(a.href)}">${escHtml(shortUrl)}</a>
      <button type="button" data-l="open">Aç ↗</button>
      <button type="button" data-l="edit">Düzenle</button>
      <button type="button" data-l="remove" class="is-danger">Kaldır</button>`;
    wrap.appendChild(linkPop);
    const r = a.getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    const maxLeft = box.width - linkPop.offsetWidth - LINKPOP_MARGIN;
    linkPop.style.top = `${r.bottom - box.top + LINKPOP_OFFSET}px`;
    linkPop.style.left = `${Math.max(LINKPOP_MARGIN, Math.min(r.left - box.left, maxLeft))}px`;
    linkPop.addEventListener('mousedown', e => {
      if (!e.target.closest('.rte-linkpop-url')) e.preventDefault();
    });
    linkPop.addEventListener('click', async e => {
      const act = e.target.closest('[data-l]')?.dataset.l;
      // Adresin kendisi bir <a>; tarayıcı yeni sekmede açar
      if (!act) {
        closeLinkPop();
        return;
      }
      if (act === 'open') {
        openInNewTab(a.href);
        closeLinkPop();
        return;
      }
      if (act === 'remove') {
        a.replaceWith(...a.childNodes);
        closeLinkPop();
        changed();
        return;
      }
      closeLinkPop();
      wrap.suspended = true;
      const next = await promptDialog({
        title: 'Bağlantıyı düzenle',
        placeholder: 'ör. www.ornek.com',
        value: a.getAttribute('href'),
        confirmText: 'Kaydet',
      });
      wrap.suspended = false;
      content.focus();
      const url = next === null ? null : normalizeUrl(next.trim(), true);
      if (url) {
        a.setAttribute('href', url);
        changed();
      }
    });
  };
  content.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) {
      closeLinkPop();
      return;
    }
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      openInNewTab(a.href);
      return;
    }
    openLinkPop(a);
  });
  content.addEventListener('keydown', () => closeLinkPop());
  content.addEventListener('scroll', closeLinkPop, { passive: true });

  const openMenu = (btn, kind) => {
    const was = menu?.dataset.kind;
    closeMenu();
    if (was === kind) return;
    const isText = kind === 'color';
    const colors = isText ? TEXT_COLORS : HIGHLIGHTS;
    const command = isText ? 'foreColor' : 'hiliteColor';
    menu = document.createElement('div');
    menu.className = 'rte-menu';
    menu.dataset.kind = kind;
    menu.innerHTML = `
      <div class="rte-menu-title">${isText ? 'Yazı rengi' : 'Vurgu rengi'}</div>
      <div class="rte-swatches">
        ${colors.map(c => `<button type="button" class="rte-swatch" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
      </div>
      <button type="button" class="rte-menu-reset">${isText ? 'Varsayılan renk' : 'Vurguyu kaldır'}</button>`;
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => {
      const swatch = e.target.closest('.rte-swatch');
      if (swatch) {
        exec(command, swatch.dataset.color);
        if (isText) wrap.querySelector('.rte-color-bar').style.background = swatch.dataset.color;
      } else if (e.target.closest('.rte-menu-reset')) {
        exec(command, isText ? 'inherit' : 'transparent');
      } else {
        return;
      }
      closeMenu();
    });
    btn.after(menu);
    menu.style.left = `${btn.offsetLeft}px`;
  };

  wrap.querySelector('.rte-toolbar').addEventListener('click', e => {
    const btn = e.target.closest('.rte-btn');
    if (!btn) return;
    if (btn.dataset.menu) {
      openMenu(btn, btn.dataset.menu);
      return;
    }
    closeMenu();
    exec(btn.dataset.cmd);
  });

  const syncActive = () => {
    if (!wrap.contains(document.activeElement)) return;
    for (const cmd of STATE_CMDS) {
      let on = false;
      try {
        on = document.queryCommandState(cmd);
      } catch {
        /* desteklenmeyen komut */
      }
      wrap.querySelector(`[data-cmd="${cmd}"]`)?.classList.toggle('is-active', on);
    }
    const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    wrap.querySelector('[data-cmd="heading"]')?.classList.toggle('is-active', block === 'h3');
  };
  document.addEventListener('selectionchange', syncActive);

  content.addEventListener('input', syncEmpty);
  const insertImages = async files => {
    for (const f of files) {
      const res = await onImageFile(f);
      if (!res) continue;
      content.focus();
      document.execCommand(
        'insertHTML',
        false,
        `<img data-path="${escHtml(res.path)}" src="${escHtml(res.url)}" alt=""><br>`,
      );
    }
    changed();
  };
  content.addEventListener('drop', e => {
    const imgs = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!imgs.length || !onImageFile) return;
    e.preventDefault();
    insertImages(imgs);
  });
  content.addEventListener('click', e => {
    const img = e.target.closest('img[src]');
    if (img && (e.metaKey || e.ctrlKey)) openInNewTab(img.src);
  });
  content.addEventListener('dblclick', e => {
    const img = e.target.closest('img[src]');
    if (img) openInNewTab(img.src);
  });

  // Yapıştırılan HTML de temizlenir (Word/web biçim artıkları)
  content.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      // Tarayıcı görseli base64 olarak gömmesin
      e.preventDefault();
      const imgs = files.filter(f => f.type.startsWith('image/'));
      if (imgs.length && onImageFile) insertImages(imgs);
      return; // onImageFile yoksa üst dinleyici dosyayı ek olarak yükler
    }
    const htmlData = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain');
    if (!htmlData && !text) return;
    e.preventDefault();
    // Tek adres yapıştırıldıysa: seçim varsa linke çevrilir, yoksa adres link olarak eklenir
    const url = normalizeUrl((text || '').trim());
    if (url && !/\s/.test(text.trim())) {
      const sel = window.getSelection();
      const hasSelection = sel && !sel.isCollapsed && content.contains(sel.anchorNode);
      if (hasSelection) {
        document.execCommand('createLink', false, url);
      } else {
        const link = `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(text.trim())}</a>`;
        document.execCommand('insertHTML', false, `${link}&nbsp;`);
      }
      syncEmpty();
      return;
    }
    const clean = htmlData ? sanitizeHtml(htmlData) : escHtml(text).replace(/\n/g, '<br>');
    document.execCommand('insertHTML', false, clean);
    syncEmpty();
  });
  content.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu) {
      e.stopPropagation();
      closeMenu();
    }
  });

  // Odak editörden tamamen çıkınca kaydet
  wrap.addEventListener('focusout', e => {
    if (wrap.suspended || wrap.contains(e.relatedTarget)) return;
    closeMenu();
    closeLinkPop();
    commit();
  });
  wrap.destroy = () => document.removeEventListener('selectionchange', syncActive);
  return wrap;
}

/** Yeniden çizim sırasında seçimi korumak için saveSelection/restoreSelection çifti */
export function saveSelection(root) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !root.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  return { sc: r.startContainer, so: r.startOffset, ec: r.endContainer, eo: r.endOffset };
}

export function restoreSelection(root, saved) {
  const content = root.querySelector('.rte-content');
  content?.focus({ preventScroll: true });
  if (!saved || !root.contains(saved.sc)) return;
  try {
    const r = document.createRange();
    r.setStart(saved.sc, saved.so);
    r.setEnd(saved.ec, saved.eo);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    /* düğüm değişmiş olabilir */
  }
}
