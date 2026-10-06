-- =====================================================================
-- KJØR-I-SUPABASE-EPOST-TYPE.sql
--   Legger til «type e-post» + «fremhevet barber» på markedsutsendinger,
--   så man kan velge oppsett (f.eks. «Ny barber» → bilde + egen bestill-knapp).
--   Idempotent og trygt.
-- =====================================================================

alter table marketing_sends
  add column if not exists email_type text not null default 'standard';

alter table marketing_sends
  add column if not exists featured_barber text;
