-- ============================================================
-- RLS — Satır seviyesi yetki kuralları
-- ============================================================
-- Kural: bir kullanıcı yalnızca üyesi olduğu board'ların verisini görür.
--   viewer  → okur
--   member+ → liste/kart/alt görev/yorum/ek yazar
--   admin+  → board ayarları ve üyeler
--   owner   → board'u siler
-- Yardımcı fonksiyonlar `private` şemasında: Data API'ye açılmazlar ve
-- security definer oldukları için board_members politikasında sonsuz
-- döngüye girmezler.
-- ============================================================

grant usage on schema private to authenticated;

-- ---------- Yardımcı fonksiyonlar ----------

create or replace function private.board_role(p_board_id uuid)
returns public.board_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.board_members
  where board_id = p_board_id and user_id = (select auth.uid());
$$;

create or replace function private.is_board_member(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.board_role(p_board_id) is not null;
$$;

create or replace function private.can_edit_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.board_role(p_board_id) in ('owner', 'admin', 'member'), false);
$$;

create or replace function private.can_admin_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.board_role(p_board_id) in ('owner', 'admin'), false);
$$;

create or replace function private.card_board(p_card_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select board_id from public.cards where id = p_card_id;
$$;

-- İki kullanıcı en az bir board'u paylaşıyor mu? (profil görünürlüğü)
create or replace function private.shares_board_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members me
    join public.board_members other on other.board_id = me.board_id
    where me.user_id = (select auth.uid()) and other.user_id = p_user_id
  );
$$;

grant execute on all functions in schema private to authenticated;

-- ---------- Tablo yetkileri ----------
-- Supabase varsayılan olarak tüm yetkileri verir; önce sıfırla, sonra
-- sadece gerekenleri aç. anon (giriş yapmamış) hiçbir tabloya erişemez.

revoke all on
  public.profiles, public.boards, public.board_members, public.labels, public.lists,
  public.cards, public.card_labels, public.card_assignees, public.checklist_items,
  public.comments, public.attachments
from anon, authenticated;

grant select, insert, update, delete on
  public.boards, public.board_members, public.labels, public.lists,
  public.cards, public.card_labels, public.card_assignees, public.checklist_items,
  public.comments, public.attachments
to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_color, avatar_url) on public.profiles to authenticated;

alter table public.profiles        enable row level security;
alter table public.boards          enable row level security;
alter table public.board_members   enable row level security;
alter table public.labels          enable row level security;
alter table public.lists           enable row level security;
alter table public.cards           enable row level security;
alter table public.card_labels     enable row level security;
alter table public.card_assignees  enable row level security;
alter table public.checklist_items enable row level security;
alter table public.comments        enable row level security;
alter table public.attachments     enable row level security;

-- ---------- profiles ----------

create policy "profiles: kendisi ve board arkadaşları görür"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_board_with(id));

create policy "profiles: sadece kendini günceller"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------- boards ----------

-- created_by koşulu: insert ... returning anında owner satırı henüz
-- trigger'la eklenmemiş olabilir
create policy "boards: üyeler görür"
  on public.boards for select to authenticated
  using (created_by = (select auth.uid()) or private.is_board_member(id));

create policy "boards: giriş yapan herkes oluşturur"
  on public.boards for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "boards: admin+ günceller"
  on public.boards for update to authenticated
  using (private.can_admin_board(id))
  with check (private.can_admin_board(id));

create policy "boards: sadece owner siler"
  on public.boards for delete to authenticated
  using (private.board_role(id) = 'owner');

-- ---------- board_members ----------
-- Üye ekleme e-posta ile public.add_board_member() RPC'si üzerinden yapılır.
-- owner satırına admin dokunamaz; owner devri ayrı bir akış olacak.

create policy "board_members: board üyeleri görür"
  on public.board_members for select to authenticated
  using (private.is_board_member(board_id));

create policy "board_members: admin+ ekler (owner hariç)"
  on public.board_members for insert to authenticated
  with check (private.can_admin_board(board_id) and role <> 'owner');

create policy "board_members: admin+ rol değiştirir (owner hariç)"
  on public.board_members for update to authenticated
  using (private.can_admin_board(board_id) and role <> 'owner')
  with check (private.can_admin_board(board_id) and role <> 'owner');

create policy "board_members: admin+ çıkarır, herkes kendisi ayrılır (owner hariç)"
  on public.board_members for delete to authenticated
  using (
    role <> 'owner'
    and (private.can_admin_board(board_id) or user_id = (select auth.uid()))
  );

-- ---------- labels ----------

create policy "labels: üyeler görür"
  on public.labels for select to authenticated
  using (private.is_board_member(board_id));

create policy "labels: member+ ekler"
  on public.labels for insert to authenticated
  with check (private.can_edit_board(board_id));

create policy "labels: member+ günceller"
  on public.labels for update to authenticated
  using (private.can_edit_board(board_id))
  with check (private.can_edit_board(board_id));

create policy "labels: member+ siler"
  on public.labels for delete to authenticated
  using (private.can_edit_board(board_id));

-- ---------- lists ----------

create policy "lists: üyeler görür"
  on public.lists for select to authenticated
  using (private.is_board_member(board_id));

