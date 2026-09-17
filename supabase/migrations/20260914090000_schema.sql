-- ============================================================
-- SCHEMA — Sprintdesk tabloları
-- ============================================================
-- Hiyerarşi: boards → lists → cards → (checklist_items, comments, attachments)
-- Yetki board_members üzerinden işler (bkz. 20260914090100_rls.sql).
-- Tarihler ön yüzdeki gibi saat dilimsiz 'YYYY-MM-DD' → `date` tipi.
-- Sıralama `position` (double precision) ile yapılır: araya ekleme için
-- iki komşunun ortalaması verilir, boş bırakılırsa sona eklenir.
-- ============================================================

create schema if not exists private;

-- ---------- Ortak trigger fonksiyonları ----------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- profiles: auth.users'ın herkese açık yüzü ----------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  avatar_color text not null default '#6366f1',
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index profiles_email_lower_idx on public.profiles (lower(email));

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Yeni kayıt olan her kullanıcı için profil satırı aç
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  palette text[] := array['#6366f1', '#8b5cf6', '#0ea5a3', '#f59e0b', '#f43f5e', '#10b981', '#3b82f6'];
begin
  insert into public.profiles (id, email, full_name, avatar_color)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    palette[1 + floor(random() * array_length(palette, 1))::int]
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- E-posta değişince profili de güncelle
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ---------- boards ----------

create table public.boards (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 120),
  color      text not null default '#6366f1',
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index boards_created_by_idx on public.boards (created_by);

create trigger boards_updated_at
  before update on public.boards
  for each row execute function private.set_updated_at();

-- ---------- board_members ----------
-- owner : board'u silebilir, her şeyi yönetir (board başına bir tane)
-- admin : üye ekler/çıkarır, board ayarlarını değiştirir
-- member: liste/kart/alt görev/yorum/ek üzerinde tam yetki
-- viewer: sadece okur

create type public.board_role as enum ('owner', 'admin', 'member', 'viewer');

create table public.board_members (
  board_id   uuid not null references public.boards (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.board_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index board_members_user_idx on public.board_members (user_id);
create unique index board_members_one_owner_idx on public.board_members (board_id) where role = 'owner';

-- ---------- labels (board başına) ----------

create table public.labels (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  name       text not null default '',
  color      text not null,
  created_at timestamptz not null default now()
);

create index labels_board_idx on public.labels (board_id);

-- Board açılınca: oluşturanı owner yap, varsayılan etiketleri ekle
create or replace function private.handle_new_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.board_members (board_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  insert into public.labels (board_id, name, color) values
    (new.id, 'Tasarım',   '#8b5cf6'),
    (new.id, 'Acil',      '#f43f5e'),
    (new.id, 'Backend',   '#6366f1'),
    (new.id, 'Araştırma', '#f59e0b'),
    (new.id, 'Pazarlama', '#0ea5a3'),
    (new.id, 'Hata',      '#ef4444');
  return new;
end;
$$;

create trigger on_board_created
  after insert on public.boards
  for each row execute function private.handle_new_board();

-- ---------- lists ----------

create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 120),
  position   double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lists_board_position_idx on public.lists (board_id, position);

create trigger lists_updated_at
  before update on public.lists
  for each row execute function private.set_updated_at();

create or replace function private.lists_default_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(position), 0) + 1024 into new.position
    from public.lists where board_id = new.board_id;
  end if;
  return new;
end;
$$;

create trigger lists_default_position
  before insert on public.lists
  for each row execute function private.lists_default_position();

-- ---------- cards ----------
-- board_id, list_id'den trigger ile türetilir (RLS ve realtime filtresi için)

create table public.cards (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.boards (id) on delete cascade,
  list_id       uuid not null references public.lists (id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 1 and 500),
  description   text not null default '',
  color         text,
  position      double precision not null,
  start_at      date,
  due_at        date,
  due_complete  boolean not null default false,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cards_dates_order check (start_at is null or due_at is null or start_at <= due_at)
);

create index cards_list_position_idx on public.cards (list_id, position);
create index cards_board_idx on public.cards (board_id);

create trigger cards_updated_at
  before update on public.cards
  for each row execute function private.set_updated_at();

create or replace function private.cards_sync_board()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.list_id is distinct from old.list_id then
    select board_id into new.board_id from public.lists where id = new.list_id;
    if new.board_id is null then
      raise exception 'Liste bulunamadı: %', new.list_id using errcode = 'foreign_key_violation';
    end if;
  else
    new.board_id := old.board_id;
  end if;

  if new.position is null then
    select coalesce(max(position), 0) + 1024 into new.position
    from public.cards where list_id = new.list_id;
  end if;
  return new;
end;
$$;

create trigger cards_sync_board
  before insert or update on public.cards
  for each row execute function private.cards_sync_board();

-- ---------- card_labels / card_assignees ----------

create table public.card_labels (
  card_id  uuid not null references public.cards (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (card_id, label_id)
);

create index card_labels_label_idx on public.card_labels (label_id);

create table public.card_assignees (
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (card_id, user_id)
);

create index card_assignees_user_idx on public.card_assignees (user_id);

-- ---------- checklist_items (alt görevler) ----------

create table public.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.cards (id) on delete cascade,
  text        text not null check (char_length(trim(text)) between 1 and 500),
  done        boolean not null default false,
  position    double precision not null,
  start_at    date,
  due_at      date,
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint checklist_dates_order check (start_at is null or due_at is null or start_at <= due_at)
);

create index checklist_items_card_position_idx on public.checklist_items (card_id, position);
create index checklist_items_assignee_idx on public.checklist_items (assignee_id);

create trigger checklist_items_updated_at
  before update on public.checklist_items
  for each row execute function private.set_updated_at();

create or replace function private.checklist_default_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(position), 0) + 1024 into new.position
    from public.checklist_items where card_id = new.card_id;
  end if;
  return new;
end;
$$;

create trigger checklist_default_position
  before insert on public.checklist_items
  for each row execute function private.checklist_default_position();

-- ---------- comments ----------

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards (id) on delete cascade,
  author_id  uuid default auth.uid() references public.profiles (id) on delete set null,
  body       text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_card_created_idx on public.comments (card_id, created_at desc);

create trigger comments_updated_at
  before update on public.comments
  for each row execute function private.set_updated_at();

-- ---------- attachments (içerik Storage'da, burada metadata) ----------
-- storage_path: '<board_id>/<card_id>/<uuid>-<dosya adı>' ('attachments' bucket'ı)

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.cards (id) on delete cascade,
  storage_path text not null unique,
  name         text not null,
  mime         text not null default '',
  size         bigint not null check (size >= 0 and size <= 26214400),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index attachments_card_idx on public.attachments (card_id);
