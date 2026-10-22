-- =====================================================================
-- Automatisk oversettelse til engelsk med DeepL
--
-- 1) translation_config  – DeepL-nøkkel og av/på for automatisk oversettelse
--                          (kun admin kan lese/skrive).
-- 2) content_translations – engelske oversettelser av tekster dere skriver i
--                          admin (tjenester, kategorier, forsidetekster,
--                          Håndverket). Lagres én gang, så nettsiden ikke
--                          spør DeepL ved hvert besøk. Alle kan lese (nettsiden
--                          viser dem), kun admin kan endre.
-- Trygt å kjøre flere ganger.
-- =====================================================================

create table if not exists translation_config (
  id            int primary key default 1,
  deepl_api_key text,
  auto          boolean not null default true,
  updated_at    timestamptz not null default now(),
  constraint translation_config_one_row check (id = 1)
);
alter table translation_config enable row level security;
drop policy if exists translation_config_admin_all on translation_config;
create policy translation_config_admin_all on translation_config
  for all using (is_admin()) with check (is_admin());

create table if not exists content_translations (
  map        text not null,          -- 'services' | 'settings' | …
  key        text not null,          -- normalisert norsk tekst (små bokstaver, enkle mellomrom)
  src        text not null,          -- original norsk tekst
  en         text not null,          -- engelsk
  auto       boolean not null default true,  -- true = fra DeepL, false = rettet for hånd
  updated_at timestamptz not null default now(),
  primary key (map, key)
);
alter table content_translations enable row level security;
drop policy if exists content_translations_read on content_translations;
create policy content_translations_read on content_translations
  for select using (true);
drop policy if exists content_translations_admin_write on content_translations;
create policy content_translations_admin_write on content_translations
  for all using (is_admin()) with check (is_admin());
grant select on content_translations to anon, authenticated;

notify pgrst, 'reload schema';
