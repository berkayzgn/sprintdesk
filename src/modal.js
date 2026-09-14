// ============================================================
// MODAL — Kart detay modal (masaüstü)
// ============================================================
import { state, setState, updateCard, getActiveLists, getActiveBoard } from './state.js';
import { findRawCard, getOpenCardView, escHtml, newId, boardMembers, collectImages, restoreImages, ICONS } from './helpers.js';
import { openMemberPicker, closeMemberPicker } from './memberPicker.js';
import { putFile, deleteFile } from './files.js';
import { PEOPLE, CURRENT_USER_ID } from './data.js';
import { showToast } from './toast.js';
import { openRangePicker, closeRangePicker } from './datepicker.js';

const FILE_ICON = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Dosya adından uzantıyı (kısa) döndürür */
function fileExt(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toUpperCase().slice(0, 4) : 'DOSYA';
}

// Fare basılıyken bir input blur olursa commit'i tıklama bitene kadar
// ertele: commit modalı yeniden çizer ve basılan butonu DOM'dan silerek
// tıklamayı yutuyordu.
let pointerDown = false;
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => { pointerDown = false; }, true);

function afterPointerUp(fn) {
  if (!pointerDown) { fn(); return; }
  document.addEventListener('pointerup', () => setTimeout(fn, 0), { once: true, capture: true });
}

let fileInput = null;

function ensureFileInput() {
  if (fileInput) return;
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  // Her dosya türüne izin ver (görsel veya değil)
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const cardId = state.openCardId;
    if (!files.length || !cardId) return;

    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        showToast(`${f.name} çok büyük (en fazla 25 MB).`, 'error');
        continue;
      }
      const id = newId('a');
      try {
        await putFile(id, f);
      } catch (err) {
        console.error('[modal] dosya kaydedilemedi', err);
        showToast(`${f.name} kaydedilemedi.`, 'error');
        continue;
      }
      updateCard(cardId, c => ({
        ...c,
        attachments: [...(c.attachments || []), {
          id,
          fileKey: id,
          type: (f.type || '').startsWith('image/') ? 'image' : 'file',
          name: f.name,
          size: f.size,
          mime: f.type || '',
        }],
      }));
    }
  });
}

/** Dosya boyutunu okunur biçime çevirir */
function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Tarih çipi: tıklanınca başlangıç/bitiş aralık takvimi açılır. Görünmez
 * input takvimin konum ve focus/blur çapası.
 */
function dueChipHTML({ key, startAt, dueAt, label, style, emptyText, compact = false }) {
  const set = !!dueAt;
  return `
    <span class="due-chip ${set ? 'is-set' : ''} ${compact ? 'compact' : ''}" data-due-key="${escHtml(key)}"
      data-start="${escHtml(startAt || '')}" data-due="${escHtml(dueAt || '')}" style="${set ? style : ''}">
      <input class="due-anchor" readonly tabindex="-1" aria-hidden="true">
      <button type="button" class="due-chip-open" title="Başlangıç ve bitiş tarihi seç">${ICONS.cal}<span>${escHtml(set ? label : emptyText)}</span></button>
      ${set ? `<button type="button" class="due-chip-clear" title="Tarihi kaldır">${ICONS.x}</button>` : ''}
    </span>
  `;
}

/** Bir kapsayıcıdaki tüm tarih çiplerini bağlar */
function bindDueChips(root, onChange) {
  root.querySelectorAll('.due-chip').forEach(chip => {
    const key = chip.dataset.dueKey;
    chip.querySelector('.due-chip-open').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      openRangePicker(
        chip.querySelector('.due-anchor'),
        { startAt: chip.dataset.start || null, dueAt: chip.dataset.due || null },
        range => onChange(key, range),
      );
    });
    chip.querySelector('.due-chip-clear')?.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      onChange(key, { startAt: null, dueAt: null });
    });
  });
}

