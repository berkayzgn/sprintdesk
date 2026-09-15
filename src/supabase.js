// ============================================================
// SUPABASE — Tek paylaşılan istemci
// ============================================================
// Adres ve anahtar .env.local'dan gelir (bkz. .env.example). Buradaki
// anon key tarayıcıya açıktır; veri güvenliğini RLS kuralları sağlar.
// ============================================================
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Lokalde .env.local, Vercel'de Project Settings → Environment Variables.
  // Değişkenler build sırasında gömülür; ekledikten sonra yeniden deploy gerekir.
  document.getElementById('app').innerHTML =
    '<p style="padding:24px;font-family:system-ui">Uygulama yapılandırılamadı. Lütfen daha sonra tekrar deneyin.</p>';
  throw new Error(import.meta.env.DEV
    ? '[supabase] VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalı'
    : 'config');
}

export const supabase = createClient(url, anonKey);
