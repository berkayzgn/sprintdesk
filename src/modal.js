// ============================================================
// MODAL — Kart detay modal (masaüstü)
// ============================================================
import { state, setState, updateCard, getActiveLists } from './state.js';
import { findRawCard, getOpenCardView, escHtml, ICONS } from './helpers.js';

let fileInput = null;

function ensureFileInput() {
  if (fileInput) return;
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f || !state.openCardId) return;
    const r = new FileReader();
    const id = state.openCardId;
    r.onload = () => {
      updateCard(id, c => ({
        ...c,
        attachments: [...(c.attachments || []), { id: 'a' + Date.now(), type: 'image', url: r.result, name: f.name }],
      }));
    };
    r.readAsDataURL(f);
    e.target.value = '';
  });
}

export function renderModal(container) {
  ensureFileInput();
  const s = state;
  if (!s.openCardId) { container.innerHTML = ''; return; }

  const found = findRawCard(getActiveLists(), s.openCardId);
  if (!found) { container.innerHTML = ''; return; }

  const cv = getOpenCardView(found.card, found.listTitle);
  const pct = cv.checklistPct;

  container.innerHTML = `
    <div id="modal-scrim">
      <div class="modal-box">
        ${cv.hasCover ? `<div class="modal-cover"><img src="${cv.cover}" alt=""></div>` : ''}

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

            <!-- Labels + Due -->
            <div style="display:flex;gap:22px;flex-wrap:wrap">
              <div>
                <div class="field-label">Etiketler</div>
                <div class="label-tags">
                  ${cv.labels.map(lb => `<span class="label-tag" style="background:${lb.color}">${lb.name}</span>`).join('')}
                  <button class="add-label-btn">${ICONS.plus}</button>
                </div>
              </div>
              ${cv.hasDue ? `
              <div>
                <div class="field-label">Son Tarih</div>
                <span class="due-tag" style="${cv.dueStyle}">${ICONS.cal} ${cv.dueLabel}</span>
              </div>` : ''}
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
                  <label class="checklist-item">
                    <input type="checkbox" data-item-id="${it.id}" ${it.done ? 'checked' : ''}>
                    <span class="item-text ${it.done ? 'done' : ''}">${escHtml(it.text)}</span>
                    <button class="delete-item-btn" data-item-id="${it.id}" type="button">${ICONS.trash}</button>
                  </label>
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
                    <div class="thumb-img"><img src="${att.url}" alt="${escHtml(att.name)}"></div>
                    <div class="attachment-name">${escHtml(att.name)}</div>
                    <button class="remove-attach-btn" data-att-id="${att.id}">${ICONS.x}</button>
                  </div>
                `).join('')}
                <button class="upload-btn" id="upload-btn">
                  ${ICONS.image}
                  Görsel Ekle
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
                  <span class="rail-avatar" style="background:${p.color}" title="${p.name}">${p.initials}</span>
                `).join('')}
                <button class="add-member-btn">${ICONS.plus}</button>
              </div>
            </div>

            <div class="rail-divider"></div>

            <!-- Activity -->
            <div style="display:flex;flex-direction:column;gap:0">
              <div class="field-label">Aktivite</div>

              <!-- New comment -->
              <div style="display:flex;gap:9px;margin-bottom:14px">
                <span class="avatar" style="width:30px;height:30px;font-size:10.5px;flex:0 0 auto">AY</span>
                <div style="flex:1;display:flex;flex-direction:column;gap:7px">
                  <textarea class="comment-textarea" id="modal-comment-ta" rows="2" placeholder="Yorum yaz…"></textarea>
                  <button class="send-btn" id="comment-send-btn" style="margin-top:0">Gönder</button>
                </div>
              </div>

              <!-- Comments list -->
              <div class="comments-list">
                ${cv.comments.map(cm => `
                  <div class="comment-item">
                    <span class="avatar" style="width:30px;height:30px;font-size:10.5px;flex:0 0 auto;background:${cm.who.color}">${cm.who.initials}</span>
                    <div class="comment-body">
                      <div class="comment-header">
                        <span class="comment-name">${escHtml(cm.who.name)}</span>
                        <span class="comment-time">${cm.time}</span>
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
  const titleInp = container.querySelector('#modal-title-inp');
  const descTa = container.querySelector('#modal-desc-ta');

  const commitText = () => {
    const patch = {};
    if (titleInp && titleInp.value !== cv.title) patch.title = titleInp.value;
    if (descTa && descTa.value !== cv.desc) patch.desc = descTa.value;
    if (Object.keys(patch).length) updateCard(cardId, patch);
  };

  const closeModal = () => { commitText(); setState({ openCardId: null }); };

  const scrim = container.querySelector('#modal-scrim');
  scrim.addEventListener('click', e => { if (e.target === scrim) closeModal(); });
  container.querySelector('#modal-close-btn').addEventListener('click', closeModal);

  // Başlık & açıklama — yalnızca blur'da commit (re-render typing'i bölmez)
  titleInp.addEventListener('blur', commitText);
  descTa.addEventListener('blur', commitText);

  // Checklist toggle
  container.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => {
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
  const checkInp = container.querySelector('#checklist-add-inp');
  const addCheckItem = () => {
    const t = (checkInp.value || '').trim();
    if (!t) return;
    updateCard(cardId, c => ({
      ...c,
      checklist: [...(c.checklist || []), { id: 'k' + Date.now(), text: t, done: false }],
    }));
  };
  container.querySelector('#checklist-add-btn').addEventListener('click', addCheckItem);
  checkInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem(); } });

  // Görsel yükle
  container.querySelector('#upload-btn').addEventListener('click', () => fileInput && fileInput.click());

  // Ek kaldır
  container.querySelectorAll('.remove-attach-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const aid = btn.dataset.attId;
      updateCard(cardId, c => ({
        ...c,
        attachments: (c.attachments || []).filter(a => a.id !== aid),
      }));
    });
  });

  // Yorum — değer textarea'dan okunur
  const commentTa = container.querySelector('#modal-comment-ta');
  container.querySelector('#comment-send-btn').addEventListener('click', () => {
    const t = (commentTa.value || '').trim();
    if (!t) return;
    updateCard(cardId, c => ({
      ...c,
      comments: [{ id: 'cm' + Date.now(), who: 'ay', text: t, time: 'şimdi' }, ...(c.comments || [])],
    }));
  });
}

