-- Not görselleri: 'notes' bucket'ı, yol '<user_id>/<uuid>.<ext>'. 5 MB, yalnızca görsel.
-- Paylaşılan notlarda alıcı da görebilsin diye okuma tüm giriş yapmış kullanıcılara açık
-- (yol tahmin edilemez uuid); yazma/silme yalnızca sahibine.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "notes bucket: okur" on storage.objects;
create policy "notes bucket: okur" on storage.objects for select to authenticated using (bucket_id = 'notes');
drop policy if exists "notes bucket: kendi klasörüne yükler" on storage.objects;
create policy "notes bucket: kendi klasörüne yükler" on storage.objects for insert to authenticated
  with check (bucket_id = 'notes' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists "notes bucket: sahibi siler" on storage.objects;
create policy "notes bucket: sahibi siler" on storage.objects for delete to authenticated
  using (bucket_id = 'notes' and split_part(name, '/', 1) = (select auth.uid())::text);
