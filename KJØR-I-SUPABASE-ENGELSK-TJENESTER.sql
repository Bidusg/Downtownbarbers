-- =====================================================================
-- Engelske navn og beskrivelser på tjenester
--
-- Før: engelsk oversettelse lå i en fast liste i koden, som bare traff når
-- den norske teksten var helt lik. Nye eller endrede tjenester (navn eller
-- beskrivelse) ble derfor stående på norsk på den engelske nettsiden.
--
-- Nå: hver tjeneste (og kategori) har egne engelske felt som redigeres i
-- admin → Tjenester. Tomt felt = den gamle listen brukes, ellers norsk.
-- Feltene fylles ut automatisk for tjenester som allerede har oversettelse.
-- Trygt å kjøre flere ganger (overskriver aldri noe du har skrevet selv).
-- =====================================================================

alter table services           add column if not exists name_en        text;
alter table services           add column if not exists description_en text;
alter table service_categories add column if not exists name_en        text;

with v(no, en) as (values
  ('Klipp', 'Haircuts'),
  ('Hårklipp', 'Haircuts'),
  ('Kombo', 'Combo'),
  ('Skjegg', 'Beard'),
  ('Barbering', 'Shaving'),
  ('Tillegg', 'Add-ons'),
  ('Maskinklipp/Lineup', 'Clipper cut / Lineup'),
  ('Rask maskinklipp eller lineup for deg som bare vil rydde opp rundt ører, nakke og hårlinje. Kort og effektivt – vær presis på oppmøtetid.', 'A quick clipper cut or lineup for when you just want to tidy up around the ears, neck and hairline. Short and efficient – please be on time.'),
  ('Herreklipp 30''', 'Men''s haircut 30'''),
  ('En klipp for de fleste frisyrer. På 30 minutter rekker vi skinfade, taperfade og de fleste standard-klipp.', 'A cut for most styles. In 30 minutes we can do a skin fade, taper fade and most standard cuts.'),
  ('Herreklipp 45''', 'Men''s haircut 45'''),
  ('For deg som vil ha litt ekstra tid – førstegangskunde, skinfade, classic cut, mullet eller mer krevende frisyrer, med tynning, teksturering og detaljer underveis.', 'For when you want a little extra time – first-time client, skin fade, classic cut, mullet or more demanding styles, with thinning, texturising and detailing along the way.'),
  ('Barneklipp', 'Kids'' haircut'),
  ('Klipp for barn under 12 år, hos hvilken som helst barber.', 'A haircut for children under 12, with any barber.'),
  ('Lett kombo', 'Light combo'),
  ('Klipp og skjegg i samme sesjon. Skjegget formes og trimmes med maskin (uten hot towel) – en effektiv oppgradering fra vanlig klipp.', 'Haircut and beard in one session. The beard is shaped and trimmed with clippers (no hot towel) – an efficient upgrade from a regular cut.'),
  ('Full kombo', 'Full combo'),
  ('Full behandling med god tid: grundig klipp kombinert med komplett skjeggpleie og hot towel-barbering. Den komplette opplevelsen.', 'The full treatment with time to spare: a thorough cut combined with complete beard care and a hot-towel shave. The complete experience.'),
  ('Lineup / skjeggtrim', 'Lineup / beard trim'),
  ('Rask lineup og trim – skarpe, rene kanter på skjegget. Også fin som en kjapp oppfriskning mellom fulle behandlinger.', 'A quick lineup and trim – sharp, clean edges on the beard. Also great as a fast refresh between full treatments.'),
  ('Skjeggtrim', 'Beard trim'),
  ('Forming, trimming og stell av skjegget med maskin og kniv, tilpasset ansiktsform.', 'Shaping, trimming and grooming of the beard with clippers and blade, tailored to your face shape.'),
  ('Skjeggtrim deluxe', 'Beard trim deluxe'),
  ('Full skjeggbehandling med hot towel, nøyaktig forming, barberkniv på kantene og pleieprodukter.', 'A full beard treatment with hot towel, precise shaping, straight razor on the edges and care products.'),
  ('Hodebarbering', 'Head shave'),
  ('Barbering av hodet med barberkniv og blad – ren, glatt finish med hot towel.', 'A head shave with straight razor and blade – a clean, smooth finish with hot towel.'),
  ('Barbering (ansikt)', 'Shave (face)'),
  ('Klassisk våtbarbering av ansiktet: hot towel, skum og barberblad for en tett, ren barbering.', 'A classic wet shave of the face: hot towel, lather and blade for a close, clean shave.'),
  ('Barbering deluxe', 'Shave deluxe'),
  ('Den fulle barberopplevelsen med ekstra tid, hot towel, forming og pleie – for en luksuriøs, tett barbering.', 'The full shaving experience with extra time, hot towel, shaping and care – for a luxurious, close shave.'),
  ('Hårvask', 'Hair wash'),
  ('Hårvask og Føning', 'Hair wash & blow-dry'),
  ('Hårvask og føning', 'Hair wash & blow-dry'),
  ('Føning', 'Blow-dry'),
  ('Hodebunnsmassasje', 'Scalp massage'),
  ('Nakkemassasje', 'Neck massage'),
  ('Ansiktsmassasje', 'Face massage'),
  ('Voks', 'Wax'),
  ('Vask & styling', 'Wash & styling'),
  ('Styling', 'Styling'),
  ('Hot towel', 'Hot towel'),
  ('Augbryn', 'Eyebrows'),
  ('Øyenbryn', 'Eyebrows'),
  ('Hår & klipp', 'Hair & cuts'),
  ('Skjegg & grooming', 'Beard & grooming'),
  ('Ansikt & detalj', 'Face & details'),
  ('Annet', 'Other'),
  ('Herreklipp', 'Men''s haircut'),
  ('Skin Fade', 'Skin fade'),
  ('Skjeggtrimming', 'Beard trim'),
  ('Hår + Skjegg', 'Hair + beard'),
  ('Tradisjonell barbering', 'Traditional shave'),
  ('Øyenbrynsvoksing', 'Eyebrow waxing'),
  ('Ansiktsmaske', 'Face mask'),
  ('Farging av skjegg', 'Beard colouring'),
  ('Skjeggfarging', 'Beard colouring'),
  ('Hårfarging', 'Hair colouring')
)
update services s
   set name_en = v.en
  from v
 where s.name_en is null
   and lower(trim(s.name)) = lower(trim(v.no));

