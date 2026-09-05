-- =====================================================================
-- 0018 – Fikser PIN-lagring (pgcrypto ligger i schema "extensions" på Supabase)
--   set_staff_pin / verify_pin_status / record_shift_event bruker
--   crypt()/gen_salt() fra pgcrypto. Funksjonene hadde search_path = public,
--   men Supabase installerer pgcrypto i schemaet "extensions", så crypt/
--   gen_salt ble ikke funnet → "Kunne ikke lagre PIN.".
--   Vi legger "extensions" på søkestien for de tre funksjonene.
-- Idempotent.
-- =====================================================================

-- Sørg for at pgcrypto finnes (uansett schema).
create extension if not exists pgcrypto;

alter function set_staff_pin(uuid, text)        set search_path = public, extensions;
alter function verify_pin_status(uuid, text)    set search_path = public, extensions;
alter function record_shift_event(uuid, text, text) set search_path = public, extensions;
