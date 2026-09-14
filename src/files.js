// ============================================================
// FILES — Ek dosyaları IndexedDB'de tutar
// ============================================================
// localStorage ~5MB ile sınırlı; dosyaları base64 olarak state'e koymak
// kotayı doldurup tüm kaydı bozuyordu. State'te yalnızca metadata
// (fileKey, ad, boyut) kalır; içerik burada Blob olarak saklanır.
// Supabase aşamasında bu modülün yerini Storage alacak.
// ============================================================

const DB_NAME = 'flowdesk-files';
const STORE = 'files';

let dbPromise = null;
const urls = new Map();     // fileKey -> objectURL
const pending = new Set();  // yüklenmekte olan anahtarlar
let onLoaded = () => {};

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/** Arka planda yüklenen bir dosya hazır olduğunda çağrılacak fonksiyon */
export function onFileLoaded(fn) { onLoaded = fn; }

export async function putFile(key, blob) {
  await run('readwrite', s => s.put(blob, key));
  urls.set(key, URL.createObjectURL(blob));
}

export function deleteFile(key) {
  if (!key) return Promise.resolve();
  const u = urls.get(key);
  if (u) { URL.revokeObjectURL(u); urls.delete(key); }
  return run('readwrite', s => s.delete(key)).catch(() => {});
}

/**
 * Ekin görüntülenebilir URL'ini döndürür. IndexedDB'deki dosya henüz
 * belleğe alınmadıysa '' döner, yükleme bitince onFileLoaded tetiklenir.
 */
export function attachmentUrl(att) {
  if (!att) return '';
  if (!att.fileKey) return att.url || '';
  const key = att.fileKey;
  if (urls.has(key)) return urls.get(key);
  if (!pending.has(key)) {
    pending.add(key);
    run('readonly', s => s.get(key))
      .then(blob => {
        if (blob) { urls.set(key, URL.createObjectURL(blob)); onLoaded(); }
      })
      .catch(err => console.error('[files] okunamadı', key, err))
      .finally(() => pending.delete(key));
  }
  return '';
}

/** State'te artık referansı olmayan dosyaları siler */
export async function collectGarbage(liveKeys) {
  try {
    const keys = await run('readonly', s => s.getAllKeys());
    await Promise.all(keys.filter(k => !liveKeys.has(k)).map(deleteFile));
  } catch (err) {
    console.error('[files] temizlik başarısız', err);
  }
}
