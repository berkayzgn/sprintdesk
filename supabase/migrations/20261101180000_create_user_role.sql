-- ============================================================
-- Hesap açarken rol seçimi: Kullanıcı ya da Yönetici
-- ============================================================
drop function if exists public.admin_create_user(text, text, text);

create or replace function public.admin_create_user(p_email text, p_password text, p_full_name text, p_is_admin boolean default false)
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
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'must_change_password', true)
      || case when p_is_admin then '{"is_admin": true}'::jsonb else '{}'::jsonb end,
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

revoke execute on function public.admin_create_user(text, text, text, boolean) from public, anon;
grant execute on function public.admin_create_user(text, text, text, boolean) to authenticated;
