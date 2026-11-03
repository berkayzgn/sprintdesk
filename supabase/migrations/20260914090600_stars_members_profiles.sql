-- ============================================================
-- STARS / MEMBERS / PROFILES — Yıldızlı board'lar, üye çıkarma
-- temizliği, profil değişikliklerinin anlık yansıması
-- ============================================================

-- ---------- board_stars: kullanıcıya özel yıldızlı board'lar ----------

create table public.board_stars (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  board_id   uuid not null references public.boards (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, board_id)
);

create index board_stars_board_idx on public.board_stars (board_id);

revoke all on public.board_stars from anon, authenticated;
grant select, insert, delete on public.board_stars to authenticated;
alter table public.board_stars enable row level security;

create policy "board_stars: herkes sadece kendi yıldızlarını görür"
  on public.board_stars for select to authenticated
  using (user_id = (select auth.uid()));

create policy "board_stars: üyesi olduğu board'u yıldızlar"
  on public.board_stars for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_board_member(board_id));

create policy "board_stars: kendi yıldızını kaldırır"
  on public.board_stars for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Üye board'dan çıkınca o board'daki atamaları temizle ----------
-- Aksi halde kartlarda artık göremediği biri "Bilinmeyen" olarak kalırdı

create or replace function private.handle_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.card_assignees ca
  using public.cards c
  where ca.card_id = c.id and c.board_id = old.board_id and ca.user_id = old.user_id;

  update public.checklist_items ci
  set assignee_id = null
  from public.cards c
  where ci.card_id = c.id and c.board_id = old.board_id and ci.assignee_id = old.user_id;

  delete from public.board_stars where board_id = old.board_id and user_id = old.user_id;
  return old;
end;
$$;

create trigger on_board_member_removed
  after delete on public.board_members
  for each row execute function private.handle_member_removed();

-- ---------- Profil adı/rengi değişince board arkadaşlarına anında yansısın ----------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
