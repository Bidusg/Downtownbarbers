-- =====================================================================
-- PRISKALKULATOR – EKSTRA FELT PÅ INNKJØPSPRIS
--
-- Hva dette gjør:
--   Legger til to valgfrie kolonner i product_costs:
--     cost_source – hvor innkjøpsprisen kommer fra:
--                   'manuell' (lagt inn av admin), 'import' (fra fil/faktura),
--                   'anslag' (estimert, ikke bekreftet).
--     note        – fritekstnotat om innkjøpsprisen.
--   Brukes av priskalkulatoren og varemargin-oversikten for å vise hvor
--   sikre tallene er.
--
-- Ingen endring i RLS/policyer: product_costs er fortsatt kun synlig for
--   admin/eier/revisor og kun skrivbar for admin/eier.
--
-- Krav: KJØR-I-SUPABASE-INNKJOPSPRIS.sql er kjørt (tabellen product_costs).
-- Trygt å kjøre flere ganger.
-- =====================================================================

-- Vakt: tabellen må finnes fra før.
do $$
begin
  if to_regclass('public.product_costs') is null then
    raise exception 'Tabellen product_costs mangler. Kjør KJØR-I-SUPABASE-INNKJOPSPRIS.sql først.';
  end if;
end $$;

alter table product_costs add column if not exists cost_source text;
alter table product_costs add column if not exists note text;

alter table product_costs drop constraint if exists product_costs_cost_source_check;
alter table product_costs add constraint product_costs_cost_source_check
  check (cost_source is null or cost_source in ('manuell', 'import', 'anslag'));

comment on column product_costs.cost_source is
  'Kilde til innkjøpsprisen: manuell, import eller anslag. Null = ukjent.';
comment on column product_costs.note is
  'Fritekstnotat om innkjøpsprisen (f.eks. «prisliste høst 2026»).';

-- Kontroll: skal vise to rader (cost_source og note).
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'product_costs'
  and column_name in ('cost_source', 'note')
order by column_name;

notify pgrst, 'reload schema';
