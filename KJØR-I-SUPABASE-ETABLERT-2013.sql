-- =====================================================================
-- KJØR-I-SUPABASE-ETABLERT-2013.sql
--   Downtown Barbers har vært åpen siden 2013 (ikke 2018) og er godt
--   forankret i Oslo sentrum. Oppdaterer forsidens «Siden …», «Om oss»-
--   teksten og copyright-året i site_settings. Idempotent.
--   (Kan også gjøres i admin → Nettside, men denne gjør det i ett grep og
--   med nøyaktig den norske teksten som EN-oversettelsen treffer på.)
-- =====================================================================

update site_settings
   set established = '2013',
       about_text  = 'Siden 2013 har vi klippet Oslo midt i sentrum. Én idé hele veien: en barbershop der klippen faktisk sitter og praten går av seg selv. Erfarne barberere, skarpe verktøy og tid nok til å gjøre det ordentlig – et fast punkt i Oslo sentrum siden starten.'
 where id = 1;

-- Kontroll:
-- select established, about_text from site_settings where id = 1;
