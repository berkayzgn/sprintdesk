-- ============================================================
-- Renk alanlarına format kısıtı
-- ============================================================
-- Renkler istemcide style="" içine basılıyor. API üzerinden serbest metin
-- yazılabildiği için sadece hex renklere izin veriyoruz. `not valid`:
-- mevcut satırları taramaz (eski veri migration'ı kırmasın), yeni
-- insert/update'lerde kural uygulanır.
-- ============================================================

alter table public.profiles
  add constraint profiles_avatar_color_hex
  check (avatar_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$') not valid;

alter table public.boards
  add constraint boards_color_hex
  check (color ~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$') not valid;

alter table public.labels
  add constraint labels_color_hex
  check (color ~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$') not valid;

alter table public.cards
  add constraint cards_color_hex
  check (color is null or color ~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$') not valid;
