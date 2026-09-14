-- ============================================================
-- AUTO CONFIRM — E-posta doğrulamasını veritabanı tarafında atla
-- ============================================================
-- Sunucuda SMTP ayarlı olmadığı için doğrulama mailleri ulaşmıyor ve
-- kayıt olan kimse giriş yapamıyor. Bu trigger yeni kullanıcıyı kayıt
-- anında doğrulanmış işaretler; sunucu ayarına (ENABLE_EMAIL_AUTOCONFIRM)
-- erişim gerektirmez.
--
-- RİSK: E-posta sahipliği kanıtlanmaz; biri başkasının adresiyle kayıt
-- olabilir. SMTP düzeltilince bu trigger kaldırılmalı:
--   drop trigger if exists auto_confirm_email on auth.users;
-- ============================================================

create or replace function private.auto_confirm_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists auto_confirm_email on auth.users;
create trigger auto_confirm_email
  before insert on auth.users
  for each row execute function private.auto_confirm_email();

-- Mail beklerken takılı kalmış mevcut kullanıcıları da doğrula
update auth.users
set email_confirmed_at = now()
where email is not null and email_confirmed_at is null;
