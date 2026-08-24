-- =====================================================================
-- Noen eksempelprodukter til nettbutikken (kan redigeres/slettes i admin).
-- Bilder legges til via admin (opplasting til staff-files/products/...).
-- =====================================================================

insert into products (name, description, price_nok, stock, active, is_gift_card)
values
  ('Matt Pomade',        'Sterkt hold, matt finish. 100 ml.',              249, 40, true, false),
  ('Skjeggolje',         'Pleiende olje for mykt, velduftende skjegg. 30 ml.', 199, 30, true, false),
  ('Rensende Shampoo',   'Daglig shampoo for hår og skjegg. 250 ml.',      179, 25, true, false),
  ('Styling Clay',       'Fleksibelt hold med naturlig finish. 100 ml.',   229, 20, true, false),
  ('Gavekort 500 kr',    'Digitalt gavekort til bruk på tjenester og produkter.', 500, 999, true, true)
on conflict do nothing;
