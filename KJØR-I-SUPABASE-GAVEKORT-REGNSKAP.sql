-- =====================================================================
-- KJØR-I-SUPABASE-GAVEKORT-REGNSKAP.sql
--
--   REGNSKAPSRIKTIG BEHANDLING AV GAVEKORT (krav fra regnskapsfører Kumar).
--
--   Bakgrunn:
--     • SALG av et gavekort er IKKE salg av en vare/tjeneste og skal IKKE
--       momses. Det er en FORSKUDDSBETALING fra kunden → skal bokføres som
--       penger inn (kontant/kort/vipps) DEBET mot KREDIT på en GJELDSKONTO
--       «Forskudd fra kunder» (standard 2900 – KUMAR MÅ BEKREFTE kontonr.).
--     • Når gavekortet INNLØSES skjer det faktiske, mva-pliktige salget:
--       salgskontoen (3001/3020) krediteres med mva, og gjeldskontoen (2900)
--       DEBITERES (gjelden ned). Mva tas altså ved innløsning, ikke ved salg.
--
--   Hva denne filen gjør:
--     • Legger til kolonnen gift_cards.sold_payment_method, slik at systemet
--       kan registrere HVORDAN et gavekort ble betalt da det ble solgt. Dette
--       er det eneste som trengs for at dagsbilaget (deriveIncomeLedger) skal
--       kunne føre gavekort-salg som forskudd mot gjeldskonto 2900, uten mva.
--
--   Trygghet:
--     • Idempotent (add column if not exists).
--     • Koden fungerer også FØR denne SQL-en er kjørt: utstedelse av gavekort
--       faller trygt tilbake til å lagre uten betalingsmåte, og dagsbilaget
--       hopper bare over gavekort-salg-posteringene (ingenting krasjer).
--     • INNLØSNING av gavekort er allerede riktig i koden uten denne filen:
--       betalingsmåten «Gavekort» mappes nå til gjeldskonto 2900 i stedet for
--       den tidligere (feilaktige) eiendelskontoen 1522.
--
--   MERK (Kumar): bekreft kontonummeret. Default 2900 kan overstyres uten ny
--   deploy via miljøvariabelen TRIPLETEX_ACCOUNT_GIFTCARD.
-- =====================================================================

-- Betalingsmåten pengene kom inn med da gavekortet ble SOLGT
-- ('Kontant' | 'Kort' | 'Vipps'). NULL = ikke registrert (promo/gratis
-- gavekort eller eldre rader) → føres manuelt av regnskapsfører.
alter table gift_cards add column if not exists sold_payment_method text;

comment on column gift_cards.sold_payment_method is
  'Betalingsmåte ved SALG av gavekortet (forskudd): Kontant/Kort/Vipps. '
  'Brukes av dagsbilaget til å føre penger inn (debet) mot gjeldskonto 2900 '
  '(Forskudd fra kunder) uten mva. NULL = ikke registrert, føres manuelt.';

-- Kontroll (valgfri):
-- select column_name, data_type
--   from information_schema.columns
--   where table_name = 'gift_cards' and column_name = 'sold_payment_method';
