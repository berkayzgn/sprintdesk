-- ============================================================
-- ADMIN ACCOUNTS — Kayıt kapalı; hesapları yönetici açar
-- ============================================================
-- • Herkese açık kayıt (signUp) veritabanında engellenir.
-- • Yönetici (auth.users.raw_app_meta_data.is_admin = true) uygulamadan
--   hesap açar, hesap listesini görür ve geçici şifre verebilir.
-- • Yöneticinin açtığı / şifresini sıfırladığı hesapta
--   app_metadata.must_change_password = true olur; kullanıcı ilk girişte
--   şifre belirleme ekranına düşer. Şifre gerçekten değişince bayrak
--   trigger ile kalkar (kullanıcı app_metadata'yı kendisi değiştiremez).
--
-- Yönetici yapmak / kaldırmak (Supabase SQL editöründen):
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'
--   where email = 'kisi@kyncteknoloji.com';
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'is_admin'
--   where email = 'kisi@kyncteknoloji.com';
-- ============================================================

-- ---------- Yardımcılar ----------

create or replace function private.is_app_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (raw_app_meta_data ->> 'is_admin')::boolean from auth.users where id = p_uid), false);
$$;

create or replace function private.assert_app_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_app_admin(auth.uid()) then
    raise exception 'Bu işlem için yönetici olmalısın' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_valid_password(p_password text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_password is null or length(p_password) < 8 then
    raise exception 'Şifre en az 8 karakter olmalı' using errcode = '22023';
  end if;
  if length(p_password) > 72 then
    raise exception 'Şifre en fazla 72 karakter olabilir' using errcode = '22023';
  end if;
end;
$$;

-- ---------- Herkese açık kaydı kapat ----------
-- Eski auto_confirm trigger'ı herkesi doğrulanmış sayıyordu; artık gerek yok.
-- Sunucuda mailer_autoconfirm kapalı olduğu için signUp ile gelen satırda
-- email_confirmed_at boştur → reddedilir. İzin verilenler:
--   • admin_create_user (aşağıda) — transaction'a özel bayrakla
--   • Supabase Studio'dan "Auto Confirm User" işaretli kullanıcı ekleme
-- Not: Sunucu .env'de DISABLE_SIGNUP=true yapmak ek bir güvenlik katmanıdır.

drop trigger if exists auto_confirm_email on auth.users;
drop function if exists private.auto_confirm_email();

create or replace function private.block_public_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('sprintdesk.admin_create', true), '') = 'on'
     or new.email_confirmed_at is not null then
    return new;
  end if;
  raise exception 'Kayıt kapalı: hesapları yönetici açar' using errcode = '42501';
end;
$$;

drop trigger if exists block_public_signup on auth.users;
create trigger block_public_signup
  before insert on auth.users
  for each row execute function private.block_public_signup();

-- ---------- Şifre değişince "şifreni değiştir" bayrağını kaldır ----------

create or replace function private.clear_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Yöneticinin sıfırlaması bayrağı bilerek koyar; ona dokunma
  if coalesce(current_setting('sprintdesk.admin_reset', true), '') = 'on' then
    return new;
  end if;
  if new.raw_app_meta_data ? 'must_change_password' then
    new.raw_app_meta_data := new.raw_app_meta_data - 'must_change_password';
  end if;
  return new;
end;
$$;

drop trigger if exists clear_must_change_password on auth.users;
create trigger clear_must_change_password
  before update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function private.clear_must_change_password();

-- ---------- RPC: hesap aç ----------

create or replace function public.admin_create_user(p_email text, p_password text, p_full_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_name text := trim(coalesce(p_full_name, ''));
  v_uid uuid := gen_random_uuid();
begin
  perform private.assert_app_admin();
  perform private.assert_valid_password(p_password);

  if v_name = '' then
    raise exception 'Ad soyad gerekli' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Geçerli bir e-posta gir' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Bu e-postayla zaten bir hesap var' using errcode = '23505';
  end if;

  perform set_config('sprintdesk.admin_create', 'on', true);

  -- Token alanları NULL değil '' olmalı: GoTrue NULL'ı okuyamayıp giriş verdirmiyor
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'must_change_password', true),
    jsonb_build_object('full_name', v_name),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (
    v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', now(), now()
  );

  perform set_config('sprintdesk.admin_create', 'off', true);
  return v_uid;
end;
$$;

-- ---------- RPC: hesap listesi ----------

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  avatar_color text,
  is_admin boolean,
  must_change_password boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_app_admin();
  return query
    select u.id, u.email::text, coalesce(p.full_name, ''), coalesce(p.avatar_color, '#6366f1'),
           coalesce((u.raw_app_meta_data ->> 'is_admin')::boolean, false),
           coalesce((u.raw_app_meta_data ->> 'must_change_password')::boolean, false),
           u.created_at, u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.deleted_at is null
    order by u.created_at;
end;
$$;

-- ---------- RPC: geçici şifre ver (şifremi unuttum yerine; SMTP yok) ----------

create or replace function public.admin_reset_password(p_user_id uuid, p_password text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_app_admin();
  perform private.assert_valid_password(p_password);
  if p_user_id = auth.uid() then
    raise exception 'Kendi şifreni profil ekranından değiştir' using errcode = '22023';
  end if;

  perform set_config('sprintdesk.admin_reset', 'on', true);
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb,
      updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception 'Kullanıcı bulunamadı' using errcode = 'P0002';
  end if;
  perform set_config('sprintdesk.admin_reset', 'off', true);

  -- Açık oturumlarını kapat: eski şifreyle girilmiş cihazlar da yeniden girsin
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke execute on function public.admin_create_user(text, text, text) from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_reset_password(uuid, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
