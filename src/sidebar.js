// ============================================================
// SIDEBAR — Masaüstü sidebar bileşeni
// ============================================================
import { state, setState } from './state.js';
import { BOARDS, PEOPLE } from './data.js';
import { ICONS } from './helpers.js';

export function renderSidebar(container) {
  const s = state;
  const expanded = s.sideExpanded;
  const w = expanded ? '258px' : '74px';

  container.innerHTML = `
    <aside id="sidebar" style="width:${w}">
      <div class="sidebar-header">
        <span class="workspace-icon">A</span>
        ${expanded ? `
          <div class="workspace-info">
            <div class="workspace-name">Acme Studio</div>
            <div class="workspace-plan">Premium çalışma alanı</div>
          </div>` : ''}
        <button class="sidebar-toggle" id="sidebar-toggle-btn" title="${expanded ? 'Daralt' : 'Genişlet'}">
          ${ICONS.menu}
        </button>
      </div>

      <div class="sidebar-nav">
        ${expanded ? `<div class="sidebar-section-label">Boards</div>` : ''}
        <div class="sidebar-boards">
          ${BOARDS.map(b => `
            <button class="board-btn ${b.active ? 'active' : ''}">
              <span class="board-dot" style="background:${b.color}"></span>
              ${expanded ? `<span class="board-name">${b.name}</span>` : ''}
            </button>
          `).join('')}
        </div>
        <button class="add-board-btn">
          ${ICONS.plus}
          ${expanded ? `<span style="white-space:nowrap">Yeni Board</span>` : ''}
        </button>
      </div>

      <div class="sidebar-footer">
        <span class="avatar" style="width:34px;height:34px;font-size:12.5px;font-weight:700">AY</span>
        ${expanded ? `
          <div class="user-info">
            <div class="user-name">${PEOPLE.ay.name}</div>
            <div class="user-email">ayse@acmestudio.io</div>
          </div>
          <button class="icon-btn">${ICONS.sliders}</button>
        ` : ''}
      </div>
    </aside>
  `;

  container.querySelector('#sidebar-toggle-btn').addEventListener('click', () => {
    setState({ sideExpanded: !s.sideExpanded });
  });
}
