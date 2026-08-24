-- =====================================================================
-- Ekte tjenester og priser (reddet fra tidligere versjon av appen)
-- Kjøres etter 0001_init.sql. Mapper mot service_categories fra seed.
-- =====================================================================

insert into services (category_id, name, description, price_nok, duration_min, sort_order)
select c.id, v.name, v.descr, v.price, v.dur, v.ord
from (values
  ('Hår & klipp',        'Herreklipp',              'Klassisk herreklipp, vask og styling inkludert', 350, 30, 1),
  ('Hår & klipp',        'Skin Fade',               'Gradert fade fra huden - vår signatur-tjeneste', 450, 45, 2),
  ('Hår & klipp',        'Barneklipp',              'For kunder under 12 år',                         250, 20, 3),
  ('Skjegg & grooming',  'Skjeggtrimming',          'Forming, trimming og stell av skjegg',           200, 20, 4),
  ('Skjegg & grooming',  'Hår + Skjegg',            'Full service: klipp og skjeggpleie i én sesjon', 580, 60, 5),
  ('Skjegg & grooming',  'Tradisjonell barbering',  'Varm håndklé, skum og barberblad',               350, 30, 6),
  ('Ansikt & detalj',    'Øyenbrynsvoksing',        'Forming og voksing av øyenbryn',                 150, 15, 7),
  ('Ansikt & detalj',    'Ansiktsmaske',            'Dyprengjørende ansiktsmaske etter barbering',    250, 20, 8)
) as v(cat, name, descr, price, dur, ord)
join service_categories c on c.name = v.cat
on conflict do nothing;
