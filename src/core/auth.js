/**
 * Giriş / çıkış ve şifre işlemleri. Kayıt kapalı; hesapları yönetici açar.
 * isAdmin ve mustChangePassword app_metadata'dan gelir, kullanıcı değiştiremez.
 */
import { supabase } from './supabase.js';
import { state, setState } from './state.js';
import { loadInitial, resetData, removeFilesOfBoardsDeletedWithAccount } from './store.js';
import { startRealtime, stopRealtime } from './realtime.js';
import { startSocial, stopSocial } from './social.js';
import { resetNotes } from '../views/notes.js';

const ACCOUNT_EXISTS = 'Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.';
const RATE_LIMITED = 'Çok fazla deneme yapıldı, biraz sonra tekrar dene.';

const MESSAGES = {
  invalid_credentials: 'E-posta veya şifre hatalı.',
  email_not_confirmed: 'E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.',
  user_already_exists: ACCOUNT_EXISTS,
  email_exists: ACCOUNT_EXISTS,
  weak_password: 'Şifre çok zayıf, daha güçlü bir şifre seç.',
  email_address_invalid: 'Geçerli bir e-posta gir.',
  signup_disabled: 'Yeni kayıtlar şu an kapalı.',
  over_email_send_rate_limit: RATE_LIMITED,
  over_request_rate_limit: RATE_LIMITED,
  same_password: 'Yeni şifre eskisiyle aynı olamaz.',
  email_address_not_authorized: 'Bu e-posta adresine mail gönderilemiyor.',
  user_banned: 'Hesabın askıya alınmış. Yöneticine başvur.',
  reauthentication_needed: 'Güvenlik için tekrar giriş yapıp yeniden dene.',
};

/** Supabase hatasını kullanıcıya gösterilecek Türkçe metne çevirir */
function authErrorMessage(error) {
  if (!error) return '';
  if (MESSAGES[error.code]) return MESSAGES[error.code];
  // Sunucuda SMTP ayarlı değilse doğrulama maili gönderilemez (GoTrue 500 döner)
  if (/sending .*(confirmation|email)|smtp|mail/i.test(error.message || '')) {
    return 'Doğrulama maili gönderilemedi: sunucuda mail ayarı eksik. Sistem yöneticisine haber ver.';
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0)
    return 'Sunucuya ulaşılamadı, bağlantını kontrol et.';
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

  // Veri yalnızca kullanıcı değişince yeniden yüklenir (token yenilemede değil).
  // setTimeout: auth callback'i içinden yapılan sorgular supabase-js'i kilitleyebiliyor.
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
  // Bu callback içinde supabase çağrısı await edilmemeli (bkz. applySession)
  supabase.auth.onAuthStateChange((_event, session) => applySession(session));
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error && authErrorMessage(error) };
}

/** İlk girişte yeni şifreyi kaydeder. Bayrağı trigger kaldırır; yeni değer için oturum yenilenir. */
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

/** Mevcut kullanıcının şifresini yeniden girişle doğrular; hata metni ya da null döner */
async function verifyPassword(password, wrongPasswordMessage) {
  const { error } = await supabase.auth.signInWithPassword({ email: state.userEmail, password });
  if (!error) return null;
  return error.code === 'invalid_credentials' ? wrongPasswordMessage : authErrorMessage(error);
}

/** Mevcut şifreyi doğrulayıp yenisini kaydeder */
export async function changePassword(currentPassword, newPassword) {
  const verifyError = await verifyPassword(currentPassword, 'Mevcut şifre hatalı.');
  if (verifyError) return { error: verifyError };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error && authErrorMessage(error) };
}

/**
 * Şifreyi doğrulayıp hesabı kalıcı olarak siler.
 * @returns {{ error?: string, deletedBoards?: number, transferredBoards?: number }}
 */
const LAST_ADMIN = 'Son yönetici sensin: önce başka birini yönetici yap, sonra hesabını sil.';

/** Sistemde başka (askıda olmayan) yönetici yoksa true. Asıl kontrol delete_my_account'ta. */
async function isLastAdmin() {
  if (!state.isAdmin) return false;
  const { data, error } = await supabase.rpc('list_directory');
  if (error || !data) return false; // emin değilsek sunucu karar versin
  return !data.some(p => p.is_admin && p.id !== state.userId);
}

export async function deleteAccount(password) {
  const verifyError = await verifyPassword(password, 'Şifre hatalı.');
  if (verifyError) return { error: verifyError };

  // Dosyalar silinmeden önce: sunucu son yöneticiyi reddedecekse board dosyaları boşuna gitmesin
  if (await isLastAdmin()) return { error: LAST_ADMIN };
  await removeFilesOfBoardsDeletedWithAccount();
  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) {
    console.error('[auth] hesap silinemedi', error);
    return { error: error.code === '42501' && error.message ? error.message : 'Hesap silinemedi, tekrar dene.' };
  }

  // Kullanıcı sunucudan silindi; yalnızca yerel oturum temizlenir
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
