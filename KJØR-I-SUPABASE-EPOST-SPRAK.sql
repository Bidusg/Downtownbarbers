-- =====================================================================
-- Språkknapp i e-postene («Read in English» / «Les på norsk»)
--
-- 1) Kundens språk (samme som KJØR-I-SUPABASE-SPRAK.sql – trygt å kjøre
--    igjen). Når kunden trykker språklenken i en e-post, lagres valget her,
--    og senere e-post og SMS kommer på det språket.
-- 2) Engelsk versjon av markedsføringsutsendinger (valgfri, eller oversatt
--    automatisk med DeepL). Kunder som har valgt engelsk får den.
--
-- Trygt å kjøre flere ganger.
-- =====================================================================

alter table customers add column if not exists lang text;
do $$ begin
  alter table customers
    add constraint customers_lang_check check (lang is null or lang in ('no', 'en'));
exception when duplicate_object then null; end $$;

alter table marketing_sends add column if not exists subject_en text;
alter table marketing_sends add column if not exists body_en text;

notify pgrst, 'reload schema';
