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
  throw new Error('[supabase] VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY .env.local içinde tanımlı olmalı');
}

export const supabase = createClient(url, anonKey);
