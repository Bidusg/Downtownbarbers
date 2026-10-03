-- =====================================================================
-- FORSIDE-TEKST: oppdater til ny, menneskelig merkevare-stemme.
--   Noe av forsidens tekst ligger i databasen (site_settings, rad id=1) og
--   overstyrer standardverdiene i koden. Denne oppdateringen bytter den
--   «AI-aktige» teksten med den nye. Kjør i Supabase → SQL Editor → Run.
--   (Hvis raden ikke finnes, bruker nettsiden allerede de nye kode-verdiene.)
-- =====================================================================

update public.site_settings set
  hero_title  = 'Sett deg ned.',
  hero_italic = 'Reis deg skarpere.',
  intro       = 'Barbershop i Osterhaus'' gate. Walk-in når det passer – timebestilling når du vil være sikker på plassen.',
  about_text  = 'Vi åpnet i 2018 med én idé: en barbershop der klippen faktisk sitter og praten går av seg selv. Erfarne barberere, skarpe verktøy og tid nok til å gjøre det ordentlig – midt i Oslo.',
  slogan      = 'Skarpe linjer. Ingen snarveier.',
  cta_title   = 'Klar for stolen?',
  cta_text    = 'Velg tjeneste, barber og tid – booket på under ett minutt.',
  updated_at  = now()
where id = 1;
