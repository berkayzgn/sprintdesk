-- ============================================================
-- DELETE ACCOUNT — Kullanıcının kendi hesabını kalıcı olarak silmesi
-- ============================================================
-- Sahibi olunan board'lar:
--   • başka üye yoksa → board (listeler, kartlar…) silinir
--   • başka üye varsa → sahiplik devredilir (önce admin, sonra member,
--     sonra viewer; aynı rolde en eski üye)
-- Ortak board'lardaki yorum/kart/alt görevler kalır; yazar/atanan alanları
-- null olur ("Bilinmeyen"). Kart atamaları ve üyelikler silinir.
-- Storage dosyaları SQL'den silinemediği için, silinecek board'ların
-- dosyalarını istemci bu fonksiyonu çağırmadan önce kaldırır.
-- ============================================================

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_board_id uuid;
  v_heir uuid;
  v_deleted int := 0;
  v_transferred int := 0;
begin
  if v_uid is null then
    raise exception 'Hesap silmek için giriş yapmalısın' using errcode = '42501';
  end if;

  for v_board_id in
    select board_id from public.board_members where user_id = v_uid and role = 'owner'
  loop
    select user_id into v_heir
    from public.board_members
    where board_id = v_board_id and user_id <> v_uid
    order by case role when 'admin' then 0 when 'member' then 1 else 2 end, created_at
    limit 1;

    if v_heir is null then
      delete from public.boards where id = v_board_id;
      v_deleted := v_deleted + 1;
    else
      -- Board başına tek owner kuralı: önce eski owner satırı gider
      delete from public.board_members where board_id = v_board_id and user_id = v_uid;
      update public.board_members set role = 'owner' where board_id = v_board_id and user_id = v_heir;
      v_transferred := v_transferred + 1;
    end if;
  end loop;

  -- boards.created_by profili cascade ile silinince board da silinirdi:
  -- oluşturan olarak mevcut owner'ı yaz
  update public.boards b
  set created_by = bm.user_id
  from public.board_members bm
  where b.created_by = v_uid and bm.board_id = b.id and bm.role = 'owner';

  -- profiles, board_members, card_assignees, oturumlar cascade ile silinir
  delete from auth.users where id = v_uid;

  return jsonb_build_object('deleted_boards', v_deleted, 'transferred_boards', v_transferred);
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
