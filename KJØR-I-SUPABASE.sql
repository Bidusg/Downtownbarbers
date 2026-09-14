-- =====================================================================
-- KJØR I SUPABASE (SQL Editor) — samlet migrasjon fra denne økta
-- Downtown Barbers · sept 2026
--
-- Slik gjør du: Supabase → prosjekt kekdspamodouqqeptxwa → SQL Editor →
-- lim inn ALT under → Run. Trygt å kjøre flere ganger (create or replace).
--
-- Merk: migrasjonene 0020–0023 skal allerede være kjørt (verifisert i
-- live-test: /min-side og /avmeld svarte uten feil). Trenger du å kjøre
-- dem på nytt, ligger de i supabase/migrations/. Denne fila inneholder
-- kun det NYE fra denne økta.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0024 — Offentlig omdømme (valgfri)
-- Gir forsiden lov til å telle EGNE kunders vurderinger med i det
-- samlede omdømme-snittet, som et aggregat (kun snitt + antall — ingen
-- enkeltvurderinger eller persondata eksponeres). Uten denne: forsiden
-- blander bare Google + TripAdvisor. Med denne: egne kunder blir med.
-- ---------------------------------------------------------------------
create or replace function public_rating_summary()
returns table (avg numeric, cnt bigint)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(round(avg(stars)::numeric, 2), 0)::numeric,
         count(*)::bigint
  from ratings;
$$;

grant execute on function public_rating_summary() to anon, authenticated;
