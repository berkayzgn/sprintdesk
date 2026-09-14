-- ============================================================
-- STORAGE — Kart ekleri ('attachments' bucket'ı)
-- ============================================================
-- Dosya yolu: '<board_id>/<card_id>/<uuid>-<dosya adı>'
-- Bucket gizli (public değil): görüntülemek için createSignedUrl kullanılır.
-- Yetki, yolun ilk klasöründeki board_id'ye göre verilir.
-- Not: attachments satırı silinince dosya otomatik silinmez; istemci
-- önce storage.remove(), sonra satırı siler.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400) -- 25 MB, ön yüzdeki MAX_FILE_BYTES ile aynı
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Yolun ilk parçasını güvenli şekilde uuid'ye çevirir (geçersizse null)
create or replace function private.object_board_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

grant execute on function private.object_board_id(text) to authenticated;

create policy "attachments bucket: üyeler okur"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and private.is_board_member(private.object_board_id(name))
  );

create policy "attachments bucket: member+ yükler"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and private.can_edit_board(private.object_board_id(name))
  );

create policy "attachments bucket: member+ siler"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and private.can_edit_board(private.object_board_id(name))
  );