// ---- New Board Modal ----
const BOARD_COLORS = ['#6c5ecf', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6'];

const ALL_MEMBERS = [
  { id: 'ay', initials: 'AY', name: 'Ayşe Yılmaz',   color: '#6366f1' },
  { id: 'mk', initials: 'MK', name: 'Mert Kaya',     color: '#8b5cf6' },
  { id: 'sb', initials: 'SB', name: 'Selin Bora',    color: '#0ea5a3' },
  { id: 'ec', initials: 'EÇ', name: 'Emre Çelik',   color: '#f59e0b' },
  { id: 'da', initials: 'DA', name: 'Deniz Arı',     color: '#f43f5e' },
];

export function renderNewBoardModal(container) {
  if (!state.newBoardModal) { container.innerHTML = ''; return; }
  // Only build DOM once — avoid re-render on every state change (breaks input focus)
  if (container.querySelector('#nb-scrim')) return;

  let selectedColor = BOARD_COLORS[0];
  let selectedMembers = new Set();

  container.innerHTML = `
    <div id="nb-scrim" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center">
      <div style="background:var(--card-bg,#fff);border-radius:14px;padding:28px 32px;width:400px;box-shadow:0 20px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:20px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h2 style="font-size:16px;font-weight:700;margin:0;color:var(--text,#1a1d2e)">Yeni Board</h2>
          <button id="nb-close" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text-secondary,#888)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary,#888)">Board Adı</label>
          <input id="nb-name-inp" placeholder="Örn: Pazarlama Kampanyası"
            style="border:1.5px solid var(--border,#e2e6f0);border-radius:8px;padding:9px 12px;font-size:14px;outline:none;background:var(--input-bg,#f8f9fc);color:var(--text,#1a1d2e);width:100%;box-sizing:border-box">
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary,#888)">Renk</label>
          <div style="display:flex;gap:10px" id="nb-color-row">
            ${BOARD_COLORS.map((c, i) => `
              <button data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:${i === 0 ? '3px solid #1a1d2e' : '3px solid transparent'};cursor:pointer;outline:none;padding:0;transition:border .15s"></button>
            `).join('')}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary,#888)">Üye Ekle</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap" id="nb-members-row">
            ${ALL_MEMBERS.map(m => `
              <button data-member="${m.id}" title="${m.name}"
                style="display:flex;align-items:center;gap:7px;padding:5px 10px 5px 5px;border-radius:20px;border:2px solid transparent;background:var(--chip-bg,#f2f3f8);cursor:pointer;transition:all .15s;font-size:13px;font-weight:600;color:var(--text,#1a1d2e)">
                <span style="width:26px;height:26px;border-radius:50%;background:${m.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${m.initials}</span>
                ${m.name.split(' ')[0]}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
          <button id="nb-cancel" style="padding:8px 18px;border-radius:8px;border:1.5px solid var(--border,#e2e6f0);background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--text,#1a1d2e)">İptal</button>
          <button id="nb-create" style="padding:8px 18px;border-radius:8px;border:none;background:#6c5ecf;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Oluştur</button>
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
        b.style.border = b === btn ? '3px solid #1a1d2e' : '3px solid transparent';
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
        btn.style.background = 'var(--chip-bg,#f2f3f8)';
      } else {
        selectedMembers.add(id);
        btn.style.border = '2px solid #6c5ecf';
        btn.style.background = 'var(--accent-soft,#eef0fe)';
      }
    });
  });

  container.querySelector('#nb-create').addEventListener('click', () => {
    const n = (container.querySelector('#nb-name-inp').value || '').trim();
    if (!n) { container.querySelector('#nb-name-inp').focus(); return; }
    const newId = 'b' + Date.now();
    setState({
      boards: [...(state.boards || []), {
        id: newId,
        name: n,
        color: selectedColor,
        members: [...selectedMembers],
      }],
      activeBoardId: newId,   // yeni board'a geç (boş — empty state gösterilir)
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

  const INP = `border:1.5px solid var(--border,#e2e6f0);border-radius:8px;padding:9px 12px;font-size:14px;outline:none;background:var(--input-bg,#f8f9fc);color:var(--text,#1a1d2e);width:100%;box-sizing:border-box`;
  const LABEL = `font-size:12px;font-weight:600;color:var(--text-secondary,#888);display:block;margin-bottom:5px`;
  const SECTION = `display:flex;flex-direction:column;gap:6px`;
  const DIVIDER = `<div style="height:1px;background:var(--border,#e2e6f0);margin:4px 0"></div>`;

  container.innerHTML = `
    <div id="prof-scrim" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center">
      <div style="background:var(--card-bg,#fff);border-radius:18px;width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 72px rgba(0,0,0,.28);display:flex;flex-direction:column">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:24px 28px 20px">
          <h2 style="font-size:17px;font-weight:700;margin:0;color:var(--text,#1a1d2e)">Hesap & Profil</h2>
          <button id="prof-close" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text-secondary,#888)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style="padding:0 28px 28px;display:flex;flex-direction:column;gap:24px">

          <!-- Avatar + isim -->
          <div style="display:flex;align-items:center;gap:18px;padding:20px;background:var(--board-bg,#f4f5fb);border-radius:12px">
            <div style="position:relative;flex:0 0 auto">
              <span style="width:72px;height:72px;border-radius:50%;background:#6c5ecf;color:#fff;font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center">AY</span>
              <button style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:#6c5ecf;border:2px solid var(--card-bg,#fff);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
            <div>
              <div style="font-size:20px;font-weight:700;color:var(--text,#1a1d2e)">Ayşe Yılmaz</div>
              <div style="font-size:13px;color:var(--text-secondary,#888);margin-top:2px">ayse@acmestudio.io</div>
              <span style="display:inline-block;margin-top:6px;font-size:11px;font-weight:700;color:#6c5ecf;background:#eef0fe;padding:3px 10px;border-radius:20px">Premium Plan</span>
            </div>
          </div>

          <!-- E-posta -->
          <div style="${SECTION}">
            <div style="font-size:14px;font-weight:700;color:var(--text,#1a1d2e);margin-bottom:2px">E-posta Adresi</div>
            <label style="${LABEL}">Mevcut e-posta</label>
            <input id="prof-email" value="ayse@acmestudio.io" style="${INP}">
            <button id="prof-save-email" style="align-self:flex-end;padding:7px 16px;border-radius:8px;border:none;background:#6c5ecf;color:#fff;cursor:pointer;font-size:13px;font-weight:600;margin-top:2px">Güncelle</button>
          </div>

          ${DIVIDER}

          <!-- Şifre -->
          <div style="${SECTION}">
            <div style="font-size:14px;font-weight:700;color:var(--text,#1a1d2e);margin-bottom:2px">Şifre</div>
            <label style="${LABEL}">Mevcut şifre</label>
            <input id="prof-pw-current" type="password" placeholder="••••••••" style="${INP}">
            <label style="${LABEL};margin-top:8px">Yeni şifre</label>
            <input id="prof-pw-new" type="password" placeholder="En az 8 karakter" style="${INP}">
            <label style="${LABEL};margin-top:8px">Yeni şifre (tekrar)</label>
            <input id="prof-pw-confirm" type="password" placeholder="••••••••" style="${INP}">
            <div id="prof-pw-msg" style="font-size:12px;min-height:16px;margin-top:2px"></div>
            <button id="prof-save-pw" style="align-self:flex-end;padding:7px 16px;border-radius:8px;border:none;background:#6c5ecf;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Şifreyi Güncelle</button>
          </div>

          ${DIVIDER}

          <!-- Şifre Sıfırlama -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-radius:10px;border:1.5px solid var(--border,#e2e6f0)">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text,#1a1d2e)">Şifre Sıfırlama Bağlantısı</div>
              <div style="font-size:12px;color:var(--text-secondary,#888);margin-top:2px">E-postana sıfırlama bağlantısı gönderilir</div>
            </div>
            <button id="prof-reset-pw" style="padding:7px 14px;border-radius:8px;border:1.5px solid var(--border,#e2e6f0);background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--text,#1a1d2e);white-space:nowrap">Gönder</button>
          </div>

          ${DIVIDER}

          <!-- Çıkış Yap -->
          <button id="prof-logout" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:10px;border:1.5px solid #fecaca;background:#fff5f5;color:#ef4444;cursor:pointer;font-size:14px;font-weight:700;width:100%">
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
    const btn = container.querySelector('#prof-save-email');
    btn.textContent = 'Kaydedildi ✓';
    btn.style.background = '#10b981';
    setTimeout(() => { btn.textContent = 'Güncelle'; btn.style.background = '#6c5ecf'; }, 2000);
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

  // Şifre sıfırlama
  container.querySelector('#prof-reset-pw').addEventListener('click', () => {
    const btn = container.querySelector('#prof-reset-pw');
    btn.textContent = 'Gönderildi ✓';
    btn.style.color = '#10b981';
    btn.style.borderColor = '#10b981';
    setTimeout(() => { btn.textContent = 'Gönder'; btn.style.color = ''; btn.style.borderColor = ''; }, 3000);
  });

  // Çıkış
  container.querySelector('#prof-logout').addEventListener('click', () => {
    close();
  });
}