export function renderModal(container) {
  ensureFileInput();
  const s = state;
  const found = s.openCardId ? findRawCard(getActiveLists(), s.openCardId) : null;
  if (!found) { closeRangePicker(); closeMemberPicker(); container.innerHTML = ''; return; }

  const cv = getOpenCardView(found.card, found.listTitle);
  const pct = cv.checklistPct;

  // Aynı kart yeniden çiziliyorsa scroll konumunu ve yazılmakta olan yorumu koru
  const prevScrim = container.querySelector('#modal-scrim');
  const sameCard = prevScrim && prevScrim.dataset.cardId === cv.id;
  const prevScroll = sameCard ? prevScrim.scrollTop : 0;
  const prevComment = sameCard ? (container.querySelector('#modal-comment-ta')?.value || '') : '';
  const prevCheckDraft = sameCard ? (container.querySelector('#checklist-add-inp')?.value || '') : '';
  const oldImages = sameCard ? collectImages(container) : new Map();
  if (!sameCard) closeMemberPicker();

  container.innerHTML = `
    <div id="modal-scrim" class="${sameCard ? '' : 'is-entering'}" data-card-id="${escHtml(cv.id)}">
      <div class="modal-box">
        ${cv.hasCover ? `<div class="modal-cover">${cv.cover ? `<img src="${escHtml(cv.cover)}" alt="">` : ''}</div>` : ''}

        <div class="modal-titlebar">
          <div class="modal-title-icon">${ICONS.card}</div>
          <div class="modal-title-area">
            <input class="modal-title-input" id="modal-title-inp" value="${escHtml(cv.title)}" placeholder="Kart başlığı…">
            <div class="modal-list-label">Liste: <span>${escHtml(cv.listTitle)}</span></div>
          </div>
          <button class="modal-close-btn" id="modal-close-btn">${ICONS.x20}</button>
        </div>

        <div class="modal-body">
          <!-- MAIN -->
          <div class="modal-main">

            <!-- Due -->
            <div style="display:flex;gap:22px;flex-wrap:wrap">
              <div>
                <div class="field-label">Tarih</div>
                <div class="due-field">
                  ${dueChipHTML({ key: 'card', startAt: cv.startAt, dueAt: cv.dueAt, label: cv.dueLabel, style: cv.dueStyle, emptyText: 'Tarih ekle' })}
                  ${cv.hasDue ? `
                    <label class="due-complete">
                      <input type="checkbox" id="due-complete-cb" ${cv.dueComplete ? 'checked' : ''}>
                      Tamamlandı
                    </label>` : ''}
                </div>
              </div>
            </div>

            <!-- Description -->
            <div>
              <div class="section-heading">${ICONS.desc}<span>Açıklama</span></div>
              <textarea class="desc-textarea" id="modal-desc-ta" rows="4" placeholder="Daha ayrıntılı bir açıklama ekle…">${escHtml(cv.desc)}</textarea>
            </div>

            <!-- Checklist -->
            <div>
              <div class="section-heading">
                ${ICONS.check}<span>Alt Görevler</span>
                <span class="count">${cv.checklistDone}/${cv.checklistTotal}</span>
              </div>
              ${cv.hasChecklist ? `
              <div class="progress-bar">
                <div class="progress-fill" style="width:${pct}%"></div>
              </div>` : ''}
              <div class="checklist-items" id="checklist-items">
                ${cv.checklist.map(it => `
                  <div class="checklist-item ${it.dueAt ? 'has-due' : ''} ${it.assignee ? 'has-assignee' : ''}">
                    <label class="checklist-check">
                      <input type="checkbox" data-item-id="${escHtml(it.id)}" ${it.done ? 'checked' : ''}>
                      <span class="item-text ${it.done ? 'done' : ''}">${escHtml(it.text)}</span>
                    </label>
                    <div class="checklist-meta">
                    <button type="button" class="item-assignee ${it.assignee ? 'is-set' : ''}" data-item-id="${escHtml(it.id)}"
                      title="${it.assignee ? escHtml(it.assignee.name) + ' — değiştir' : 'Kişi ata'}"
                      ${it.assignee ? `style="background:${it.assignee.color}"` : ''}>
                      ${it.assignee ? escHtml(it.assignee.initials) : ICONS.userPlus}
                    </button>
                    ${dueChipHTML({ key: it.id, startAt: it.startAt, dueAt: it.dueAt, label: it.dueLabel, style: it.dueStyle, emptyText: 'Tarih', compact: true })}
                    </div>
                    <button class="delete-item-btn" data-item-id="${escHtml(it.id)}" type="button" title="Sil">${ICONS.trash}</button>
                  </div>
                `).join('')}
              </div>
              <div class="checklist-add-row">
                <input class="checklist-add-input" id="checklist-add-inp" placeholder="Alt görev ekle…">
                <button class="btn-add-item" id="checklist-add-btn">Ekle</button>
              </div>
            </div>

            <!-- Attachments -->
            <div>
              <div class="section-heading">${ICONS.attach}<span>Ekler</span></div>
              <div class="attachments-grid" id="attachments-grid">
                ${cv.attachments.map(att => `
                  <div class="attachment-thumb">
                    <div class="thumb-img">
                      ${att.type === 'image'
                        ? (att.url ? `<img src="${escHtml(att.url)}" alt="${escHtml(att.name)}">` : '')
                        : `<a class="file-thumb" ${att.url ? `href="${escHtml(att.url)}"` : ''} download="${escHtml(att.name)}" title="${escHtml(att.name)}">
                             ${FILE_ICON}
                             <span class="file-ext">${escHtml(fileExt(att.name))}</span>
                           </a>`}
                    </div>
                    <div class="attachment-name">${escHtml(att.name)}${att.size ? `<span class="attach-size"> · ${fmtSize(att.size)}</span>` : ''}</div>
                    <button class="remove-attach-btn" data-att-id="${escHtml(att.id)}">${ICONS.x}</button>
                  </div>
                `).join('')}
                <button class="upload-btn" id="upload-btn">
                  ${ICONS.attach}
                  Dosya Ekle
                </button>
              </div>
            </div>
          </div>

          <!-- RAIL -->
          <div class="modal-rail">
            <div>
              <div class="field-label">Üyeler</div>
              <div class="rail-members">
                ${cv.assignees.map(p => `
                  <button type="button" class="rail-avatar card-member-open" style="background:${p.color}" title="${escHtml(p.name)}">${escHtml(p.initials)}</button>
                `).join('')}
                <button type="button" class="add-member-btn card-member-open" id="card-members-btn" title="Üye ekle / çıkar">${ICONS.plus}</button>
              </div>
            </div>

            <div class="rail-divider"></div>

            <!-- Activity -->
            <div style="display:flex;flex-direction:column;gap:0">
              <div class="field-label">Aktivite · ${cv.comments.length} yorum</div>

              <!-- New comment -->
              <div class="comment-composer">
                <span class="avatar" style="width:32px;height:32px;font-size:11px;flex:0 0 auto">AY</span>
                <div class="comment-composer-body">
                  <textarea class="comment-textarea" id="modal-comment-ta" rows="3" placeholder="Yorum yaz… (Gönder: ⌘/Ctrl + Enter)"></textarea>
                  <button class="send-btn" id="comment-send-btn">Gönder</button>
                </div>
              </div>

              <!-- Comments list -->
              <div class="comments-list">
                ${cv.comments.map(cm => `
                  <div class="comment-item">
                    <span class="avatar" style="width:32px;height:32px;font-size:11px;flex:0 0 auto;background:${cm.who.color}">${escHtml(cm.who.initials)}</span>
                    <div class="comment-body">
                      <div class="comment-header">
                        <span class="comment-name">${escHtml(cm.who.name)}</span>
                        <span class="comment-time">${escHtml(cm.time)}</span>
                      </div>
                      <div class="comment-text">${escHtml(cm.text)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ---- Events ----
  // Tüm metin alanları "uncontrolled": yazarken setState YOK. Değerler
  // commit anında (blur / buton / kapatma) DOM'dan okunur — focus korunur.
  const cardId = s.openCardId;
  const scrim = container.querySelector('#modal-scrim');
  const titleInp = container.querySelector('#modal-title-inp');
  const descTa = container.querySelector('#modal-desc-ta');
  const commentTa = container.querySelector('#modal-comment-ta');
  const checkInp = container.querySelector('#checklist-add-inp');

  restoreImages(container, oldImages);
  scrim.scrollTop = prevScroll;
  commentTa.value = prevComment;
  checkInp.value = prevCheckDraft;

  const commitText = () => {
    const patch = {};
    if (titleInp.value !== cv.title) patch.title = titleInp.value;
    if (descTa.value !== cv.desc) patch.desc = descTa.value;
    if (Object.keys(patch).length) updateCard(cardId, patch);
  };

  const closeModal = () => { commitText(); setState({ openCardId: null }); };

  scrim.addEventListener('click', e => { if (e.target === scrim) closeModal(); });
  container.querySelector('#modal-close-btn').addEventListener('click', closeModal);

  // Başlık & açıklama — yalnızca blur'da commit (re-render typing'i bölmez)
  titleInp.addEventListener('blur', () => afterPointerUp(commitText));
  descTa.addEventListener('blur', () => afterPointerUp(commitText));
  titleInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleInp.blur(); } });

  // Son tarihler (kart + alt görevler)
  bindDueChips(container, (key, { startAt, dueAt }) => {
    if (key === 'card') {
      updateCard(cardId, c => ({ ...c, startAt, dueAt, dueComplete: dueAt ? c.dueComplete : false }));
    } else {
      updateCard(cardId, c => ({
        ...c,
        checklist: (c.checklist || []).map(it => it.id === key ? { ...it, startAt, dueAt } : it),
      }));
    }
  });
  container.querySelector('#due-complete-cb')?.addEventListener('change', e => {
    updateCard(cardId, { dueComplete: e.target.checked });
  });

  // Kart üyeleri — yalnızca board üyeleri listelenir
  const members = boardMembers(getActiveBoard());
  container.querySelectorAll('.card-member-open').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openMemberPicker(container.querySelector('#card-members-btn'), {
        title: 'Kart üyeleri',
        members,
        selected: cv.assigneeIds,
        multiple: true,
        onChange: ids => updateCard(cardId, { assignees: ids }),
      });
    });
  });

  // Alt görev ataması — tek kişi
  container.querySelectorAll('.item-assignee').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const itemId = btn.dataset.itemId;
      const item = cv.checklist.find(it => it.id === itemId);
      openMemberPicker(btn, {
        title: 'Alt görevi ata',
        members,
        selected: item?.assignee ? [item.assignee.id] : [],
        multiple: false,
        onChange: ids => updateCard(cardId, c => ({
          ...c,
          checklist: (c.checklist || []).map(it => it.id === itemId ? { ...it, assignee: ids[0] || null } : it),
        })),
      });
    });
  });

  // Checklist toggle
  container.querySelectorAll('.checklist-check input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const itemId = cb.dataset.itemId;
      updateCard(cardId, c => ({
        ...c,
        checklist: (c.checklist || []).map(it => it.id === itemId ? { ...it, done: !it.done } : it),
      }));
    });
  });

  // Checklist sil
  container.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const itemId = btn.dataset.itemId;
      updateCard(cardId, c => ({
        ...c,
        checklist: (c.checklist || []).filter(it => it.id !== itemId),
      }));
    });
  });

  // Checklist ekle — değer input'tan okunur, setState ile yazılmaz
  const addCheckItem = () => {
    const t = (checkInp.value || '').trim();
    if (!t) return;
    checkInp.value = '';
    updateCard(cardId, c => ({
      ...c,
      checklist: [...(c.checklist || []), { id: newId('k'), text: t, done: false, startAt: null, dueAt: null, assignee: null }],
    }));
    container.querySelector('#checklist-add-inp')?.focus();
  };
  container.querySelector('#checklist-add-btn').addEventListener('click', addCheckItem);
  checkInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem(); } });

  // Dosya yükle
  container.querySelector('#upload-btn').addEventListener('click', () => fileInput && fileInput.click());

  // Ek kaldır
  container.querySelectorAll('.remove-attach-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const aid = btn.dataset.attId;
      const att = (found.card.attachments || []).find(a => a.id === aid);
      if (att?.fileKey) deleteFile(att.fileKey);
      updateCard(cardId, c => ({
        ...c,
        attachments: (c.attachments || []).filter(a => a.id !== aid),
      }));
    });
  });

  // Yorum — değer textarea'dan okunur
  const sendComment = () => {
    const t = (commentTa.value || '').trim();
    if (!t) return;
    commentTa.value = '';
    updateCard(cardId, c => ({
      ...c,
      comments: [{ id: newId('cm'), who: CURRENT_USER_ID, text: t, time: 'şimdi' }, ...(c.comments || [])],
    }));
  };
  container.querySelector('#comment-send-btn').addEventListener('click', sendComment);
  commentTa.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendComment(); }
  });
}

