-- ============================================================
-- REVIEW FIXES — Kod incelemesinde çıkan düzeltmeler
-- ============================================================
-- 1. events: güncellemede `with check (true)` vardı; oluşturan kişi
--    created_by'ı başkasına çevirebiliyordu.
-- 2. my_conversations: okunmamış sayısı her mesaj satırı için ayrı alt
--    sorguyla sayılıyordu (mesaj sayısının karesi kadar iş). Tek geçişte
--    gruplanarak sayılır; dönüş tipi aynı.
-- 3. Son yönetici kendi hesabını silemez (admin_* RPC'leri "kendini
--    silemezsin" diyordu ama delete_my_account bu kuralı atlıyordu).
-- 4. notes bucket: okuma tüm giriş yapanlara açıktı; storage list() ile
--    başkasının not görselleri listelenebiliyordu. Artık yalnızca sahibi
--    ve görselin geçtiği bir notun paylaşıldığı kişi okur.
-- ============================================================

-- ---------- 1. events güncelleme ----------

drop policy if exists "events: sahibi ya da yönetici düzenler" on public.events;
create policy "events: sahibi ya da yönetici düzenler"
  on public.events for update to authenticated
  using (created_by = (select auth.uid()) or private.is_app_admin((select auth.uid())))
  with check (created_by = (select auth.uid()) or private.is_app_admin((select auth.uid())));

-- ---------- 2. Konuşma listesi ----------

create or replace function public.my_conversations()
returns table (other_id uuid, last_body text, last_at timestamptz, last_from_me boolean, unread int)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select case when sender_id = (select auth.uid()) then recipient_id else sender_id end as other_id,
           case when char_length(trim(body)) > 0 then body else '📎 ' || coalesce(attachment_name, 'Dosya') end as body,
           created_at,
           sender_id = (select auth.uid()) as from_me,
           (recipient_id = (select auth.uid()) and read_at is null) as is_unread
    from public.direct_messages
    where sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
  ),
  counts as (
    select other_id, (count(*) filter (where is_unread))::int as n
    from mine
    group by other_id
  ),
  latest as (
    select distinct on (other_id) other_id, body, created_at, from_me
    from mine
    order by other_id, created_at desc
  )
  select l.other_id, l.body, l.created_at, l.from_me, c.n
  from latest l
  join counts c on c.other_id = l.other_id;
$$;

-- ---------- 3. Son yönetici kendini silemez ----------

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
  if private.is_app_admin(auth.uid()) and not exists (
    select 1 from auth.users u
    where u.id <> auth.uid()
      and u.deleted_at is null
      and coalesce((u.raw_app_meta_data ->> 'is_admin')::boolean, false)
      and (u.banned_until is null or u.banned_until < now())
  ) then
    raise exception 'Son yönetici sensin: önce başka birini yönetici yap, sonra hesabını sil' using errcode = '42501';
  end if;
  return private.delete_user_account(auth.uid(), null);
end;
$$;

-- ---------- 4. notes bucket okuma ----------
-- Paylaşılan not, alıcıya kopyalanır ama görseller gönderenin klasöründe
-- kalır; alıcı, gövdesinde o dosya yolu geçen bir paylaşım aldıysa okur.
-- Alıcı paylaşımı silerse (Kaydetmeden kapat) erişimi de biter.

drop policy if exists "notes bucket: okur" on storage.objects;
drop policy if exists "notes bucket: sahibi ve paylaşılan kişi okur" on storage.objects;
create policy "notes bucket: sahibi ve paylaşılan kişi okur"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'notes'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or exists (
        select 1 from public.note_shares s
        where s.recipient_id = (select auth.uid())
          and strpos(s.body, name) > 0
      )
    )
  );
