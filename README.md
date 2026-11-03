# KyncTask

Kync Teknoloji ekip içi görev yönetimi: Kanban board'lar, takvim, notlar, topluluk akışı, birebir mesajlaşma ve yönetici performans ekranı.

## Teknoloji

- **Ön yüz:** Vanilla JavaScript (ES modules), [Vite](https://vitejs.dev)
- **Arka uç:** Self-hosted [Supabase](https://supabase.com) — PostgreSQL, Auth, Storage, Realtime
- **Yayın:** Vercel (statik build, güvenlik başlıkları `vercel.json`'da)

Ayrı bir API sunucusu yoktur. Tarayıcı doğrudan Supabase'e bağlanır; yetkilendirme tamamen veritabanındaki **RLS (Row Level Security)** politikalarıyla yapılır.

## Kurulum

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY doldurulur
npm run dev                  # http://localhost:5173
```

| Komut             | Açıklama                   |
| ----------------- | -------------------------- |
| `npm run dev`     | Geliştirme sunucusu        |
| `npm run build`   | Üretim build'i (`dist/`)   |
| `npm run preview` | Build'i yerelde önizleme   |
| `npm run lint`    | ESLint                     |
| `npm run format`  | Prettier ile biçimlendirme |

Ortam değişkenleri build sırasında gömülür; Vercel'de değiştirildiğinde yeniden deploy gerekir. Anon key tarayıcıya açıktır, gizli değildir — veri güvenliği RLS'tedir.

## Proje yapısı

```
src/
  main.js          Giriş noktası, kök render döngüsü
  core/            Veri ve servis katmanı
    supabase.js    Paylaşılan Supabase istemcisi
    state.js       Merkezi state + abonelik
    store.js       Board/liste/kart CRUD (iyimser güncelleme + yazım kuyruğu)
    social.js      Mesajlar, bildirimler, topluluk
    realtime.js    Board değişikliklerini canlı dinleme
    storage.js     Dosya yükleme/silme, imzalı URL'ler
    auth.js        Giriş, çıkış, şifre işlemleri
  lib/             Saf yardımcılar (tarih, tema, HTML kaçışlama, ikonlar)
  components/      Tekrar kullanılan arayüz parçaları (diyalog, seçiciler, editör…)
  views/           Sayfalar ve büyük ekranlar (board, takvim, notlar…)
  styles/main.css
supabase/
  migrations/      Şema, RLS, storage bucket'ları, trigger'lar, RPC'ler
```

## Veri akışı (CRUD)

1. Arayüz `core/store.js` içindeki bir fonksiyonu çağırır (ör. `createCard`).
2. Bellekteki state **hemen** güncellenir ve ekran yeniden çizilir (iyimser güncelleme).
3. Sunucu yazımı tek bir kuyruğa eklenir; yazımlar sırayla gider.
4. Yazım başarısız olursa kullanıcıya uyarı gösterilir ve veri sunucudan yeniden yüklenerek gerçek duruma dönülür.
5. Diğer kullanıcıların değişiklikleri Supabase Realtime ile gelir; açık board etkileniyorsa sunucudan tazelenir.

Bildirimler (atama, yorum, duyuru…) veritabanı trigger'larıyla sunucuda üretilir. Yönetici işlemleri (`admin_*`) `security definer` RPC'lerdir.

## Dosyalar

Tüm dosyalar Supabase Storage'da, **gizli** bucket'larda tutulur ve süreli (1 saat) imzalı URL ile gösterilir.

| Bucket        | Yol                                | Sınır | Kim okur              |
| ------------- | ---------------------------------- | ----- | --------------------- |
| `attachments` | `<board_id>/<card_id>/<uuid>-<ad>` | 25 MB | Board üyeleri         |
| `dm`          | `<gönderen>/<alıcı>/<uuid>-<ad>`   | 15 MB | Mesajın iki tarafı    |
| `community`   | `<user_id>/<uuid>.<uzantı>`        | 5 MB  | Giriş yapmış herkes   |
| `notes`       | `<user_id>/<uuid>.<uzantı>`        | 5 MB  | Giriş yapmış herkes\* |

\* Yol tahmin edilemez UUID içerir; paylaşılan notlardaki görselleri alıcının da görebilmesi için okuma açıktır.

Görseller yüklenmeden önce tarayıcıda en fazla 1600 px WebP'ye küçültülür. Kart, liste veya board silindiğinde ilgili ek dosyaları istemci tarafından storage'dan da silinir.

## Veritabanı

Migration'lar `supabase/migrations/` altındadır ve sırayla uygulanır:

```bash
npx supabase db push --db-url "<postgres bağlantı adresi>"
```

Uygulanmış bir migration dosyası değiştirilmez; her değişiklik yeni bir migration ile yapılır.

## Hesaplar

Kayıt kapalıdır. Hesapları yöneticiler açar (Kullanıcılar ekranı). Yöneticinin açtığı ya da şifresini sıfırladığı hesap ilk girişte yeni şifre belirlemek zorundadır.
