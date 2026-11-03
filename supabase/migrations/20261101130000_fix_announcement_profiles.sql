-- ============================================================
-- Duyuru bildirimi: yalnızca profili olan (askıda olmayan) kullanıcılar
-- + profil trigger'ından önce açılmış hesaplara profil satırı aç
-- ============================================================

create or replace function private.on_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
begin
  if not new.is_announcement then return new; end if;
  for u in
    select p.id from public.profiles p join auth.users au on au.id = p.id
    where au.banned_until is null or au.banned_until < now()
  loop
    perform private.notify(u, 'announcement', '📢 Duyuru: ' || private.actor_name(), new.body, null, null);
  end loop;
  return new;
end;
$$;

insert into public.profiles (id, email, full_name)
select u.id, coalesce(u.email, ''), split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;
