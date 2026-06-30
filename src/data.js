// ============================================================
// DATA — Sabit veriler: kişiler, etiketler, board listesi
// ============================================================

export const PEOPLE = {
  ay: { name: 'Ayşe Yılmaz',  initials: 'AY', color: '#6366f1' },
  mk: { name: 'Mert Kaya',    initials: 'MK', color: '#8b5cf6' },
  sb: { name: 'Selin Bora',   initials: 'SB', color: '#0ea5a3' },
  ec: { name: 'Emre Çelik',   initials: 'EÇ', color: '#f59e0b' },
  da: { name: 'Deniz Arı',    initials: 'DA', color: '#f43f5e' },
};

export const LABELS = {
  design:    { name: 'Tasarım',   color: '#8b5cf6' },
  urgent:    { name: 'Acil',      color: '#f43f5e' },
  backend:   { name: 'Backend',   color: '#6366f1' },
  research:  { name: 'Araştırma', color: '#f59e0b' },
  marketing: { name: 'Pazarlama', color: '#0ea5a3' },
  bug:       { name: 'Hata',      color: '#ef4444' },
};

export const BOARDS = [
  { name: 'Ürün Lansmanı',    color: '#6366f1', active: true  },
  { name: 'Pazarlama Takvimi',color: '#0ea5a3', active: false },
  { name: 'Mühendislik',      color: '#f59e0b', active: false },
  { name: 'Tasarım Sistemi',  color: '#8b5cf6', active: false },
];

