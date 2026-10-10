-- =====================================================================
-- MARKEDSFØRINGSSAMTYKKE – IMPORTERTE FIXIT-KUNDER (Vani + Soren)
--
--   Bakgrunn (oppgitt av Downtown Barbers): En systemfeil i Fixit gjorde at
--   samtykke som ble registrert IKKE ble lagret – derfor viser Fixit-eksporten
--   «nei» på de aller fleste. Samtykket er i ettertid innhentet MANUELT:
--     • hver kunde er ringt og spurt, og
--     • de øvrige er snakket med ved oppmøte i salongen.
--   Denne oppdateringen fører det faktiske samtykket inn i det nye systemet,
--   med et DOKUMENTERT grunnlag per kunde (marketing_consent_source) slik at
--   samtykket kan dokumenteres etter markedsføringsloven § 15.
--
--   Treffer KUN kunder importert fra Fixit (import_key like 'fixit:%').
--   Kjør ETTER at kundeimporten (KJØR-I-SUPABASE-FIXIT-KUNDER.sql) er kjørt.
--   Idempotent. Én transaksjon.
-- =====================================================================
begin;

alter table customers add column if not exists marketing_consent_source text;

update customers
   set marketing_consent     = true,
       marketing_consent_at  = coalesce(marketing_consent_at, now()),
       marketing_consent_source =
         'Manuelt innhentet (telefon/oppmøte) pga. Fixit-systemfeil – Downtown Barbers 2026'
 where import_key like 'fixit:%';

-- Rapport: hvor mange ble oppdatert.
do $$
declare n int;
begin
  select count(*) into n from customers where import_key like 'fixit:%' and marketing_consent;
  raise notice 'Samtykke satt til JA på % importerte Fixit-kunder.', n;
end $$;

commit;
