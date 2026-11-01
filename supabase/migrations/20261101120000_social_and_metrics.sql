-- ============================================================
-- SOCIAL & METRICS — Mesajlar, bildirimler, topluluk, performans
-- ============================================================
-- Boyut önlemleri (self-hosted: sınır sunucunun diski):
--   • Mesaj 4000, gönderi 4000, açıklama 50000 karakterle sınırlı
--   • Topluluk görselleri 5 MB üstü reddedilir (istemci ~1600px'e küçültür)
--   • Bildirimler 60 günden eski olunca otomatik silinir
-- ============================================================

-- ---------- Kart tamamlanma zamanı (performans için) ----------

alter table public.cards add column if not exists completed_at timestamptz;

update public.cards set completed_at = updated_at where due_complete and completed_at is null;

create or replace function private.cards_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.due_complete and (tg_op = 'INSERT' or not old.due_complete) then
    new.completed_at := now();
  elsif not new.due_complete then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_completed_at on public.cards;
create trigger cards_completed_at
  before insert or update of due_complete on public.cards
  for each row execute function private.cards_completed_at();

alter table public.cards drop constraint if exists cards_description_len;
alter table public.cards add constraint cards_description_len check (char_length(description) <= 50000) not valid;

-- ---------- Ofis rehberi: mesaj için herkes herkesi görebilir ----------

create or replace function public.list_directory()
returns table (id uuid, full_name text, email text, avatar_color text, is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, p.avatar_color,
         coalesce((u.raw_app_meta_data ->> 'is_admin')::boolean, false)
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select auth.uid()) is not null
    and (u.banned_until is null or u.banned_until < now())
  order by p.full_name;
$$;

-- ---------- Bildirim tercihleri ----------
-- Her tür açık/kapalı; varsayılan hepsi açık

alter table public.profiles
  add column if not exists notify_prefs jsonb not null default '{}'::jsonb;
grant update (notify_prefs) on public.profiles to authenticated;

create or replace function private.wants_notification(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (notify_prefs ->> p_kind)::boolean from public.profiles where id = p_user), true);
$$;

-- ---------- Bildirimler ----------

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  board_id   uuid references public.boards (id) on delete cascade,
  card_id    uuid references public.cards (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
alter table public.notifications enable row level security;

drop policy if exists "notifications: kendi bildirimleri" on public.notifications;
create policy "notifications: kendi bildirimleri"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "notifications: okundu işaretler" on public.notifications;
create policy "notifications: okundu işaretler"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "notifications: siler" on public.notifications;
create policy "notifications: siler"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_board uuid, p_card uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if p_user is null or p_user = v_actor then return; end if;
  if not private.wants_notification(p_user, p_kind) then return; end if;
  insert into public.notifications (user_id, actor_id, kind, title, body, board_id, card_id)
  values (p_user, v_actor, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 300), p_board, p_card);
  -- Eski bildirimleri temizle (tablo şişmesin)
  delete from public.notifications where user_id = p_user and created_at < now() - interval '60 days';
end;
$$;

create or replace function private.actor_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif((select full_name from public.profiles where id = auth.uid()), ''), 'Biri');
$$;

-- Karta kişi atandı
create or replace function private.on_card_assignee_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select id, title, board_id into c from public.cards where id = new.card_id;
  perform private.notify(new.user_id, 'assigned', private.actor_name() || ' seni bir göreve ekledi', c.title, c.board_id, c.id);
  return new;
end;
$$;
drop trigger if exists notify_card_assignee on public.card_assignees;
create trigger notify_card_assignee after insert on public.card_assignees
  for each row execute function private.on_card_assignee_added();

-- Alt göreve kişi atandı
create or replace function private.on_checklist_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if new.assignee_id is null or new.assignee_id is not distinct from old.assignee_id then return new; end if;
  select id, title, board_id into c from public.cards where id = new.card_id;
  perform private.notify(new.assignee_id, 'assigned', private.actor_name() || ' sana bir alt görev verdi', new.text || ' · ' || c.title, c.board_id, c.id);
  return new;
end;
$$;
drop trigger if exists notify_checklist_assigned on public.checklist_items;
create trigger notify_checklist_assigned after insert or update of assignee_id on public.checklist_items
  for each row execute function private.on_checklist_assigned();

-- Kartına yorum yapıldı → kartın kişileri
create or replace function private.on_comment_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  u uuid;
begin
  select id, title, board_id into c from public.cards where id = new.card_id;
  for u in select user_id from public.card_assignees where card_id = new.card_id loop
    perform private.notify(u, 'comment', private.actor_name() || ' yorum yaptı: ' || c.title, new.body, c.board_id, c.id);
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments
  for each row execute function private.on_comment_added();

