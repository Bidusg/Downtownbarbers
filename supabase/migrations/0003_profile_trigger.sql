-- =====================================================================
-- Auto-opprett profil når en auth-bruker lages, + hjelp for roller.
-- =====================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, role)
  values (new.id, new.email, 'customer')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Sett rolle for eksisterende brukere slik (kjør etter at brukerne er opprettet i Auth):
--   update profiles set role = 'admin' where email = 'din-admin@epost.no';
--   update profiles set role = 'shop'  where email = 'shop@downtownbarbers.no';
