// ============================================================
// MEMBERS POPOVER — Board üyeleri: davet, rol değiştirme, çıkarma, ayrılma
// ============================================================
// Herkes listeyi ve rolleri görür. owner/admin e-postayla davet eder,
// owner dışındakilerin rolünü değiştirir ve onları çıkarır. owner dışındaki
// herkes board'dan ayrılabilir. Yetki kuralları veritabanında da (RLS)
// uygulanır; buradaki koşullar yalnızca doğru butonları göstermek için.
// ============================================================
import { state } from './state.js';
import { cssColor, escHtml, personById, ICONS } from './helpers.js';
import { showToast } from './toast.js';
import { inviteMember, setMemberRole, removeMember, leaveBoard, canAdmin } from './store.js';

const ROLE_LABELS = { owner: 'Sahip', admin: 'Admin', member: 'Üye', viewer: 'İzleyici' };
const ASSIGNABLE_ROLES = ['admin', 'member', 'viewer'];

let active = null;

export function closeMembersPopover() {
  if (!active) return;
  active.cleanup();
  active.el.remove();
  active = null;
}

/** Açıksa ve üyeler değiştiyse (ör. realtime) içeriği tazele */
export function refreshMembersPopover() {
  active?.render();
}

export function openMembersPopover(anchor, boardId) {
  if (active) { closeMembersPopover(); return; }

  let confirmLeave = false;
  let lastKey = null;

  const el = document.createElement('div');
  el.className = 'member-picker members-popover';
  el.innerHTML = `
    <div class="member-picker-head">
      <span class="members-title">Üyeler</span>
      <button type="button" class="member-picker-close" aria-label="Kapat">${ICONS.x}</button>
    </div>
    <form class="invite-form" novalidate hidden>
      <input class="member-picker-search" type="email" placeholder="E-postayla davet et" autocomplete="off">
      <button type="submit" class="invite-submit">Davet et</button>
    </form>
    <div class="invite-msg" role="status"></div>
    <div class="members-body"></div>
  `;
  document.body.appendChild(el);

  const body = el.querySelector('.members-body');
  const form = el.querySelector('.invite-form');
  const input = form.querySelector('input');
  const msg = el.querySelector('.invite-msg');

  const setMsg = (text, isError = false) => {
    msg.className = `invite-msg${isError ? ' is-error' : ''}`;
    msg.textContent = text;
  };

  const render = (force = false) => {
    const board = state.boards.find(b => b.id === boardId);
    if (!board) { closeMembersPopover(); return; }
    const key = JSON.stringify([board.members, board.roles, board.myRole, board.members.map(id => state.people[id]?.name), confirmLeave]);
    if (!force && key === lastKey) return; // select açıkken gereksiz yeniden çizme
    lastKey = key;

    const admin = canAdmin(board);
    const me = state.userId;
    form.hidden = !admin;
    el.querySelector('.members-title').textContent = `Üyeler (${board.members.length})`;

    body.innerHTML = `
      <div class="member-picker-list">
        ${board.members.map(id => {
          const p = personById(id);
          const role = board.roles[id];
          const editable = admin && role !== 'owner';
          return `
            <div class="member-row" data-id="${escHtml(id)}">
              <span class="member-picker-avatar" style="background:${cssColor(p.color)}">${escHtml(p.initials)}</span>
              <span class="member-row-info">
                <span class="member-picker-name">${escHtml(p.name)}${id === me ? ' <span class="member-you">(sen)</span>' : ''}</span>
                ${p.email ? `<span class="member-row-email">${escHtml(p.email)}</span>` : ''}
              </span>
              ${editable
                ? `<select class="member-role-select" aria-label="${escHtml(p.name)} rolü">
                     ${ASSIGNABLE_ROLES.map(r => `<option value="${r}" ${r === role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
                   </select>`
                : `<span class="member-role-badge role-${role}">${ROLE_LABELS[role] || ''}</span>`}
              ${editable && id !== me
                ? `<button type="button" class="member-remove" title="Board'dan çıkar" aria-label="${escHtml(p.name)} kişisini board'dan çıkar">${ICONS.x}</button>`
                : '<span class="member-remove-spacer"></span>'}
            </div>`;
        }).join('')}
      </div>
      ${board.myRole && board.myRole !== 'owner' ? `
        <button type="button" class="member-leave ${confirmLeave ? 'is-confirm' : ''}">
          ${confirmLeave ? 'Emin misin? Board\'dan ayrıl' : 'Board\'dan ayrıl'}
        </button>` : ''}
    `;
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = input.value.trim();
    if (!email.includes('@')) { setMsg('Geçerli bir e-posta gir.', true); return; }
    const submit = form.querySelector('.invite-submit');
    submit.disabled = true;
    setMsg('Ekleniyor…');
    const error = await inviteMember(boardId, email);
    submit.disabled = false;
    if (error) { setMsg(error, true); return; }
    input.value = '';
    setMsg(`${email} eklendi.`);
    render(true);
  });

  body.addEventListener('change', e => {
    const select = e.target.closest('.member-role-select');
    if (!select) return;
    const id = select.closest('.member-row').dataset.id;
    setMemberRole(boardId, id, select.value);
    setMsg(`${personById(id).name} artık ${ROLE_LABELS[select.value]}.`);
  });

  body.addEventListener('click', async e => {
    const remove = e.target.closest('.member-remove');
    if (remove) {
      const id = remove.closest('.member-row').dataset.id;
      const name = personById(id).name;
      await removeMember(boardId, id);
      setMsg(`${name} board'dan çıkarıldı.`);
      render(true);
      return;
    }
    const leave = e.target.closest('.member-leave');
    if (leave) {
      if (!confirmLeave) { confirmLeave = true; render(true); return; }
      const name = state.boards.find(b => b.id === boardId)?.name;
      closeMembersPopover();
      if (await leaveBoard(boardId)) showToast(`"${name}" board'undan ayrıldın.`);
    }
  });

  el.querySelector('.member-picker-close').addEventListener('click', closeMembersPopover);
  render(true);

  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, m = 12;
  el.style.top = `${r.bottom + 8}px`;
  el.style.left = `${Math.max(m, Math.min(r.left, window.innerWidth - w - m))}px`;

  const onDocDown = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeMembersPopover(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeMembersPopover(); } };
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  active = {
    el,
    render,
    cleanup: () => {
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
    },
  };
  if (!form.hidden) input.focus();
}