-- Board'a yeni kart eklendi → board üyeleri
create or replace function private.on_card_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board text;
  u uuid;
begin
  select name into v_board from public.boards where id = new.board_id;
  for u in select user_id from public.board_members where board_id = new.board_id loop
    perform private.notify(u, 'new_card', private.actor_name() || ' yeni görev ekledi · ' || v_board, new.title, new.board_id, new.id);
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_card_created on public.cards;
create trigger notify_card_created after insert on public.cards
  for each row execute function private.on_card_created();

-- Kart tamamlandı → kartın kişileri
create or replace function private.on_card_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
begin
  if not new.due_complete or old.due_complete then return new; end if;
  for u in select user_id from public.card_assignees where card_id = new.id loop
    perform private.notify(u, 'completed', private.actor_name() || ' bir görevi tamamladı', new.title, new.board_id, new.id);
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_card_completed on public.cards;
create trigger notify_card_completed after update of due_complete on public.cards
  for each row execute function private.on_card_completed();

-- Board'a eklendi
create or replace function private.on_board_member_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board text;
begin
  if new.role = 'owner' then return new; end if;
  select name into v_board from public.boards where id = new.board_id;
  perform private.notify(new.user_id, 'board_added', private.actor_name() || ' seni bir board''a ekledi', v_board, new.board_id, null);
  return new;
end;
$$;
drop trigger if exists notify_board_member on public.board_members;
create trigger notify_board_member after insert on public.board_members
  for each row execute function private.on_board_member_added();

-- ---------- Özel mesajlar ----------

create table if not exists public.direct_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(trim(body)) between 1 and 4000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint direct_messages_not_self check (sender_id <> recipient_id)
);

create index if not exists dm_recipient_created_idx on public.direct_messages (recipient_id, created_at desc);
create index if not exists dm_sender_created_idx on public.direct_messages (sender_id, created_at desc);

revoke all on public.direct_messages from anon, authenticated;
grant select, insert on public.direct_messages to authenticated;
alter table public.direct_messages enable row level security;

drop policy if exists "dm: taraflar görür" on public.direct_messages;
create policy "dm: taraflar görür"
  on public.direct_messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
drop policy if exists "dm: kendi adına gönderir" on public.direct_messages;
create policy "dm: kendi adına gönderir"
  on public.direct_messages for insert to authenticated
  with check (sender_id = (select auth.uid()));

-- Konuşma listesi: her kişiyle son mesaj + okunmamış sayısı
create or replace function public.my_conversations()
returns table (other_id uuid, last_body text, last_at timestamptz, last_from_me boolean, unread int)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select case when sender_id = auth.uid() then recipient_id else sender_id end as other_id,
           body, created_at, sender_id = auth.uid() as from_me, read_at, recipient_id
    from public.direct_messages
    where sender_id = auth.uid() or recipient_id = auth.uid()
  )
  select distinct on (other_id) other_id, body, created_at, from_me,
         (select count(*)::int from mine m2 where m2.other_id = mine.other_id and m2.recipient_id = auth.uid() and m2.read_at is null)
  from mine
  order by other_id, created_at desc;
$$;

create or replace function public.mark_conversation_read(p_other uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.direct_messages set read_at = now()
  where recipient_id = auth.uid() and sender_id = p_other and read_at is null;
$$;

-- ---------- Topluluk (genel akış + yönetici duyuruları) ----------

create table if not exists public.community_posts (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid default auth.uid() references public.profiles (id) on delete set null,
  body            text not null default '' check (char_length(body) <= 4000),
  image_path      text,
  is_announcement boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint community_posts_not_empty check (char_length(trim(body)) > 0 or image_path is not null)
);

create index if not exists community_posts_created_idx on public.community_posts (created_at desc);

revoke all on public.community_posts from anon, authenticated;
grant select, insert, delete on public.community_posts to authenticated;
alter table public.community_posts enable row level security;

drop policy if exists "community: herkes okur" on public.community_posts;
create policy "community: herkes okur"
  on public.community_posts for select to authenticated using (true);
drop policy if exists "community: paylaşır (duyuru yalnızca yönetici)" on public.community_posts;
create policy "community: paylaşır (duyuru yalnızca yönetici)"
  on public.community_posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (not is_announcement or private.is_app_admin((select auth.uid())))
    and (image_path is null or split_part(image_path, '/', 1) = (select auth.uid())::text)
  );
drop policy if exists "community: kendi gönderisini ya da yönetici siler" on public.community_posts;
create policy "community: kendi gönderisini ya da yönetici siler"
  on public.community_posts for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_app_admin((select auth.uid())));

