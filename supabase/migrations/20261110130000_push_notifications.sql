-- ============================================================
-- PUSH — Telefona anlık bildirim (APNs / FCM)
-- ============================================================
-- Akış:
--   1. Mobil uygulama giriş sonrası cihazın native token'ını
--      register_push_token() ile kaydeder (iOS: APNs, Android: FCM).
--   2. public.notifications'a satır düşünce (private.notify() zaten
--      notify_prefs'e bakıyor) ve public.direct_messages'a mesaj gelince
--      trigger, pg_net ile 'send-push' Edge Function'ını ASENKRON çağırır.
--      İstek transaction commit olunca gider; geri alınan insert push atmaz.
--   3. Fonksiyon token'ları okur, APNs/FCM'e gönderir, ölü token'ları siler.
--
-- Trigger asıl insert'ü ASLA bozmaz: tüm hatalar yakalanıp WARNING olarak
-- loglanır. Ayarlar (URL + gizli anahtar) girilmemişse hiçbir şey yapmaz.
--
-- Ayarlar nerede? Fonksiyon URL'si ve PUSH_WEBHOOK_SECRET API'ye açık
-- olmayan bir yerde durmalı:
--   • Supabase Vault (supabase_vault eklentisi) varsa önce oradan okunur:
--     şifreli saklanır, yedeklerde/dump'larda düz metin görünmez.
--   • Vault yoksa (bazı self-hosted kurulumlarda kapalı) private.settings
--     tablosuna düşülür. private şeması Data API'de yok, tabloda hiçbir
--     rol yetkisi yok ve RLS açık; yalnızca security definer fonksiyonlar
--     okur.
--   İkisi de aynı adları kullanır: 'push_function_url', 'push_webhook_secret'.
--   Kurulum adımları mobil README'deki "Push bildirimleri" bölümünde.
--
-- Not: pg_net isteği (başlıklarıyla birlikte) gönderilene kadar
-- net.http_request_queue'da, yanıtı birkaç saat net._http_response'ta durur.
-- Bu tablolar da API'ye açık değil; Supabase'in kendi webhook'ları da böyle.
-- ============================================================

-- ---------- pg_net ----------
-- Eklenti yoksa migration yine de uygulanır (token kaydı çalışsın);
-- trigger o durumda sessizce bir şey göndermez.

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice '[push] pg_net kurulamadı (%), push gönderilmeyecek', sqlerrm;
end;
$$;

-- ---------- Cihaz token'ları ----------

