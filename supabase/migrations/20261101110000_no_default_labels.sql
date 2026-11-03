-- ============================================================
-- Hazır etiket yok: board'lar etiketsiz açılır, etiketleri ekip oluşturur
-- ============================================================
-- Mevcut board'lardan, hiçbir kartta kullanılmayan hazır etiketler
-- (iki eski varsayılan set) temizlenir. Kullanılan ya da elle
-- oluşturulmuş etiketlere dokunulmaz.
-- ============================================================

create or replace function private.handle_new_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.board_members (board_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

delete from public.labels l
where (l.name, l.color) in (
    -- ilk varsayılan set
    ('Tasarım', '#8b5cf6'), ('Acil', '#f43f5e'), ('Backend', '#6366f1'),
    ('Araştırma', '#f59e0b'), ('Pazarlama', '#0ea5a3'), ('Hata', '#ef4444'),
    -- ikinci varsayılan set
    ('Geliştirme', '#6366f1'), ('İyileştirme', '#10b981'), ('Acil', '#f97316'),
    ('Dokümantasyon', '#64748b')
  )
  and not exists (select 1 from public.card_labels cl where cl.label_id = l.id);