with v(no, en) as (values
  ('Klipp', 'Haircuts'),
  ('Hårklipp', 'Haircuts'),
  ('Kombo', 'Combo'),
  ('Skjegg', 'Beard'),
  ('Barbering', 'Shaving'),
  ('Tillegg', 'Add-ons'),
  ('Maskinklipp/Lineup', 'Clipper cut / Lineup'),
  ('Rask maskinklipp eller lineup for deg som bare vil rydde opp rundt ører, nakke og hårlinje. Kort og effektivt – vær presis på oppmøtetid.', 'A quick clipper cut or lineup for when you just want to tidy up around the ears, neck and hairline. Short and efficient – please be on time.'),
  ('Herreklipp 30''', 'Men''s haircut 30'''),
  ('En klipp for de fleste frisyrer. På 30 minutter rekker vi skinfade, taperfade og de fleste standard-klipp.', 'A cut for most styles. In 30 minutes we can do a skin fade, taper fade and most standard cuts.'),
  ('Herreklipp 45''', 'Men''s haircut 45'''),
  ('For deg som vil ha litt ekstra tid – førstegangskunde, skinfade, classic cut, mullet eller mer krevende frisyrer, med tynning, teksturering og detaljer underveis.', 'For when you want a little extra time – first-time client, skin fade, classic cut, mullet or more demanding styles, with thinning, texturising and detailing along the way.'),
  ('Barneklipp', 'Kids'' haircut'),
  ('Klipp for barn under 12 år, hos hvilken som helst barber.', 'A haircut for children under 12, with any barber.'),
  ('Lett kombo', 'Light combo'),
  ('Klipp og skjegg i samme sesjon. Skjegget formes og trimmes med maskin (uten hot towel) – en effektiv oppgradering fra vanlig klipp.', 'Haircut and beard in one session. The beard is shaped and trimmed with clippers (no hot towel) – an efficient upgrade from a regular cut.'),
  ('Full kombo', 'Full combo'),
  ('Full behandling med god tid: grundig klipp kombinert med komplett skjeggpleie og hot towel-barbering. Den komplette opplevelsen.', 'The full treatment with time to spare: a thorough cut combined with complete beard care and a hot-towel shave. The complete experience.'),
  ('Lineup / skjeggtrim', 'Lineup / beard trim'),
  ('Rask lineup og trim – skarpe, rene kanter på skjegget. Også fin som en kjapp oppfriskning mellom fulle behandlinger.', 'A quick lineup and trim – sharp, clean edges on the beard. Also great as a fast refresh between full treatments.'),
  ('Skjeggtrim', 'Beard trim'),
  ('Forming, trimming og stell av skjegget med maskin og kniv, tilpasset ansiktsform.', 'Shaping, trimming and grooming of the beard with clippers and blade, tailored to your face shape.'),
  ('Skjeggtrim deluxe', 'Beard trim deluxe'),
  ('Full skjeggbehandling med hot towel, nøyaktig forming, barberkniv på kantene og pleieprodukter.', 'A full beard treatment with hot towel, precise shaping, straight razor on the edges and care products.'),
  ('Hodebarbering', 'Head shave'),
  ('Barbering av hodet med barberkniv og blad – ren, glatt finish med hot towel.', 'A head shave with straight razor and blade – a clean, smooth finish with hot towel.'),
  ('Barbering (ansikt)', 'Shave (face)'),
  ('Klassisk våtbarbering av ansiktet: hot towel, skum og barberblad for en tett, ren barbering.', 'A classic wet shave of the face: hot towel, lather and blade for a close, clean shave.'),
  ('Barbering deluxe', 'Shave deluxe'),
  ('Den fulle barberopplevelsen med ekstra tid, hot towel, forming og pleie – for en luksuriøs, tett barbering.', 'The full shaving experience with extra time, hot towel, shaping and care – for a luxurious, close shave.'),
  ('Hårvask', 'Hair wash'),
  ('Hårvask og Føning', 'Hair wash & blow-dry'),
  ('Hårvask og føning', 'Hair wash & blow-dry'),
  ('Føning', 'Blow-dry'),
  ('Hodebunnsmassasje', 'Scalp massage'),
  ('Nakkemassasje', 'Neck massage'),
  ('Ansiktsmassasje', 'Face massage'),
  ('Voks', 'Wax'),
  ('Vask & styling', 'Wash & styling'),
  ('Styling', 'Styling'),
  ('Hot towel', 'Hot towel'),
  ('Augbryn', 'Eyebrows'),
  ('Øyenbryn', 'Eyebrows'),
  ('Hår & klipp', 'Hair & cuts'),
  ('Skjegg & grooming', 'Beard & grooming'),
  ('Ansikt & detalj', 'Face & details'),
  ('Annet', 'Other'),
  ('Herreklipp', 'Men''s haircut'),
  ('Skin Fade', 'Skin fade'),
  ('Skjeggtrimming', 'Beard trim'),
  ('Hår + Skjegg', 'Hair + beard'),
  ('Tradisjonell barbering', 'Traditional shave'),
  ('Øyenbrynsvoksing', 'Eyebrow waxing'),
  ('Ansiktsmaske', 'Face mask'),
  ('Farging av skjegg', 'Beard colouring'),
  ('Skjeggfarging', 'Beard colouring'),
  ('Hårfarging', 'Hair colouring')
)
update services s
   set description_en = v.en
  from v
 where s.description_en is null
   and trim(coalesce(s.description, '')) <> ''
   and trim(s.description) = trim(v.no);

