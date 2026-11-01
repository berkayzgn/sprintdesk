-- ============================================================
-- CALENDAR & NOTES — Takvim etkinlikleri (toplantı vb.) ve hızlı notlar
-- ============================================================
-- Etkinlik: katılımcı listesi boşsa herkese açık (ofis geneli), doluysa
-- yalnızca oluşturan + katılımcılar görür. Katılımcılara bildirim gider.
-- Not: yalnızca sahibi görür; 20000 karakter sınırı.
-- ============================================================

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(trim(title)) between 1 and 200),
  description  text not null default '' check (char_length(description) <= 4000),
  location     text not null default '' check (char_length(location) <= 300),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  all_day      boolean not null default false,
  color        text not null default '#6366f1' check (color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'),
  attendee_ids uuid[] not null default '{}',
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint events_order check (ends_at >= starts_at),
  constraint events_attendees_max check (cardinality(attendee_ids) <= 200)
);

create index if not exists events_starts_idx on public.events (starts_at);
create index if not exists events_attendees_idx on public.events using gin (attendee_ids);

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events
  for each row execute function private.set_updated_at();

revoke all on public.events from anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;
alter table public.events enable row level security;

drop policy if exists "events: herkese açık ya da katılımcı" on public.events;
create policy "events: herkese açık ya da katılımcı"
  on public.events for select to authenticated
  using (cardinality(attendee_ids) = 0 or created_by = (select auth.uid()) or (select auth.uid()) = any (attendee_ids));
drop policy if exists "events: oluşturur" on public.events;
create policy "events: oluşturur"
  on public.events for insert to authenticated
  with check (created_by = (select auth.uid()));
drop policy if exists "events: sahibi ya da yönetici düzenler" on public.events;
create policy "events: sahibi ya da yönetici düzenler"
  on public.events for update to authenticated
  using (created_by = (select auth.uid()) or private.is_app_admin((select auth.uid())))
  with check (true);
drop policy if exists "events: sahibi ya da yönetici siler" on public.events;
create policy "events: sahibi ya da yönetici siler"
  on public.events for delete to authenticated
  using (created_by = (select auth.uid()) or private.is_app_admin((select auth.uid())));

-- Katılımcılara bildirim (yeni eklenenlere)
create or replace function private.on_event_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
  v_when text := to_char(new.starts_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
begin
  for u in
    select x from unnest(new.attendee_ids) x
    where tg_op = 'INSERT' or not (x = any (old.attendee_ids))
  loop
    perform private.notify(u, 'event', private.actor_name() || ' seni bir etkinliğe ekledi', new.title || ' · ' || v_when, null, null);
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_event on public.events;
create trigger notify_event after insert or update of attendee_ids on public.events
  for each row execute function private.on_event_saved();

-- ---------- Hızlı notlar ----------

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 20000),
  color      text not null default '#fef08a' check (color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_idx on public.notes (user_id, pinned desc, updated_at desc);

drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at before update on public.notes
  for each row execute function private.set_updated_at();

revoke all on public.notes from anon, authenticated;
grant select, insert, update, delete on public.notes to authenticated;
alter table public.notes enable row level security;

drop policy if exists "notes: yalnızca sahibi" on public.notes;
create policy "notes: yalnızca sahibi"
  on public.notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Not sayısı sınırı (tablo şişmesin)
create or replace function private.notes_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.notes where user_id = new.user_id) >= 500 then
    raise exception 'En fazla 500 not tutabilirsin; eskileri sil' using errcode = '54000';
  end if;
  return new;
end;
$$;
drop trigger if exists notes_limit on public.notes;
create trigger notes_limit before insert on public.notes
  for each row execute function private.notes_limit();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end;
$$;
