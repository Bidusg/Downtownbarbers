-- =====================================================================
-- 0046 – KASSEOPPGJØR SOM FAKTISK AVSTEMMER
--
--   Til nå lagret et dagsoppgjør bare ett totalbeløp (cash_settlements.
--   total_nok) – ingen sammenligning mot forventet salg, ingen
--   differanse. Selve poenget (fange avvik) manglet.
--
--   Denne migrasjonen legger til talt beløp PER betalingsmåte og et
--   snapshot av FORVENTET beløp per betalingsmåte (fra salget den
--   datoen), regnet ut server-side når oppgjøret lagres. Avviket
--   (talt − forventet) regnes ut ved visning. Gamle rader har NULL i
--   de nye kolonnene og vises som «uten avstemming».
--
--   Kun nye, nullbare kolonner. Ingen RLS-endring (tabellen er allerede
--   admin-only). Idempotent.
-- =====================================================================

alter table cash_settlements
  add column if not exists counted_cash   numeric(10,2),
  add column if not exists counted_card   numeric(10,2),
  add column if not exists counted_vipps  numeric(10,2),
  add column if not exists expected_cash  numeric(10,2),
  add column if not exists expected_card  numeric(10,2),
  add column if not exists expected_vipps numeric(10,2);
