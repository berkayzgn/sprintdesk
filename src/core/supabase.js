/**
 * Paylaşılan Supabase istemcisi. Anon key tarayıcıya açıktır; veri güvenliğini RLS sağlar.
 * Adres ve anahtar build sırasında env'den gömülür (bkz. .env.example).
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Değişkenler build'e gömülür: ekledikten sonra yeniden deploy gerekir
  document.getElementById('app').innerHTML =
    '<p style="padding:24px;font-family:system-ui">Uygulama yapılandırılamadı. Lütfen daha sonra tekrar deneyin.</p>';
  throw new Error(
    import.meta.env.DEV ? '[supabase] VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalı' : 'config',
  );
}

export const supabase = createClient(url, anonKey);
