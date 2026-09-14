-- ============================================================
-- REALTIME — Anlık senkron için tabloları yayına ekle
-- ============================================================
-- Supabase Realtime, `supabase_realtime` yayınındaki tabloların
-- değişikliklerini WebSocket ile istemcilere iletir. INSERT/UPDATE
-- olayları RLS'e göre süzülür: kullanıcı yalnızca görebildiği satırların
-- değişikliğini alır. DELETE olaylarında sadece birincil anahtar gelir.
-- Tekrar çalıştırılabilir: zaten ekli tabloları atlar.
-- ============================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'boards', 'board_members', 'labels', 'lists', 'cards',
    'card_labels', 'card_assignees', 'checklist_items', 'comments', 'attachments'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
