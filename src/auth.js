// ============================================================
// AUTH — Supabase Auth ile giriş / kayıt / çıkış
// ============================================================
// Oturumu supabase-js kendi saklar ve yeniler; state'e yalnızca
// ekranın ihtiyacı olan özet (authed, userEmail, userName) yazılır.
// ============================================================
import { supabase } from './supabase.js';
import { state, setState } from './state.js';
import { loadInitial, resetData, removeFilesOfBoardsDeletedWithAccount } from './store.js';
import { startRealtime, stopRealtime } from './realtime.js';

const MESSAGES = {
  invalid_credentials: 'E-posta veya şifre hatalı.',
  email_not_confirmed: 'E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.',
  user_already_exists: 'Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.',
  email_exists: 'Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.',
  weak_password: 'Şifre çok zayıf, daha güçlü bir şifre seç.',
  email_address_invalid: 'Geçerli bir e-posta gir.',
  signup_disabled: 'Yeni kayıtlar şu an kapalı.',
  over_email_send_rate_limit: 'Çok fazla deneme yapıldı, biraz sonra tekrar dene.',
  over_request_rate_limit: 'Çok fazla deneme yapıldı, biraz sonra tekrar dene.',
  same_password: 'Yeni şifre eskisiyle aynı olamaz.',
  email_address_not_authorized: 'Bu e-posta adresine mail gönderilemiyor.',
  reauthentication_needed: 'Güvenlik için tekrar giriş yapıp yeniden dene.',
};

/** Supabase hatasını kullanıcıya gösterilecek Türkçe metne çevirir */
export function authErrorMessage(error) {
  if (!error) return '';
  if (MESSAGES[error.code]) return MESSAGES[error.code];
  // Sunucuda SMTP ayarlı değilse doğrulama maili gönderilemez (GoTrue 500 döner)
  if (/sending .*(confirmation|email)|smtp|mail/i.test(error.message || '')) {
    return 'Doğrulama maili gönderilemedi: sunucuda mail ayarı eksik. Sistem yöneticisine haber ver.';
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'Sunucuya ulaşılamadı, bağlantını kontrol et.';
  console.error('[auth]', error);
  return 'Bir şeyler ters gitti, tekrar dene.';
}

function applySession(session) {
  const user = session?.user;
  const prevUserId = state.userId;
  setState({
    authReady: true,
    authed: !!user,
    userId: user?.id ?? null,
    ...(user && {
      userEmail: user.email,
      userName: user.user_metadata?.full_name || '',
    }),
  });

  // Token yenilemesi gibi olaylarda veriyi baştan yükleme; sadece kullanıcı değişince.
  // setTimeout: supabase-js, bu callback içinden yapılan sorguları kilitleyebiliyor.
  if (user?.id !== prevUserId) {
    setTimeout(() => {
      stopRealtime();
      resetData();
      if (user) {
        loadInitial();
        startRealtime();
      }
    }, 0);
  }
}

/** Açılışta mevcut oturumu yükler ve sonraki değişiklikleri dinler */
export function initAuth() {
  // Not: bu callback içinde başka bir supabase çağrısı await edilmemeli
  supabase.auth.onAuthStateChange((_event, session) => applySession(session));
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error && authErrorMessage(error) };
}

/**
 * @returns {{ error?: string, needsConfirmation?: boolean }}
 * needsConfirmation: sunucuda e-posta doğrulama açık, oturum link tıklanınca açılır
 */
export async function signUp({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) return { error: authErrorMessage(error) };
  if (data.session) return {};

  // Sunucu doğrulama istiyor ama hesap veritabanında otomatik doğrulanmış
  // olabilir (bkz. migrations/..._auto_confirm.sql): doğrudan giriş dene
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (!signInError) return {};
  if (signInError.code === 'email_not_confirmed') return { needsConfirmation: true };
  return { error: authErrorMessage(signInError) };
}

/** Mevcut şifreyi doğrulayıp yenisini kaydeder */
export async function changePassword(currentPassword, newPassword) {
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: state.userEmail,
    password: currentPassword,
  });
  if (verifyError) {
    return { error: verifyError.code === 'invalid_credentials' ? 'Mevcut şifre hatalı.' : authErrorMessage(verifyError) };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error && authErrorMessage(error) };
}

/**
 * Şifreyi doğrulayıp hesabı kalıcı olarak siler (bkz. migrations/..._delete_account.sql).
 * @returns {{ error?: string, deletedBoards?: number, transferredBoards?: number }}
 */
export async function deleteAccount(password) {
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: state.userEmail, password });
  if (verifyError) {
    return { error: verifyError.code === 'invalid_credentials' ? 'Şifre hatalı.' : authErrorMessage(verifyError) };
  }

  await removeFilesOfBoardsDeletedWithAccount();
  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) {
    console.error('[auth] hesap silinemedi', error);
    return { error: 'Hesap silinemedi, tekrar dene.' };
  }

  // Kullanıcı sunucuda yok artık: sadece yerel oturumu temizle
  await supabase.auth.signOut({ scope: 'local' });
  return { deletedBoards: data?.deleted_boards ?? 0, transferredBoards: data?.transferred_boards ?? 0 };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[auth] çıkış', error);
    // Sunucuya ulaşılamasa da yerel oturumu kapat
    await supabase.auth.signOut({ scope: 'local' });
  }
}
