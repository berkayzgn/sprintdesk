// ============================================================
// SKELETON — Yüklenirken içeriğin şeklinde gri, parıldayan kutular
// ============================================================
// "Yükleniyor…" yazısı yerine sayfanın iskeleti görünür; veri gelince
// yerini gerçek içerik alır. Hepsi aynı .skel sınıfını kullanır.
// ============================================================

const bar = (w, h = 12, extra = '') => `<span class="skel" style="width:${w};height:${h}px;${extra}"></span>`;

/** Kanban: 3 liste, içinde kartlar */
export function boardSkeleton() {
  const cards = [3, 2, 4];
  return `
    <div class="skel-board" aria-busy="true" aria-label="Yükleniyor">
      ${cards.map(n => `
        <div class="skel-list">
          ${bar('45%', 14)}
          ${Array.from({ length: n }, (_, i) => `
            <div class="skel-card">${bar(i % 2 ? '70%' : '85%', 12)}${bar('40%', 10)}</div>`).join('')}
        </div>`).join('')}
    </div>`;
}

/** Tablo satırları (liste görünümü, performans, kullanıcılar) */
export function rowsSkeleton(n = 5, { avatar = false } = {}) {
  return `
    <div class="skel-rows" aria-busy="true" aria-label="Yükleniyor">
      ${Array.from({ length: n }, (_, i) => `
        <div class="skel-row">
          ${avatar ? '<span class="skel skel-circle"></span>' : bar('18px', 18, 'border-radius:4px')}
          <div class="skel-stack">${bar(['55%', '40%', '65%', '35%', '50%'][i % 5], 12)}${avatar ? bar('30%', 9) : ''}</div>
          ${bar('12%', 12)}${bar('10%', 12)}
        </div>`).join('')}
    </div>`;
}

/** Gönderi akışı (topluluk) */
export function feedSkeleton(n = 3) {
  return Array.from({ length: n }, (_, i) => `
    <div class="skel-post" aria-busy="true">
      <div class="skel-row" style="border:none;padding:0">
        <span class="skel skel-circle"></span>
        <div class="skel-stack">${bar('30%', 12)}${bar('18%', 9)}</div>
      </div>
      ${bar('95%', 11)}${bar(i % 2 ? '60%' : '80%', 11)}
      ${i === 0 ? bar('100%', 160, 'border-radius:12px') : ''}
    </div>`).join('');
}

/** Kutucuklar (notlar, istatistik kutuları) */
export function tilesSkeleton(n = 6, height = 90) {
  return Array.from({ length: n }, () => `<div class="skel-tile" style="min-height:${height}px">${bar('50%', 10)}${bar('35%', 20)}</div>`).join('');
}

/** Mesaj balonları */
export function chatSkeleton() {
  return ['60%', '45%', '70%', '38%'].map((w, i) =>
    `<span class="skel skel-bubble ${i % 2 ? 'is-mine' : ''}" style="width:${w}"></span>`).join('');
}
