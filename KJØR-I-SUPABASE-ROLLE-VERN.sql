-- =====================================================================
-- ROLLE-VERN – kritisk sikkerhetsrettelse (QA november 2026)
--
-- Problem: RLS-policyen profiles_self_update (0001_init.sql) lar enhver
-- innlogget bruker oppdatere SIN EGEN profil-rad – uten å begrense hvilke
-- kolonner. En barber, kasse-iPad eller revisor kunne dermed sette
-- profiles.role = 'admin' på seg selv direkte mot Supabase API-et og få
-- full admin-tilgang.
--
-- Rettelse:
--   1) Trigger som stopper endring av profiles.role med mindre den som
--      endrer er admin/eier (is_admin()) eller serveren (service role /
--      SQL Editor). «Min profil» (navn + telefon) virker som før.
--   2) Policyen får WITH CHECK, så en bruker ikke kan flytte raden sin
--      til en annen id.
--
-- Trygg å kjøre flere ganger. Ingen data endres.
--
-- ETTERPÅ (manuelt):
--   a) Sjekk at ingen har skaffet seg admin/eier uten grunn:
--        select id, email, role from profiles where role::text in ('admin','eier');
--   b) Supabase → Authentication → Sign In / Providers: slå AV
--      «Allow new users to sign up» hvis den er på (ansatte opprettes av admin).
-- =====================================================================

create or replace function profiles_guard_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                              (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'));
begin
  if new.role is distinct from old.role then
    -- Serveren (service role) og SQL Editor (ingen JWT) får lov.
    if v_jwt_role = 'service_role' or v_jwt_role is null then
      return new;
    end if;
    -- Ellers bare admin/eier.
    if not is_admin() then
      raise exception 'Du har ikke lov til å endre rolle.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

revoke all on function profiles_guard_role() from public, anon;

drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role
  before update on profiles
  for each row execute function profiles_guard_role();

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

notify pgrst, 'reload schema';
