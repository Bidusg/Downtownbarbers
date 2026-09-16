-- =====================================================================
-- 0030 — Omdømme-kilder konfigurerbart fra admin (Google + TripAdvisor)
--   Tidligere måtte API-nøkler settes som env-variabler i Vercel. Nå kan
--   Dawit/admin legge dem inn direkte i /admin/rating. Nøklene er hemmelige,
--   så tabellen er KUN admin (RLS) — ingen public read. Server-koden som
--   henter omdømmet leser via service-role-klienten (bypasser RLS, kun
--   server). Mangler en verdi her, faller koden tilbake til env-variabelen,
--   så eksisterende oppsett fortsetter å virke uendret.
-- Idempotent.
-- =====================================================================

create table if not exists review_config (
  id                       int primary key default 1,
  google_api_key           text,
  google_place_id          text,
  google_enabled           boolean not null default true,
  tripadvisor_api_key      text,
  tripadvisor_location_id  text,
  tripadvisor_enabled      boolean not null default true,
  updated_at               timestamptz not null default now(),
  constraint review_config_singleton check (id = 1)
);
insert into review_config (id) values (1) on conflict (id) do nothing;

alter table review_config enable row level security;
-- Kun admin. Ingen public/anon read — nøklene skal aldri kunne leses av
-- besøkende. Server-koden bruker service-role for offentlig visning.
drop policy if exists review_config_admin_all on review_config;
create policy review_config_admin_all on review_config
  for all using (is_admin()) with check (is_admin());
