-- =====================================================================
-- 0067 – FIKS PIN-LAGRING (pgcrypto / gen_salt)
--
--   Feil i admin ved «Sett PIN»:
--     "Kunne ikke lagre PIN: function gen_salt(unknown) does not exist"
--
--   Årsak: set_staff_pin bruker crypt()/gen_salt() fra pgcrypto. På Supabase
--   ligger pgcrypto i schemaet "extensions", ikke "public". Funksjonen fant
--   dem derfor ikke. 0018 fikset dette, men er tydeligvis ikke kjørt i dette
--   Supabase-prosjektet – så vi sikrer det her på nytt (idempotent).
--
--   Kjør denne i Supabase (SQL-editor) og PIN-lagring virker.
-- =====================================================================

-- 1) Sørg for at pgcrypto er installert (uansett hvilket schema det havner i).
create extension if not exists pgcrypto;

-- 2) Legg "extensions" på søkestien til funksjonene som bruker crypt/gen_salt,
--    slik at de finner funksjonene uansett schema.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_staff_pin') then
    execute 'alter function set_staff_pin(uuid, text) set search_path = public, extensions';
  end if;
  if exists (select 1 from pg_proc where proname = 'verify_pin_status') then
    execute 'alter function verify_pin_status(uuid, text) set search_path = public, extensions';
  end if;
  if exists (select 1 from pg_proc where proname = 'record_shift_event') then
    execute 'alter function record_shift_event(uuid, text, text) set search_path = public, extensions';
  end if;
end $$;