// ---- New Board Modal ----
const BOARD_COLORS = ['#360185', '#FBC02D', '#10CAB9', '#FE6ABF'];

const ALL_MEMBERS = Object.entries(PEOPLE).map(([id, p]) => ({ id, ...p }));

export function renderNewBoardModal(container) {
  if (!state.newBoardModal) { container.innerHTML = ''; return; }
  // Only build DOM once — avoid re-render on every state change (breaks input focus)
  if (container.querySelector('#nb-scrim')) return;

  let selectedColor = BOARD_COLORS[0];
  let selectedMembers = new Set();

  container.innerHTML = `
    <div id="nb-scrim" style="position:fixed;inset:0;background:var(--scrim);z-index:900;display:flex;align-items:center;justify-content:center">
      <div style="background:var(--surface);border-radius:14px;padding:28px 32px;width:min(400px, calc(100vw - 32px));box-sizing:border-box;box-shadow:0 20px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:20px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h2 style="font-size:16px;font-weight:700;margin:0;color:var(--text)">Yeni Board</h2>
          <button id="nb-close" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text-muted)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Board Adı</label>
          <input id="nb-name-inp" placeholder="Örn: Pazarlama Kampanyası"
            style="border:1.5px solid var(--border);border-radius:8px;padding:9px 12px;font-size:14px;outline:none;background:var(--chip-bg);color:var(--text);width:100%;box-sizing:border-box">
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Renk</label>
          <div style="display:flex;gap:10px" id="nb-color-row">
            ${BOARD_COLORS.map((c, i) => `
              <button data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:${i === 0 ? '3px solid var(--text)' : '3px solid transparent'};cursor:pointer;outline:none;padding:0;transition:border .15s"></button>
            `).join('')}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Üye Ekle</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap" id="nb-members-row">
            ${ALL_MEMBERS.map(m => `
              <button data-member="${m.id}" title="${m.name}"
                style="display:flex;align-items:center;gap:7px;padding:5px 10px 5px 5px;border-radius:20px;border:2px solid transparent;background:var(--chip-bg);cursor:pointer;transition:all .15s;font-size:13px;font-weight:600;color:var(--text)">
                <span style="width:26px;height:26px;border-radius:50%;background:${m.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${m.initials}</span>
                ${m.name.split(' ')[0]}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
          <button id="nb-cancel" style="padding:8px 18px;border-radius:8px;border:1.5px solid var(--border);background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">İptal</button>
          <button id="nb-create" style="padding:8px 18px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Oluştur</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { container.innerHTML = ''; setState({ newBoardModal: false }); };

  container.querySelector('#nb-scrim').addEventListener('click', e => { if (e.target.id === 'nb-scrim') close(); });
  container.querySelector('#nb-close').addEventListener('click', close);
  container.querySelector('#nb-cancel').addEventListener('click', close);

  // Color selection — update DOM directly, no setState
  container.querySelectorAll('#nb-color-row [data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedColor = btn.dataset.color;
      container.querySelectorAll('#nb-color-row [data-color]').forEach(b => {
        b.style.border = b === btn ? '3px solid var(--text)' : '3px solid transparent';
      });
    });
  });

  // Member toggle — update DOM directly, no setState
  container.querySelectorAll('#nb-members-row [data-member]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.member;
      if (selectedMembers.has(id)) {
        selectedMembers.delete(id);
        btn.style.border = '2px solid transparent';
        btn.style.background = 'var(--chip-bg)';
      } else {
        selectedMembers.add(id);
        btn.style.border = '2px solid var(--accent)';
        btn.style.background = 'var(--accent-soft)';
      }
    });
  });

  container.querySelector('#nb-create').addEventListener('click', () => {
    const n = (container.querySelector('#nb-name-inp').value || '').trim();
    if (!n) { container.querySelector('#nb-name-inp').focus(); return; }
    const boardId = newId('b');
    setState({
      boards: [...(state.boards || []), {
        id: boardId,
        name: n,
        color: selectedColor,
        members: [...new Set([CURRENT_USER_ID, ...selectedMembers])],
      }],
      activeBoardId: boardId,   // yeni board'a geç (boş — empty state gösterilir)
      newBoardModal: false,
    });
    container.innerHTML = '';
  });

  container.querySelector('#nb-name-inp').focus();
}

