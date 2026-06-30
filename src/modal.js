// ============================================================
// MODAL — Kart detay modal (masaüstü)
// ============================================================
import { state, setState, updateCard } from './state.js';
import { findRawCard, getOpenCardView, ICONS } from './helpers.js';

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

  const found = findRawCard(s.lists, s.openCardId);
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
                <input class="checklist-add-input" id="checklist-add-inp" placeholder="Alt görev ekle…" value="${escHtml(s.newChecklistText)}">
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
                  <textarea class="comment-textarea" id="modal-comment-ta" rows="2" placeholder="Yorum yaz…">${escHtml(s.newCommentText)}</textarea>
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
  const scrim = container.querySelector('#modal-scrim');
  scrim.addEventListener('click', e => {
    if (e.target === scrim) setState({ openCardId: null });
  });

  container.querySelector('#modal-close-btn').addEventListener('click', () => setState({ openCardId: null }));

  // Title
  container.querySelector('#modal-title-inp').addEventListener('input', e => {
    updateCard(s.openCardId, { title: e.target.value });
  });

  // Description
  container.querySelector('#modal-desc-ta').addEventListener('input', e => {
    updateCard(s.openCardId, { desc: e.target.value });
  });

  // Checklist toggles & deletes
  container.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const itemId = cb.dataset.itemId;
      updateCard(s.openCardId, c => ({
        ...c,
        checklist: (c.checklist || []).map(it => it.id === itemId ? { ...it, done: !it.done } : it),
      }));
    });
  });

  container.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const itemId = btn.dataset.itemId;
      updateCard(s.openCardId, c => ({
        ...c,
        checklist: (c.checklist || []).filter(it => it.id !== itemId),
      }));
    });
  });

  // Add checklist item
  const checkInp = container.querySelector('#checklist-add-inp');
  checkInp.addEventListener('input', e => setState({ newChecklistText: e.target.value }));
  const addCheckItem = () => {
    const t = (state.newChecklistText || '').trim();
    if (!t) return;
    updateCard(state.openCardId, c => ({
      ...c,
      checklist: [...(c.checklist || []), { id: 'k' + Date.now(), text: t, done: false }],
    }));
    setState({ newChecklistText: '' });
  };
  container.querySelector('#checklist-add-btn').addEventListener('click', addCheckItem);
  checkInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem(); } });

  // Upload
  container.querySelector('#upload-btn').addEventListener('click', () => fileInput && fileInput.click());

  // Remove attachment
  container.querySelectorAll('.remove-attach-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const aid = btn.dataset.attId;
      updateCard(s.openCardId, c => ({
        ...c,
        attachments: (c.attachments || []).filter(a => a.id !== aid),
      }));
    });
  });

  // Comment
  const commentTa = container.querySelector('#modal-comment-ta');
  commentTa.addEventListener('input', e => setState({ newCommentText: e.target.value }));
  container.querySelector('#comment-send-btn').addEventListener('click', () => {
    const t = (state.newCommentText || '').trim();
    if (!t) return;
    updateCard(state.openCardId, c => ({
      ...c,
      comments: [{ id: 'cm' + Date.now(), who: 'ay', text: t, time: 'şimdi' }, ...(c.comments || [])],
    }));
    setState({ newCommentText: '' });
  });
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
