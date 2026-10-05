-- =====================================================================
-- KJØR-I-SUPABASE-SAMTYKKE-FIXIT.sql
--   Markedsføringssamtykke for kundene som ble importert fra Fixit.
--
--   Bakgrunn: kundene ga samtykke til markedsføring i Fixit, men det
--   feltet ble ikke med i eksporten/importen. Denne jobben setter
--   marketing_consent = true på de importerte kundene, og dokumenterer
--   grunnlaget (markedsføringsloven § 15 krever at samtykket kan
--   dokumenteres) i en egen kolonne: marketing_consent_source = 'fixit'.
--
--   Trygt / idempotent:
--   • Rører KUN kunder som aldri har tatt stilling i det nye systemet:
--       – marketing_consent_at er tom (ingen avmelding via lenke/STOPP,
--         ingen avkrysning i booking), og
--       – source er tom eller «fixit…» (kunder fra den nye bookingen får
--         «Hvordan hørte du om oss?» i source – de har selv valgt å
--         (ikke) huke av, og røres ikke).
--   • En kunde som har meldt seg av (marketing_consent_at satt) røres
--     ALDRI – avmelding vinner alltid.
--   • Kan kjøres flere ganger; andre gang gjør den ingenting.
--
--   Før du kjører: se raden «FORHÅNDSVISNING» nederst – kjør gjerne den
--   SELECT-en først for å se hvor mange som blir satt.
-- =====================================================================

-- Dokumentasjon av samtykkegrunnlag (ny kolonne, ufarlig for appen).
alter table customers
  add column if not exists marketing_consent_source text;

comment on column customers.marketing_consent_source is
  'Hvor samtykket kom fra: fixit (importert), booking (avkrysset på nett), kasse, sms-start.';

-- FORHÅNDSVISNING – hvor mange kunder treffes?
-- select count(*) as blir_satt
--   from customers
--  where marketing_consent = false
--    and marketing_consent_at is null
--    and (source is null or lower(source) like 'fixit%');

-- Selve oppdateringen.
update customers
   set marketing_consent        = true,
       marketing_consent_at     = now(),
       marketing_consent_source = 'fixit'
 where marketing_consent = false
   and marketing_consent_at is null
   and (source is null or lower(source) like 'fixit%');

-- Merk eksisterende samtykker fra ny booking som «booking» der kilde mangler.
update customers
   set marketing_consent_source = 'booking'
 where marketing_consent = true
   and marketing_consent_source is null
   and source is not null
   and lower(source) not like 'fixit%';

-- Kontroll etterpå: fordeling per kilde.
-- select marketing_consent, marketing_consent_source, count(*)
--   from customers group by 1, 2 order by 1, 2;
