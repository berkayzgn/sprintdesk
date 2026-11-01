-- Notlara başlık (gövde artık zengin metin/HTML; istemci DOMPurify ile temizler)
alter table public.notes add column if not exists title text not null default '';
alter table public.notes drop constraint if exists notes_title_len;
alter table public.notes add constraint notes_title_len check (char_length(title) <= 200);
