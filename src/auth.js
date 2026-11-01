// ============================================================
// AUTH — Supabase Auth ile giriş / çıkış (kayıt kapalı: hesapları yönetici açar)
// ============================================================
// Oturumu supabase-js kendi saklar ve yeniler; state'e yalnızca
// ekranın ihtiyacı olan özet (authed, userEmail, userName, isAdmin,
// mustChangePassword) yazılır. isAdmin / mustChangePassword app_metadata'dan
// gelir; kullanıcı bunları kendisi değiştiremez
// (bkz. migrations/..._admin_accounts.sql).
// ============================================================
import { supabase } from './supabase.js';
import { state, setState } from './state.js';
import { loadInitial, resetData, removeFilesOfBoardsDeletedWithAccount } from './store.js';
import { startRealtime, stopRealtime } from './realtime.js';
import { startSocial, stopSocial } from './social.js';
import { resetNotes } from './notes.js';

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
  user_banned: 'Hesabın askıya alınmış. Yöneticine başvur.',
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
    isAdmin: user?.app_metadata?.is_admin === true,
    mustChangePassword: user?.app_metadata?.must_change_password === true,
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
      stopSocial();
      resetNotes();
      resetData();
      if (user) {
        loadInitial();
        startRealtime();
        startSocial();
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
 * İlk girişte (ya da yönetici şifreyi sıfırladıktan sonra) yeni şifreyi kaydeder.
 * Bayrak sunucuda trigger ile kalkar; yeni değeri almak için oturum yenilenir.
 */
export async function setInitialPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: authErrorMessage(error) };
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.error('[auth] oturum yenilenemedi', refreshError);
    // Şifre değişti ama eski token'da bayrak duruyor: tekrar giriş iste
    await supabase.auth.signOut({ scope: 'local' });
    return { error: 'Şifren kaydedildi. Lütfen yeni şifrenle tekrar giriş yap.' };
  }
  return {};
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
