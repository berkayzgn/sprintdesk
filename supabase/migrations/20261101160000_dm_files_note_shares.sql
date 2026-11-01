-- ============================================================
-- Mesajlarda dosya/görsel + not paylaşma
-- ============================================================
-- • Mesaja tek ek: 'dm' bucket'ı, yol '<gönderen>/<alıcı>/<uuid>-<ad>'.
--   Yalnızca iki taraf okuyabilir. 15 MB sınır (görseller istemcide küçültülür).
-- • Not paylaşma: notun o anki kopyası alıcıya gider (canlı bağlı değil).
--   Alıcı "Notlarıma kaydet" ile kendi notlarına ekler.
-- ============================================================

alter table public.direct_messages add column if not exists attachment_path text;
alter table public.direct_messages add column if not exists attachment_name text;
alter table public.direct_messages add column if not exists attachment_mime text;
alter table public.direct_messages add column if not exists attachment_size integer;

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.direct_messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%body%'
  loop execute format('alter table public.direct_messages drop constraint %I', c); end loop;
end $$;
alter table public.direct_messages add constraint direct_messages_body_check
  check (char_length(body) <= 4000 and (char_length(trim(body)) > 0 or attachment_path is not null));
alter table public.direct_messages add constraint direct_messages_attachment_path
  check (attachment_path is null or (split_part(attachment_path, '/', 1) = sender_id::text and split_part(attachment_path, '/', 2) = recipient_id::text));

insert into storage.buckets (id, name, public, file_size_limit)
values ('dm', 'dm', false, 15728640)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "dm bucket: taraflar okur" on storage.objects;
create policy "dm bucket: taraflar okur"
  on storage.objects for select to authenticated
  using (bucket_id = 'dm' and (select auth.uid())::text in (split_part(name, '/', 1), split_part(name, '/', 2)));
drop policy if exists "dm bucket: gönderen yükler" on storage.objects;
create policy "dm bucket: gönderen yükler"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dm' and split_part(name, '/', 1) = (select auth.uid())::text and split_part(name, '/', 2) <> (select auth.uid())::text);
drop policy if exists "dm bucket: gönderen siler" on storage.objects;
create policy "dm bucket: gönderen siler"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dm' and split_part(name, '/', 1) = (select auth.uid())::text);

-- my_conversations: ek gönderilen mesajın önizlemesi
create or replace function public.my_conversations()
returns table (other_id uuid, last_body text, last_at timestamptz, last_from_me boolean, unread int)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select case when sender_id = auth.uid() then recipient_id else sender_id end as other_id,
           case when char_length(trim(body)) > 0 then body else '📎 ' || coalesce(attachment_name, 'Dosya') end as body,
           created_at, sender_id = auth.uid() as from_me, read_at, recipient_id
    from public.direct_messages
    where sender_id = auth.uid() or recipient_id = auth.uid()
  )
  select distinct on (other_id) other_id, body, created_at, from_me,
         (select count(*)::int from mine m2 where m2.other_id = mine.other_id and m2.recipient_id = auth.uid() and m2.read_at is null)
  from mine
  order by other_id, created_at desc;
$$;

-- ---------- Not paylaşma ----------

create table if not exists public.note_shares (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  title        text not null default '' check (char_length(title) <= 200),
  body         text not null default '' check (char_length(body) <= 20000),
  color        text not null default '#fef08a' check (color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'),
  created_at   timestamptz not null default now(),
  saved_at     timestamptz,
  constraint note_shares_not_self check (sender_id <> recipient_id)
);
create index if not exists note_shares_recipient_idx on public.note_shares (recipient_id, created_at desc);

revoke all on public.note_shares from anon, authenticated;
grant select, insert, delete on public.note_shares to authenticated;
grant update (saved_at) on public.note_shares to authenticated;
alter table public.note_shares enable row level security;

drop policy if exists "note_shares: taraflar görür" on public.note_shares;
create policy "note_shares: taraflar görür" on public.note_shares for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
drop policy if exists "note_shares: gönderir" on public.note_shares;
create policy "note_shares: gönderir" on public.note_shares for insert to authenticated
  with check (sender_id = (select auth.uid()));
drop policy if exists "note_shares: alıcı kaydeder" on public.note_shares;
create policy "note_shares: alıcı kaydeder" on public.note_shares for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
drop policy if exists "note_shares: taraflar siler" on public.note_shares;
create policy "note_shares: taraflar siler" on public.note_shares for delete to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create or replace function private.on_note_shared()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(new.recipient_id, 'note_shared', private.actor_name() || ' seninle bir not paylaştı',
    coalesce(nullif(new.title, ''), left(regexp_replace(new.body, '<[^>]*>', ' ', 'g'), 120)), null, null);
  return new;
end;
$$;
drop trigger if exists notify_note_shared on public.note_shares;
create trigger notify_note_shared after insert on public.note_shares
  for each row execute function private.on_note_shared();