with v(no, en) as (values
  ('Klipp', 'Haircuts'),
  ('Hårklipp', 'Haircuts'),
  ('Kombo', 'Combo'),
  ('Skjegg', 'Beard'),
  ('Barbering', 'Shaving'),
  ('Tillegg', 'Add-ons'),
  ('Maskinklipp/Lineup', 'Clipper cut / Lineup'),
  ('Rask maskinklipp eller lineup for deg som bare vil rydde opp rundt ører, nakke og hårlinje. Kort og effektivt – vær presis på oppmøtetid.', 'A quick clipper cut or lineup for when you just want to tidy up around the ears, neck and hairline. Short and efficient – please be on time.'),
  ('Herreklipp 30''', 'Men''s haircut 30'''),
  ('En klipp for de fleste frisyrer. På 30 minutter rekker vi skinfade, taperfade og de fleste standard-klipp.', 'A cut for most styles. In 30 minutes we can do a skin fade, taper fade and most standard cuts.'),
  ('Herreklipp 45''', 'Men''s haircut 45'''),
  ('For deg som vil ha litt ekstra tid – førstegangskunde, skinfade, classic cut, mullet eller mer krevende frisyrer, med tynning, teksturering og detaljer underveis.', 'For when you want a little extra time – first-time client, skin fade, classic cut, mullet or more demanding styles, with thinning, texturising and detailing along the way.'),
  ('Barneklipp', 'Kids'' haircut'),
  ('Klipp for barn under 12 år, hos hvilken som helst barber.', 'A haircut for children under 12, with any barber.'),
  ('Lett kombo', 'Light combo'),
  ('Klipp og skjegg i samme sesjon. Skjegget formes og trimmes med maskin (uten hot towel) – en effektiv oppgradering fra vanlig klipp.', 'Haircut and beard in one session. The beard is shaped and trimmed with clippers (no hot towel) – an efficient upgrade from a regular cut.'),
  ('Full kombo', 'Full combo'),
  ('Full behandling med god tid: grundig klipp kombinert med komplett skjeggpleie og hot towel-barbering. Den komplette opplevelsen.', 'The full treatment with time to spare: a thorough cut combined with complete beard care and a hot-towel shave. The complete experience.'),
  ('Lineup / skjeggtrim', 'Lineup / beard trim'),
  ('Rask lineup og trim – skarpe, rene kanter på skjegget. Også fin som en kjapp oppfriskning mellom fulle behandlinger.', 'A quick lineup and trim – sharp, clean edges on the beard. Also great as a fast refresh between full treatments.'),
  ('Skjeggtrim', 'Beard trim'),
  ('Forming, trimming og stell av skjegget med maskin og kniv, tilpasset ansiktsform.', 'Shaping, trimming and grooming of the beard with clippers and blade, tailored to your face shape.'),
  ('Skjeggtrim deluxe', 'Beard trim deluxe'),
  ('Full skjeggbehandling med hot towel, nøyaktig forming, barberkniv på kantene og pleieprodukter.', 'A full beard treatment with hot towel, precise shaping, straight razor on the edges and care products.'),
  ('Hodebarbering', 'Head shave'),
  ('Barbering av hodet med barberkniv og blad – ren, glatt finish med hot towel.', 'A head shave with straight razor and blade – a clean, smooth finish with hot towel.'),
  ('Barbering (ansikt)', 'Shave (face)'),
  ('Klassisk våtbarbering av ansiktet: hot towel, skum og barberblad for en tett, ren barbering.', 'A classic wet shave of the face: hot towel, lather and blade for a close, clean shave.'),
  ('Barbering deluxe', 'Shave deluxe'),
  ('Den fulle barberopplevelsen med ekstra tid, hot towel, forming og pleie – for en luksuriøs, tett barbering.', 'The full shaving experience with extra time, hot towel, shaping and care – for a luxurious, close shave.'),
  ('Hårvask', 'Hair wash'),
  ('Hårvask og Føning', 'Hair wash & blow-dry'),
  ('Hårvask og føning', 'Hair wash & blow-dry'),
  ('Føning', 'Blow-dry'),
  ('Hodebunnsmassasje', 'Scalp massage'),
  ('Nakkemassasje', 'Neck massage'),
  ('Ansiktsmassasje', 'Face massage'),
  ('Voks', 'Wax'),
  ('Vask & styling', 'Wash & styling'),
  ('Styling', 'Styling'),
  ('Hot towel', 'Hot towel'),
  ('Augbryn', 'Eyebrows'),
  ('Øyenbryn', 'Eyebrows'),
  ('Hår & klipp', 'Hair & cuts'),
  ('Skjegg & grooming', 'Beard & grooming'),
  ('Ansikt & detalj', 'Face & details'),
  ('Annet', 'Other'),
  ('Herreklipp', 'Men''s haircut'),
  ('Skin Fade', 'Skin fade'),
  ('Skjeggtrimming', 'Beard trim'),
  ('Hår + Skjegg', 'Hair + beard'),
  ('Tradisjonell barbering', 'Traditional shave'),
  ('Øyenbrynsvoksing', 'Eyebrow waxing'),
  ('Ansiktsmaske', 'Face mask'),
  ('Farging av skjegg', 'Beard colouring'),
  ('Skjeggfarging', 'Beard colouring'),
  ('Hårfarging', 'Hair colouring')
)
update service_categories c
   set name_en = v.en
  from v
 where c.name_en is null
   and lower(trim(c.name)) = lower(trim(v.no));

notify pgrst, 'reload schema';

-- Se hva som fortsatt mangler engelsk (fyll inn i admin → Tjenester):
select name, description, name_en, description_en
  from services
 where active and (name_en is null or (trim(coalesce(description,'')) <> '' and description_en is null))
 order by name;
