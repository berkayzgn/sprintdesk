-- ============================================================
-- ADMIN MANAGE USERS — Askıya alma, silme, yönetici yetkisi
-- ============================================================
-- • Askıya alma: auth.users.banned_until ileri bir tarihe çekilir, açık
--   oturumlar kapatılır. GoTrue giriş ve token yenilemeyi reddeder
--   (user_banned). Zaten verilmiş access token süresi dolana kadar
--   (JWT_EXPIRY, varsayılan 1 saat) geçerli kalır.
-- • Silme: delete_my_account ile aynı devir kuralları; tek fark, board'da
--   başka üye yoksa board silinmez, silen yöneticiye devredilir. Böylece
--   ayrılan kişinin işi kaybolmaz ve storage'da sahipsiz dosya kalmaz
--   (storage.objects SQL'den silinemiyor).
-- • Yönetici yetkisi verme/alma. Yönetici kendi yetkisini alamaz, kendini
--   askıya alamaz/silemez → sistemde her zaman en az bir yönetici kalır.
-- ============================================================

-- ---------- Ortak silme mantığı ----------
-- p_fallback_heir: board'da başka üye yoksa sahipliği alacak kişi
-- (null → board silinir; kendi hesabını silen kullanıcı için)

create or replace function private.delete_user_account(p_uid uuid, p_fallback_heir uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid;
  v_heir uuid;
  v_deleted int := 0;
  v_transferred int := 0;
begin
  for v_board_id in
    select board_id from public.board_members where user_id = p_uid and role = 'owner'
  loop
    select user_id into v_heir
    from public.board_members
    where board_id = v_board_id and user_id <> p_uid
    order by case role when 'admin' then 0 when 'member' then 1 else 2 end, created_at
    limit 1;

    if v_heir is null and p_fallback_heir is null then
      delete from public.boards where id = v_board_id;
      v_deleted := v_deleted + 1;
    else
      -- Board başına tek owner kuralı: önce eski owner satırı gider
      delete from public.board_members where board_id = v_board_id and user_id = p_uid;
      if v_heir is null then
        insert into public.board_members (board_id, user_id, role) values (v_board_id, p_fallback_heir, 'owner');
      else
        update public.board_members set role = 'owner' where board_id = v_board_id and user_id = v_heir;
      end if;
      v_transferred := v_transferred + 1;
    end if;
  end loop;

  -- boards.created_by profili cascade ile silinince board da silinirdi:
  -- oluşturan olarak mevcut owner'ı yaz
  update public.boards b
  set created_by = bm.user_id
  from public.board_members bm
  where b.created_by = p_uid and bm.board_id = b.id and bm.role = 'owner';

  -- profiles, board_members, card_assignees, oturumlar cascade ile silinir
  delete from auth.users where id = p_uid;

  return jsonb_build_object('deleted_boards', v_deleted, 'transferred_boards', v_transferred);
end;
$$;

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Hesap silmek için giriş yapmalısın' using errcode = '42501';
  end if;
  return private.delete_user_account(auth.uid(), null);
end;
$$;

-- ---------- Yardımcı: hedef kullanıcı kontrolü ----------

create or replace function private.assert_manageable_user(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_app_admin();
  if p_user_id = auth.uid() then
    raise exception 'Bu işlemi kendi hesabında yapamazsın' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Kullanıcı bulunamadı' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------- RPC: askıya al / askıdan çıkar ----------

create or replace function public.admin_set_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_manageable_user(p_user_id);
  update auth.users
  set banned_until = case when p_suspended then now() + interval '100 years' end,
      updated_at = now()
  where id = p_user_id;
  if p_suspended then
    delete from auth.sessions where user_id = p_user_id;
  end if;
end;
$$;

-- ---------- RPC: yönetici yetkisi ver / al ----------

create or replace function public.admin_set_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_manageable_user(p_user_id);
  update auth.users
  set raw_app_meta_data = case
        when p_is_admin then coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
        else coalesce(raw_app_meta_data, '{}'::jsonb) - 'is_admin'
      end,
      updated_at = now()
  where id = p_user_id;
end;
$$;

-- ---------- RPC: hesabı sil ----------

create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_manageable_user(p_user_id);
  return private.delete_user_account(p_user_id, auth.uid());
end;
$$;

-- ---------- Liste: askıda bilgisini ve board sayısını ekle ----------

drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  avatar_color text,
  is_admin boolean,
  must_change_password boolean,
  is_suspended boolean,
  owned_boards int,
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
           coalesce(u.banned_until > now(), false),
           (select count(*)::int from public.board_members bm where bm.user_id = u.id and bm.role = 'owner'),
           u.created_at, u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.deleted_at is null
    order by u.created_at;
end;
$$;

revoke execute on function private.delete_user_account(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_set_suspended(uuid, boolean) from public, anon;
revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
