/**
 * Supabase Storage erişimi. Tüm bucket'lar gizli; dosyalar süreli imzalı
 * URL ile sunulur, URL'ler önbelleğe alınıp süresi dolmadan yenilenir.
 *
 * Bucket / yol yapısı (bkz. supabase/migrations):
 *   attachments  <board_id>/<card_id>/<uuid>-<ad>   kart ekleri, 25 MB
 *   dm           <gönderen>/<alıcı>/<uuid>-<ad>     mesaj dosyaları, 15 MB
 *   community    <user_id>/<uuid>.<uzantı>          gönderi görselleri, 5 MB
 *   notes        <user_id>/<uuid>.<uzantı>          not görselleri, 5 MB
 */
import { supabase } from './supabase.js';

export const BUCKETS = {
  attachments: 'attachments',
  dm: 'dm',
  community: 'community',
  notes: 'notes',
};

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DM_FILE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const URL_TTL_S = 60 * 60;
const URL_REFRESH_MS = 50 * 60 * 1000;
const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;

/** Storage anahtarına uygun dosya adı (aksan, boşluk ve özel karakterler temizlenir) */
export function safeFileName(name) {
  const cleaned = (name || 'file')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-80);
  return cleaned || 'file';
}

/** MIME türünden uzantı: `image/jpeg` → `jpg` */
function extensionOf(file, fallback = 'bin') {
  return (file.type.split('/')[1] || fallback).replace('jpeg', 'jpg');
}

export async function uploadObject(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Hata fırlatmaz, yalnızca loglar (satır zaten silinmiş olabilir) */
export async function removeObjects(bucket, paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  list.forEach(p => forgetUrls(bucket, p));
  const { error } = await supabase.storage.from(bucket).remove(list);
  if (error) console.error('[storage] silinemedi', bucket, error);
}

// ---------- İmzalı URL'ler ----------

const urlCache = new Map(); // cacheKey -> { url, at }
const inFlight = new Map(); // cacheKey -> Promise<string>

const cacheKey = (bucket, path, download) => `${bucket}:${path}:${download || ''}`;
const isFresh = entry => entry && Date.now() - entry.at < URL_REFRESH_MS;

function forgetUrls(bucket, path) {
  const prefix = `${bucket}:${path}:`;
  for (const key of urlCache.keys()) if (key.startsWith(prefix)) urlCache.delete(key);
}

/**
 * Nesnenin imzalı URL'i (hata durumunda '').
 * @param {string|null} download verilirse dosya bu adla indirilir, null ise tarayıcıda açılır
 */
export function signedUrl(bucket, path, download = null) {
  const key = cacheKey(bucket, path, download);
  const cached = urlCache.get(key);
  if (isFresh(cached)) return Promise.resolve(cached.url);
  if (inFlight.has(key)) return inFlight.get(key);

  const request = supabase.storage
    .from(bucket)
    .createSignedUrl(path, URL_TTL_S, download ? { download } : undefined)
    .then(({ data, error }) => {
      if (error) throw error;
      urlCache.set(key, { url: data.signedUrl, at: Date.now() });
      return data.signedUrl;
    })
    .catch(err => {
      console.error('[storage] URL alınamadı', bucket, path, err);
      return '';
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

// ---------- Görseller ----------

/** Görseli en fazla 1600px WebP'ye küçültür. GIF'e dokunmaz (animasyon bozulmasın). */
export async function compressImage(file) {
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY));
  return blob && blob.size < file.size ? new File([blob], 'image.webp', { type: 'image/webp' }) : file;
}

/** Görseli küçültüp `<userId>/<uuid>.<uzantı>` yoluna yükler; sınırı aşarsa FileTooLargeError fırlatır */
export async function uploadUserImage(bucket, userId, file) {
  const image = await compressImage(file);
  if (image.size > MAX_IMAGE_BYTES) throw new FileTooLargeError(MAX_IMAGE_BYTES);
  return uploadObject(bucket, `${userId}/${crypto.randomUUID()}.${extensionOf(image, 'jpg')}`, image);
}

export class FileTooLargeError extends Error {
  constructor(limit) {
    super(`Dosya çok büyük (en fazla ${Math.round(limit / 1024 / 1024)} MB)`);
    this.code = 'file_too_large';
    this.limit = limit;
  }
}

// ---------- Kart ekleri ----------
// Render senkron: URL hazır değilse attachmentUrl '' döner, URL gelince
// onFileLoaded tetiklenir ve ekran yeniden çizilir.

let onLoaded = () => {};

export function onFileLoaded(fn) {
  onLoaded = fn;
}

export function uploadAttachment(boardId, cardId, file) {
  const path = `${boardId}/${cardId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  return uploadObject(BUCKETS.attachments, path, file);
}

export function removeAttachments(paths) {
  return removeObjects(BUCKETS.attachments, paths);
}

/** Ekin URL'i ('' = henüz hazır değil). Görsel olmayan dosyalar indirme URL'i alır. */
export function attachmentUrl(att) {
  if (!att?.storagePath) return '';
  const download = att.type === 'image' ? null : att.name;
  const key = cacheKey(BUCKETS.attachments, att.storagePath, download);
  const cached = urlCache.get(key);
  if (!isFresh(cached) && !inFlight.has(key)) {
    signedUrl(BUCKETS.attachments, att.storagePath, download).then(url => url && onLoaded());
  }
  // Yenilenirken eski URL gösterilmeye devam eder
  return cached ? cached.url : '';
}
