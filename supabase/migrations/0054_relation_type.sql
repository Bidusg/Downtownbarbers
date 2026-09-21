-- =====================================================================
-- 0054 — VENN/FAMILIE SOM EGEN SALGSTYPE
--
--   For å se bruk og hyppighet av venn-/familie-salg tagges salget med en
--   relation_type ('venn' | 'familie'). Settes fra kassa når venn/familie-
--   rabatten brukes. Ligger på sales (dekker både time-salg og hurtigsalg),
--   og settes som et best-effort-oppdatering rett etter at salget er registrert
--   – den atomiske record_sale/record_walkin_sale er urørt.
--
--   Idempotent.
-- =====================================================================

alter table sales
  add column if not exists relation_type text
    check (relation_type is null or relation_type in ('venn', 'familie'));

create index if not exists sales_relation_type_idx
  on sales (relation_type)
  where relation_type is not null;