create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null unique check (char_length(token) between 1 and 4096),
  platform   text not null check (platform in ('ios', 'android')),
  -- Yalnızca iOS: development imzalı build'ler sandbox, TestFlight/App Store production token'ı verir
  apns_env   text check (apns_env in ('sandbox', 'production')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  constraint push_tokens_env check ((platform = 'ios') = (apns_env is not null))
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

drop trigger if exists push_tokens_updated_at on public.push_tokens;
create trigger push_tokens_updated_at before update on public.push_tokens
  for each row execute function private.set_updated_at();

revoke all on public.push_tokens from anon, authenticated;
grant select, insert, delete on public.push_tokens to authenticated;
-- Edge Function service_role ile okur, ortamı düzeltir, ölü token'ı siler
grant select, update, delete on public.push_tokens to service_role;
alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens: kendi token'larını görür" on public.push_tokens;
create policy "push_tokens: kendi token'larını görür"
  on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "push_tokens: kendi adına ekler" on public.push_tokens;
create policy "push_tokens: kendi adına ekler"
  on public.push_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "push_tokens: kendi token'ını siler" on public.push_tokens;
create policy "push_tokens: kendi token'ını siler"
  on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- Kaydet / tazele. Token başka kullanıcıdaysa (aynı telefonda hesap
-- değişti) bu kullanıcıya taşınır: istemci başkasının satırına dokunamaz,
-- taşıma yalnızca bu fonksiyonla olur.
create or replace function public.register_push_token(p_token text, p_platform text, p_env text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_env text := case when p_platform = 'ios' then coalesce(p_env, 'production') end;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'Geçersiz platform' using errcode = '22023';
  end if;
  if p_token is null or char_length(p_token) not between 1 and 4096 then
    raise exception 'Geçersiz token' using errcode = '22023';
  end if;
  if v_env is not null and v_env not in ('sandbox', 'production') then
    raise exception 'Geçersiz APNs ortamı' using errcode = '22023';
  end if;

  insert into public.push_tokens (user_id, token, platform, apns_env)
  values (v_uid, p_token, p_platform, v_env)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        apns_env = excluded.apns_env,
        last_seen = now();

  -- Uzun süredir görülmeyen cihazlar (uygulama silinmiş, telefon değişmiş)
  delete from public.push_tokens
  where user_id = v_uid and last_seen < now() - interval '90 days';
end;
$$;

revoke execute on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;

-- ---------- Ayarlar (Vault yoksa) ----------

create table if not exists private.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.settings from public, anon, authenticated;
alter table private.settings enable row level security;

-- Önce Vault, sonra private.settings. Vault sorgusu dinamik: eklenti
-- yoksa ya da yetki yoksa hata yutulur, tabloya bakılır.
create or replace function private.push_setting(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v using p_name;
    exception when others then
      v := null;
    end;
  end if;
  if v is null then
    select value into v from private.settings where key = p_name;
  end if;
  return nullif(trim(v), '');
end;
$$;

-- ---------- Gönderim ----------

-- iOS uygulama ikonundaki sayı: okunmamış bildirim + okunmamış mesaj
create or replace function private.push_badge(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.notifications where user_id = p_user and read_at is null)::int
       + (select count(*) from public.direct_messages where recipient_id = p_user and read_at is null)::int;
$$;

-- Kullanıcının cihazı yoksa ya da ayar girilmemişse hiçbir şey yapmaz
create or replace function private.send_push(p_user uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if p_user is null or not exists (select 1 from public.push_tokens where user_id = p_user) then return; end if;
  v_url := private.push_setting('push_function_url');
  v_secret := private.push_setting('push_webhook_secret');
  if v_url is null or v_secret is null then return; end if;

  perform net.http_post(
    url := v_url,
    body := p_payload || jsonb_build_object('user_id', p_user, 'badge', private.push_badge(p_user)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning '[push] istek kuyruğa alınamadı: % (%)', sqlerrm, sqlstate;
end;
$$;

-- Yeni bildirim → o kullanıcıya push
create or replace function private.on_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.send_push(new.user_id, jsonb_build_object(
      'title', new.title,
      'body', new.body,
      'thread_id', coalesce('card-' || new.card_id::text, new.kind),
      'data', jsonb_build_object(
        'notification_id', new.id, 'kind', new.kind, 'board_id', new.board_id, 'card_id', new.card_id
      )
    ));
  exception when others then
    raise warning '[push] bildirim push''u atlanıyor: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists push_notification on public.notifications;
create trigger push_notification after insert on public.notifications
  for each row execute function private.on_notification_push();

-- Yeni özel mesaj → alıcıya push (başlık: gönderenin adı)
create or replace function private.on_direct_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  begin
    select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) into v_name
    from public.profiles where id = new.sender_id;
    perform private.send_push(new.recipient_id, jsonb_build_object(
      'title', coalesce(v_name, 'Yeni mesaj'),
      'body', case when char_length(trim(new.body)) > 0 then left(new.body, 200)
                   else '📎 ' || coalesce(new.attachment_name, 'Dosya') end,
      'thread_id', 'dm-' || new.sender_id::text,
      'data', jsonb_build_object('kind', 'dm', 'sender_id', new.sender_id, 'message_id', new.id)
    ));
  exception when others then
    raise warning '[push] mesaj push''u atlanıyor: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists push_direct_message on public.direct_messages;
create trigger push_direct_message after insert on public.direct_messages
  for each row execute function private.on_direct_message_push();

-- ---------- Yetkiler ----------
-- private şeması API'de yok; yine de gizli ayar okuyan ve istek atan
-- fonksiyonlar oturum açmış kullanıcıya kapalı (bkz. rls.sql'deki toplu grant).
-- Trigger'lar security definer olduğu için sahibinin yetkisiyle çağırır.

revoke execute on function private.push_setting(text) from public, anon, authenticated;
revoke execute on function private.send_push(uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.push_badge(uuid) from public, anon, authenticated;