// ---- Profile Modal ----
export function renderProfileModal(container) {
  if (!state.profileOpen) { container.innerHTML = ''; return; }
  if (container.querySelector('#prof-scrim')) return;

  const INP = `border:1.5px solid var(--border);border-radius:8px;padding:9px 12px;font-size:14px;outline:none;background:var(--chip-bg);color:var(--text);width:100%;box-sizing:border-box`;
  const LABEL = `font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px`;
  const SECTION = `display:flex;flex-direction:column;gap:6px`;
  const DIVIDER = `<div style="height:1px;background:var(--border);margin:4px 0"></div>`;

  container.innerHTML = `
    <div id="prof-scrim" style="position:fixed;inset:0;background:var(--scrim);z-index:900;display:flex;align-items:center;justify-content:center">
      <div style="background:var(--surface);border-radius:18px;width:min(560px, calc(100vw - 24px));max-height:90vh;overflow-y:auto;box-shadow:0 24px 72px rgba(0,0,0,.28);display:flex;flex-direction:column">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:24px 28px 20px">
          <h2 style="font-size:17px;font-weight:700;margin:0;color:var(--text)">Hesap & Profil</h2>
          <button id="prof-close" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text-muted)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style="padding:0 28px 28px;display:flex;flex-direction:column;gap:24px">

          <!-- Avatar + isim -->
          <div style="display:flex;align-items:center;gap:18px;padding:20px;background:var(--canvas);border-radius:12px">
            <div style="position:relative;flex:0 0 auto">
              <span style="width:72px;height:72px;border-radius:50%;background:var(--accent);color:#fff;font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center">AY</span>
              <button style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:var(--accent);border:2px solid var(--surface);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
            <div>
              <div style="font-size:20px;font-weight:700;color:var(--text)">Ayşe Yılmaz</div>
              <div id="prof-email-label" style="font-size:13px;color:var(--text-muted);margin-top:2px">${escHtml(state.userEmail || '')}</div>
              <span style="display:inline-block;margin-top:6px;font-size:11px;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:3px 10px;border-radius:20px">Premium Plan</span>
            </div>
          </div>

          <!-- E-posta -->
          <div style="${SECTION}">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px">E-posta Adresi</div>
            <label style="${LABEL}">Mevcut e-posta</label>
            <input id="prof-email" value="${escHtml(state.userEmail || '')}" style="${INP}">
            <button id="prof-save-email" style="align-self:flex-end;padding:7px 16px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;font-weight:600;margin-top:2px">Güncelle</button>
          </div>

          ${DIVIDER}

          <!-- Şifre -->
          <div style="${SECTION}">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px">Şifre</div>
            <label style="${LABEL}">Mevcut şifre</label>
            <input id="prof-pw-current" type="password" placeholder="••••••••" style="${INP}">
            <label style="${LABEL};margin-top:8px">Yeni şifre</label>
            <input id="prof-pw-new" type="password" placeholder="En az 8 karakter" style="${INP}">
            <label style="${LABEL};margin-top:8px">Yeni şifre (tekrar)</label>
            <input id="prof-pw-confirm" type="password" placeholder="••••••••" style="${INP}">
            <div id="prof-pw-msg" style="font-size:12px;min-height:16px;margin-top:2px"></div>
            <button id="prof-save-pw" style="align-self:flex-end;padding:7px 16px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Şifreyi Güncelle</button>
          </div>

          ${DIVIDER}

          <!-- Çıkış Yap -->
          <button id="prof-logout" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:10px;border:1.5px solid rgba(239,68,68,.35);background:rgba(239,68,68,.08);color:#ef4444;cursor:pointer;font-size:14px;font-weight:700;width:100%">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Çıkış Yap
          </button>

        </div>
      </div>
    </div>
  `;

  const close = () => { container.innerHTML = ''; setState({ profileOpen: false }); };
  container.querySelector('#prof-scrim').addEventListener('click', e => { if (e.target.id === 'prof-scrim') close(); });
  container.querySelector('#prof-close').addEventListener('click', close);

  // E-posta güncelle
  container.querySelector('#prof-save-email').addEventListener('click', () => {
    const v = container.querySelector('#prof-email').value.trim();
    if (!v || !v.includes('@')) return;
    // Profil modalı build-once olduğu için setState onu yeniden çizmez (açık kalır)
    setState({ userEmail: v });
    container.querySelector('#prof-email-label').textContent = v;
    const btn = container.querySelector('#prof-save-email');
    btn.textContent = 'Kaydedildi ✓';
    btn.style.background = '#10b981';
    setTimeout(() => { btn.textContent = 'Güncelle'; btn.style.background = 'var(--accent)'; }, 2000);
  });

  // Şifre güncelle
  container.querySelector('#prof-save-pw').addEventListener('click', () => {
    const cur = container.querySelector('#prof-pw-current').value;
    const nw  = container.querySelector('#prof-pw-new').value;
    const cnf = container.querySelector('#prof-pw-confirm').value;
    const msg = container.querySelector('#prof-pw-msg');
    if (!cur) { msg.style.color = '#ef4444'; msg.textContent = 'Mevcut şifreyi girin.'; return; }
    if (nw.length < 8) { msg.style.color = '#ef4444'; msg.textContent = 'Yeni şifre en az 8 karakter olmalı.'; return; }
    if (nw !== cnf) { msg.style.color = '#ef4444'; msg.textContent = 'Şifreler eşleşmiyor.'; return; }
    msg.style.color = '#10b981'; msg.textContent = 'Şifre güncellendi ✓';
    container.querySelector('#prof-pw-current').value = '';
    container.querySelector('#prof-pw-new').value = '';
    container.querySelector('#prof-pw-confirm').value = '';
  });

  // Çıkış — login ekranına dön
  container.querySelector('#prof-logout').addEventListener('click', () => {
    container.innerHTML = '';
    setState({ profileOpen: false, authed: false });
  });
}
