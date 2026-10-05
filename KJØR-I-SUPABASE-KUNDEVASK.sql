-- =====================================================================
-- KJØR-I-SUPABASE-KUNDEVASK.sql
--   Opprydding i importerte kundenavn fra Fixit.
--
--   Funn: enkelte kunder har telefonnummeret som fornavn, f.eks.
--   «47657179 Bue» (telefon 47657179 ligger også i phone-feltet).
--   Denne jobben fjerner et ledende 8-sifret nummer fra navnet, og
--   legger nummeret i phone hvis phone er tomt. Navn som da blir tomme
--   settes til «Ukjent».
--
--   Idempotent: kjør FORHÅNDSVISNINGEN først for å se hvem som treffes.
-- =====================================================================

-- FORHÅNDSVISNING
-- select id, full_name, phone, email
--   from customers
--  where full_name ~ '^\s*\d{8}(\s|$)'
--  order by full_name;

-- 1) Telefon inn i phone-feltet der det mangler.
update customers
   set phone = substring(full_name from '^\s*(\d{8})')
 where full_name ~ '^\s*\d{8}(\s|$)'
   and (phone is null or btrim(phone) = '');

-- 2) Fjern nummeret fra navnet.
update customers
   set full_name = coalesce(nullif(btrim(regexp_replace(full_name, '^\s*\d{8}\s*', '')), ''), 'Ukjent')
 where full_name ~ '^\s*\d{8}(\s|$)';

-- Kontroll: skal gi 0 rader etterpå.
-- select count(*) from customers where full_name ~ '^\s*\d{8}(\s|$)';
