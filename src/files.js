// ============================================================
// FILES — Kart ekleri (Supabase Storage, 'attachments' bucket'ı)
// ============================================================
// Bucket gizli: dosyalar süreli imzalı URL ile gösterilir. URL'ler
// önbelleğe alınır; henüz alınmamışsa attachmentUrl '' döner ve URL
// hazır olunca onFileLoaded tetiklenir (render senkron kalır).
// ============================================================
import { supabase } from './supabase.js';

const BUCKET = 'attachments';
const URL_TTL_S = 60 * 60;             // imzalı URL ömrü
const URL_REFRESH_MS = 50 * 60 * 1000; // bitmeden yenile

const urls = new Map();     // cacheKey -> { url, at }
const pending = new Set();
let onLoaded = () => {};

/** Arka planda alınan bir URL hazır olduğunda çağrılacak fonksiyon */
export function onFileLoaded(fn) { onLoaded = fn; }

/** Storage anahtarında sorun çıkarmayan dosya adı (Türkçe karakter/boşluk vs.) */
function safeName(name) {
  const cleaned = (name || 'dosya')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-80);
  return cleaned || 'dosya';
}

/** Dosyayı yükler, storage yolunu döndürür */
export async function uploadFile(boardId, cardId, file) {
  const path = `${boardId}/${cardId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Dosyaları siler (hata olursa sadece loglar; satır zaten silinmiş olabilir) */
export async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  for (const p of list) forget(p);
  const { error } = await supabase.storage.from(BUCKET).remove(list);
  if (error) console.error('[files] silinemedi', error);
}

function forget(path) {
  urls.delete(`view:${path}`);
  for (const k of urls.keys()) if (k.startsWith(`dl:${path}:`)) urls.delete(k);
}

/**
 * Ekin görüntülenebilir URL'ini döndürür ('' = henüz hazır değil).
 * Görsel olmayan dosyalar için URL indirme olarak işaretlenir.
 */
export function attachmentUrl(att) {
  if (!att?.storagePath) return '';
  const download = att.type === 'image' ? null : att.name;
  const key = download ? `dl:${att.storagePath}:${download}` : `view:${att.storagePath}`;

  const cached = urls.get(key);
  const fresh = cached && Date.now() - cached.at < URL_REFRESH_MS;
  if (!fresh && !pending.has(key)) {
    pending.add(key);
    supabase.storage.from(BUCKET)
      .createSignedUrl(att.storagePath, URL_TTL_S, download ? { download } : undefined)
      .then(({ data, error }) => {
        if (error) throw error;
        urls.set(key, { url: data.signedUrl, at: Date.now() });
        onLoaded();
      })
      .catch(err => console.error('[files] URL alınamadı', att.storagePath, err))
      .finally(() => pending.delete(key));
  }
  // Süresi yaklaşan URL yenilenirken eskisi gösterilmeye devam eder
  return cached ? cached.url : '';
}
