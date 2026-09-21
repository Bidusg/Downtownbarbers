-- =====================================================================
-- 0051 — LEGG TIL «eier» I ROLLE-ENUMET (user_role)
--
--   profiles.role er en Postgres-ENUM (user_role), ikke fri tekst. Den må
--   utvides FØR noen funksjon/policy kan lagre eller sammenligne mot 'eier'
--   (samme som da 'revisor' ble tatt i bruk).
--
--   ADD VALUE IF NOT EXISTS er idempotent. Kjør denne linja ALENE først (eller
--   som første setning) – en ny enum-verdi kan ikke BRUKES i samme transaksjon
--   som den legges til. 0052 unngår dette ved å sammenligne på role::text, så
--   det er uansett trygt om hele skriptet limes inn samlet.
-- =====================================================================

alter type user_role add value if not exists 'eier';
