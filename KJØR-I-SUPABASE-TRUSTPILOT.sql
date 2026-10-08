-- =====================================================================
-- TRUSTPILOT – fjerde omdømmekilde (ved siden av Google + TripAdvisor)
--
--   Legger til nøkkel + Business Unit-ID for Trustpilot i review_config,
--   på nøyaktig samme måte som Google og TripAdvisor. Nøklene er hemmelige,
--   så tabellen er fortsatt KUN admin (RLS uendret). Server-koden leser via
--   service-role; mangler verdiene, faller den tilbake til env-variablene
--   (TRUSTPILOT_API_KEY / TRUSTPILOT_BUSINESS_UNIT_ID).
--
--   Settes inn fra admin → Rating. Idempotent – trygt å kjøre om igjen.
-- =====================================================================

alter table review_config
  add column if not exists trustpilot_api_key          text,
  add column if not exists trustpilot_business_unit_id text,
  add column if not exists trustpilot_enabled          boolean not null default true;