create policy "lists: member+ ekler"
  on public.lists for insert to authenticated
  with check (private.can_edit_board(board_id));

create policy "lists: member+ günceller"
  on public.lists for update to authenticated
  using (private.can_edit_board(board_id))
  with check (private.can_edit_board(board_id));

create policy "lists: member+ siler"
  on public.lists for delete to authenticated
  using (private.can_edit_board(board_id));

-- ---------- cards ----------
-- board_id trigger ile list_id'den gelir; with check yeni board'a bakar
-- (başka board'a taşımada iki tarafta da yetki gerekir)

create policy "cards: üyeler görür"
  on public.cards for select to authenticated
  using (private.is_board_member(board_id));

create policy "cards: member+ ekler"
  on public.cards for insert to authenticated
  with check (private.can_edit_board(board_id));

create policy "cards: member+ günceller"
  on public.cards for update to authenticated
  using (private.can_edit_board(board_id))
  with check (private.can_edit_board(board_id));

create policy "cards: member+ siler"
  on public.cards for delete to authenticated
  using (private.can_edit_board(board_id));

-- ---------- card_labels ----------

create policy "card_labels: üyeler görür"
  on public.card_labels for select to authenticated
  using (private.is_board_member(private.card_board(card_id)));

create policy "card_labels: member+ ekler (aynı board'un etiketi)"
  on public.card_labels for insert to authenticated
  with check (
    private.can_edit_board(private.card_board(card_id))
    and exists (
      select 1 from public.labels l
      where l.id = label_id and l.board_id = private.card_board(card_id)
    )
  );

create policy "card_labels: member+ siler"
  on public.card_labels for delete to authenticated
  using (private.can_edit_board(private.card_board(card_id)));

-- ---------- card_assignees ----------

create policy "card_assignees: üyeler görür"
  on public.card_assignees for select to authenticated
  using (private.is_board_member(private.card_board(card_id)));

create policy "card_assignees: member+ board üyesini atar"
  on public.card_assignees for insert to authenticated
  with check (
    private.can_edit_board(private.card_board(card_id))
    and exists (
      select 1 from public.board_members bm
      where bm.board_id = private.card_board(card_id) and bm.user_id = card_assignees.user_id
    )
  );

create policy "card_assignees: member+ siler"
  on public.card_assignees for delete to authenticated
  using (private.can_edit_board(private.card_board(card_id)));

-- ---------- checklist_items ----------

create policy "checklist_items: üyeler görür"
  on public.checklist_items for select to authenticated
  using (private.is_board_member(private.card_board(card_id)));

create policy "checklist_items: member+ ekler"
  on public.checklist_items for insert to authenticated
  with check (private.can_edit_board(private.card_board(card_id)));

create policy "checklist_items: member+ günceller"
  on public.checklist_items for update to authenticated
  using (private.can_edit_board(private.card_board(card_id)))
  with check (private.can_edit_board(private.card_board(card_id)));

create policy "checklist_items: member+ siler"
  on public.checklist_items for delete to authenticated
  using (private.can_edit_board(private.card_board(card_id)));

-- ---------- comments ----------

create policy "comments: üyeler görür"
  on public.comments for select to authenticated
  using (private.is_board_member(private.card_board(card_id)));

create policy "comments: member+ kendi adına yazar"
  on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.can_edit_board(private.card_board(card_id))
  );

create policy "comments: sadece yazarı düzenler"
  on public.comments for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and private.is_board_member(private.card_board(card_id)));

create policy "comments: yazarı veya admin+ siler"
  on public.comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or private.can_admin_board(private.card_board(card_id))
  );

-- ---------- attachments ----------

create policy "attachments: üyeler görür"
  on public.attachments for select to authenticated
  using (private.is_board_member(private.card_board(card_id)));

create policy "attachments: member+ ekler"
  on public.attachments for insert to authenticated
  with check (private.can_edit_board(private.card_board(card_id)));

create policy "attachments: member+ siler"
  on public.attachments for delete to authenticated
  using (private.can_edit_board(private.card_board(card_id)));

-- ---------- RPC: e-posta ile board'a üye ekle ----------
-- profiles tablosu herkese açık olmadığı için e-posta araması burada,
-- yetki kontrolüyle birlikte yapılır.

create or replace function public.add_board_member(
  p_board_id uuid,
  p_email text,
  p_role public.board_role default 'member'
)
returns public.board_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row public.board_members;
begin
  if not private.can_admin_board(p_board_id) then
    raise exception 'Bu board''a üye ekleme yetkin yok' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'Owner rolü bu yolla verilemez' using errcode = '22023';
  end if;

  select id into v_user_id from public.profiles where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception 'Bu e-postayla kayıtlı kullanıcı yok' using errcode = 'P0002';
  end if;

  insert into public.board_members (board_id, user_id, role)
  values (p_board_id, v_user_id, p_role)
  on conflict (board_id, user_id) do nothing
  returning * into v_row;

  if v_row is null then
    select * into v_row from public.board_members
    where board_id = p_board_id and user_id = v_user_id;
  end if;
  return v_row;
end;
$$;

revoke execute on function public.add_board_member(uuid, text, public.board_role) from public, anon;
grant execute on function public.add_board_member(uuid, text, public.board_role) to authenticated;