/** Gradient placeholder svg döndürür */
function ph(h) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${h},66%,70%)'/><stop offset='1' stop-color='hsl(${(h + 34) % 360},58%,55%)'/></linearGradient><pattern id='p' width='16' height='16' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><rect width='16' height='16' fill='url(#g)'/><rect width='8' height='16' fill='rgba(255,255,255,.10)'/></pattern></defs><rect width='320' height='180' fill='url(#p)'/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function initialLists() {
  return [
    { id: 'l1', title: 'Backlog', cards: [
      { id: 'c1', title: 'Onboarding akışı için kullanıcı araştırması', labels: ['research'], assignees: ['sb'],
        desc: '5 kullanıcı ile derinlemesine görüşme yapılacak; çıktılar onboarding revizyonuna girdi olacak.',
        checklist: [
          { id: 'k1', text: 'Görüşme kılavuzu hazırla',  done: true  },
          { id: 'k2', text: 'Katılımcı daveti gönder',   done: false },
          { id: 'k3', text: 'Görüşmeleri tamamla',        done: false },
          { id: 'k4', text: 'Bulguları sentezle',         done: false },
        ],
        comments: [
          { id: 'm1', who: 'sb', text: 'İlk 2 görüşme bu hafta planlandı.', time: '2g önce' },
          { id: 'm2', who: 'ec', text: 'Soru setine bakabilirim, paylaşır mısın?', time: '1g önce' },
        ],
        attachments: [], due: null },
      { id: 'c2', title: 'Rakip analizi raporu', labels: ['research', 'marketing'], assignees: ['ec'],
        desc: '', checklist: [], comments: [], attachments: [], due: { label: '2 Tem', state: 'over' } },
      { id: 'c3', title: 'Yeni landing page konsepti', labels: ['design'], assignees: ['mk'],
        desc: '', checklist: [], comments: [],
        attachments: [{ id: 'a3', type: 'image', url: ph(268), name: 'landing-konsept.png' }], due: null },
    ]},
    { id: 'l2', title: 'Tasarım', cards: [
      { id: 'c4', title: 'Dashboard yeniden tasarımı', labels: ['design'], assignees: ['mk', 'sb'],
        desc: 'Yeni bilgi mimarisi, modüler grafik bileşenleri ve karanlık tema dahil tam revizyon.',
        checklist: [
          { id: 'k1', text: 'Wireframe',           done: true  },
          { id: 'k2', text: 'Görsel tasarım',       done: true  },
          { id: 'k3', text: 'Boş durumlar',         done: true  },
          { id: 'k4', text: 'Karanlık tema',        done: false },
          { id: 'k5', text: 'Tıklanabilir prototip',done: false },
        ],
        comments: [
          { id: 'm1', who: 'mk', text: 'Grafik renklerini tokenlarla eşledim.', time: '5s önce' },
          { id: 'm2', who: 'sb', text: 'Boş durum metinleri güncellendi.', time: '3s önce' },
        ],
        attachments: [{ id: 'a4', type: 'image', url: ph(232), name: 'dashboard-v3.png' }],
        due: { label: '8 Tem', state: 'soon' } },
      { id: 'c5', title: 'Mobil ikon seti', labels: ['design'], assignees: ['mk'],
        desc: '', checklist: [], comments: [], attachments: [], due: null },
      { id: 'c6', title: 'Tasarım sistemi: renk tokenları', labels: ['design', 'backend'], assignees: ['sb'],
        desc: '',
        checklist: [
          { id: 'k1', text: 'Açık tema', done: true },
          { id: 'k2', text: 'Koyu tema', done: true },
        ],
        comments: [], attachments: [], due: { label: '5 Tem', state: 'soon' } },
    ]},
    { id: 'l3', title: 'Geliştirme', cards: [
      { id: 'c7', title: 'Auth servisi entegrasyonu', labels: ['backend', 'urgent'], assignees: ['ay'],
        desc: 'OAuth2 + magic link desteği. Token yenileme ve oturum yönetimi akışları dahil.',
        checklist: [
          { id: 'k1', text: 'Login endpoint',   done: true  },
          { id: 'k2', text: 'Refresh token',    done: true  },
          { id: 'k3', text: 'Magic link',        done: true  },
          { id: 'k4', text: 'Oturum yönetimi',  done: true  },
          { id: 'k5', text: 'Hata durumları',   done: false },
          { id: 'k6', text: 'Birim testleri',   done: false },
        ],
        comments: [
          { id: 'm1', who: 'ay', text: "Refresh token PR'ı incelemeye hazır.", time: '1g önce' },
          { id: 'm2', who: 'ec', text: 'Bakıyorum 👀', time: '22s önce' },
          { id: 'm3', who: 'da', text: 'Rate limit ile çakışmasın, dikkat.', time: '4s önce' },
        ],
        attachments: [{ id: 'a7', type: 'image', url: ph(150), name: 'auth-akis.png' }],
        due: { label: '4 Tem', state: 'today' } },
      { id: 'c8', title: 'API rate limiting', labels: ['backend'], assignees: ['ay', 'ec'],
        desc: '', checklist: [], comments: [], attachments: [], due: null },
      { id: 'c9', title: 'Drag & drop board motoru', labels: ['backend'], assignees: ['ay'],
        desc: 'Akıcı sürükle-bırak, sıralama ve liste arası taşıma.',
        checklist: [
          { id: 'k1', text: 'Sürükleme durumu',   done: true  },
          { id: 'k2', text: 'Drop hedef tespiti',  done: true  },
          { id: 'k3', text: 'Sıralama mantığı',    done: false },
          { id: 'k4', text: 'Dokunma desteği',     done: false },
          { id: 'k5', text: 'Otomatik kaydırma',   done: false },
          { id: 'k6', text: 'Klavye erişimi',      done: false },
          { id: 'k7', text: 'Animasyonlar',        done: false },
          { id: 'k8', text: 'Testler',             done: false },
        ],
        comments: [
          { id: 'm1', who: 'da', text: 'Mobilde swipe ile çakışmaya dikkat.', time: '6s önce' },
        ],
        attachments: [{ id: 'a9', type: 'image', url: ph(30), name: 'dnd-demo.png' }], due: null },
    ]},
    { id: 'l4', title: 'İnceleme', cards: [
      { id: 'c10', title: 'PR #482: Bildirim merkezi', labels: ['backend'], assignees: ['ec'],
        desc: 'Gerçek zamanlı bildirim akışı ve okundu durumu.',
        checklist: [],
        comments: [
          { id: 'm1', who: 'ay', text: 'Genel olarak iyi, birkaç ufak not bıraktım.', time: '3s önce' },
          { id: 'm2', who: 'mk', text: 'Boş durum görseli eklenebilir.', time: '2s önce' },
        ],
        attachments: [], due: null },
      { id: 'c11', title: 'QA: Ödeme akışı', labels: ['urgent', 'bug'], assignees: ['sb'],
        desc: '',
        checklist: [
          { id: 'k1', text: 'Kart ile ödeme', done: true  },
          { id: 'k2', text: 'Hata senaryoları', done: false },
        ],
        comments: [], attachments: [], due: { label: 'Bugün', state: 'today' } },
    ]},
    { id: 'l5', title: 'Tamamlandı', cards: [
      { id: 'c12', title: 'Marka kılavuzu v2', labels: ['design', 'marketing'], assignees: ['mk'],
        desc: '',
        checklist: [
          { id: 'k1', text: 'Logo kullanımı', done: true },
          { id: 'k2', text: 'Tipografi',      done: true },
          { id: 'k3', text: 'Renkler',        done: true },
        ],
        comments: [], attachments: [], due: { label: '28 Haz', state: 'done' } },
      { id: 'c13', title: 'Beta davet e-postaları', labels: ['marketing'], assignees: ['ec'],
        desc: '', checklist: [], comments: [], attachments: [], due: { label: '26 Haz', state: 'done' } },
    ]},
  ];
}
