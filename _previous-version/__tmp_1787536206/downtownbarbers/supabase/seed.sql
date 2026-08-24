-- =====================================================================
-- Seed – Downtown Barbers grunndata
-- (Kjøres etter 0001_init.sql. Priser/varighet er PLASSHOLDERE til ekte prisliste er klar.)
-- =====================================================================

-- Innstillinger
insert into settings (key, value) values
  ('salon', '{"name":"Downtown Barbers","slogan":"Der presisjon møter stil","established":2018,"address":"Osterhaus'' gate 10, 0183 Oslo","phone":"+47 463 58 764"}'),
  ('opening_hours', '{"mon":["09:00","19:00"],"tue":["09:00","19:00"],"wed":["09:00","19:00"],"thu":["09:00","19:00"],"fri":["09:00","19:00"],"sat":["09:00","19:00"],"sun":null}'),
  ('social', '{"tiktok":"@downtownbarbers","instagram":"@downtownbarbersoslo","facebook":"downtownbarbersOslo"}')
on conflict (key) do nothing;

-- Tjenestekategorier (fra dagens Fixit/nettside)
insert into service_categories (name, sort_order) values
  ('Hår & klipp', 1),
  ('Skjegg & grooming', 2),
  ('Ansikt & detalj', 3),
  ('Farge & behandling', 4)
on conflict do nothing;

-- Team (ansattnr og kontrakt fylles inn via admin senere; priser er plassholdere)
insert into staff (employee_number, full_name, title, active) values
  ('DB-001', 'David',      'Master Barber', true),
  ('DB-002', 'Vani',       'Barber',        true),
  ('DB-003', 'Soren',      'Barber',        true),
  ('DB-004', 'Isak',       'Barber',        true),
  ('DB-005', 'Stavros',    'Barber',        true),
  ('DB-006', 'Mehetabel',  'Lærling',       true)
on conflict (employee_number) do nothing;
