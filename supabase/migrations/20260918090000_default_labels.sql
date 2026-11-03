-- ============================================================
-- Varsayılan etiketler: departman adları yerine iş türleri
-- ============================================================
-- Yalnızca yeni açılan board'ları etkiler; mevcut board'ların
-- etiketlerine (ve kartlara atanmış hallerine) dokunulmaz.
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

  insert into public.labels (board_id, name, color) values
    (new.id, 'Hata',          '#ef4444'),
    (new.id, 'Geliştirme',    '#6366f1'),
    (new.id, 'İyileştirme',   '#10b981'),
    (new.id, 'Acil',          '#f97316'),
    (new.id, 'Araştırma',     '#f59e0b'),
    (new.id, 'Dokümantasyon', '#64748b');
  return new;
end;
$$;
