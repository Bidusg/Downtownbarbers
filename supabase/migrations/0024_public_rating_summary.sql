-- =====================================================================
-- Offentlig omdømme: en aggregert (ikke rad-eksponerende) oppsummering av
-- egne kunders ratinger, slik at forsiden kan vise «egne kunder» som en
-- kilde i det samlede omdømme-snittet. Kun snitt + antall – ingen enkelt-
-- vurderinger eller persondata lekker ut. SECURITY DEFINER + grant til anon.
--
-- Uten denne migrasjonen fungerer forsiden fint: da blandes bare Google +
-- TripAdvisor. Kjør den for å ta egne kunder med i det offentlige snittet.
-- =====================================================================

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