-- Duyuru → herkese bildirim
create or replace function private.on_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
begin
  if not new.is_announcement then return new; end if;
  for u in select id from auth.users where banned_until is null or banned_until < now() loop
    perform private.notify(u, 'announcement', '📢 Duyuru: ' || private.actor_name(), new.body, null, null);
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_announcement on public.community_posts;
create trigger notify_announcement after insert on public.community_posts
  for each row execute function private.on_announcement();

-- Görseller: 'community' bucket'ı, yol '<user_id>/<uuid>.<ext>'
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "community bucket: herkes okur" on storage.objects;
create policy "community bucket: herkes okur"
  on storage.objects for select to authenticated
  using (bucket_id = 'community');
drop policy if exists "community bucket: kendi klasörüne yükler" on storage.objects;
create policy "community bucket: kendi klasörüne yükler"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists "community bucket: sahibi ya da yönetici siler" on storage.objects;
create policy "community bucket: sahibi ya da yönetici siler"
  on storage.objects for delete to authenticated
  using (bucket_id = 'community'
         and (split_part(name, '/', 1) = (select auth.uid())::text or private.is_app_admin((select auth.uid()))));

-- ---------- Realtime ----------

do $$
declare
  t text;
begin
  foreach t in array array['notifications', 'direct_messages', 'community_posts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------- Performans (yalnızca yönetici) ----------
-- Görev = karta atanmış olmak. Tarihler 'Europe/Istanbul' gününe göre.

create or replace function public.admin_performance(p_from date default null, p_to date default null)
returns table (
  user_id uuid, full_name text, email text, avatar_color text,
  total int, completed int, open int, overdue int, upcoming int, no_due int,
  completed_on_time int, completed_late int, avg_completion_hours numeric,
  completion_pct int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  perform private.assert_app_admin();
  return query
  with t as (
    select ca.user_id, c.*
    from public.card_assignees ca
    join public.cards c on c.id = ca.card_id
    where (p_from is null or c.created_at >= p_from)
      and (p_to is null or c.created_at < p_to + 1)
  )
  select p.id, p.full_name, p.email, p.avatar_color,
    count(t.id)::int,
    count(t.id) filter (where t.due_complete)::int,
    count(t.id) filter (where not t.due_complete)::int,
    count(t.id) filter (where not t.due_complete and t.due_at < v_today)::int,
    count(t.id) filter (where not t.due_complete and t.due_at >= v_today)::int,
    count(t.id) filter (where not t.due_complete and t.due_at is null)::int,
    count(t.id) filter (where t.due_complete and t.due_at is not null and (t.completed_at at time zone 'Europe/Istanbul')::date <= t.due_at)::int,
    count(t.id) filter (where t.due_complete and t.due_at is not null and (t.completed_at at time zone 'Europe/Istanbul')::date > t.due_at)::int,
    round(avg(extract(epoch from (t.completed_at - t.created_at)) / 3600) filter (where t.due_complete and t.completed_at is not null)::numeric, 1),
    case when count(t.id) = 0 then 0 else round(100.0 * count(t.id) filter (where t.due_complete) / count(t.id))::int end
  from public.profiles p
  join auth.users u on u.id = p.id
  left join t on t.user_id = p.id
  group by p.id, p.full_name, p.email, p.avatar_color
  order by p.full_name;
end;
$$;

create or replace function public.admin_user_tasks(p_user_id uuid, p_from date default null, p_to date default null)
returns table (
  card_id uuid, title text, board_id uuid, board_name text, list_title text,
  created_at timestamptz, start_at date, due_at date, completed_at timestamptz, due_complete boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_app_admin();
  return query
  select c.id, c.title, b.id, b.name, l.title, c.created_at, c.start_at, c.due_at, c.completed_at, c.due_complete
  from public.card_assignees ca
  join public.cards c on c.id = ca.card_id
  join public.lists l on l.id = c.list_id
  join public.boards b on b.id = c.board_id
  where ca.user_id = p_user_id
    and (p_from is null or c.created_at >= p_from)
    and (p_to is null or c.created_at < p_to + 1)
  order by c.due_complete, coalesce(c.due_at, 'infinity'::date), c.created_at desc
  limit 500;
end;
$$;

-- ---------- Yetkiler ----------

revoke execute on function public.list_directory() from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.admin_performance(date, date) from public, anon;
revoke execute on function public.admin_user_tasks(uuid, date, date) from public, anon;
grant execute on function public.list_directory() to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.admin_performance(date, date) to authenticated;
grant execute on function public.admin_user_tasks(uuid, date, date) to authenticated;
