-- =====================================================================
-- KASSEOPPGJØR-TVANG (løsning D) – «confirmed» på dagsoppgjør
--
--   Bakgrunn: for at regnskapet ikke skal bli feil skal hvert døgn med salg
--   ha et BEKREFTET kasseoppgjør. En daglig cron lager automatisk et UTKAST
--   for gårsdagen (fra registrerte salg), og et menneske bekrefter
--   opptellingen. En rød, ikke-lukkbar banner + daglig e-post maser til
--   oppgjøret faktisk er bekreftet.
--
--   Denne migrasjonen legger til ÉN ny kolonne på cash_settlements:
--
--     confirmed boolean not null default true
--
--   • default true  → alle EKSISTERENDE rader (og manuelt registrerte
--     oppgjør via det vanlige skjemaet) regnes som bekreftet. Ingen
--     falsk-alarm på historikk.
--   • auto-utkastet fra cronen settes eksplisitt til confirmed = false
--     («venter på bekreftelse»), og teller som MANGLENDE til et menneske
--     bekrefter det.
--
--   Kun en ny, ikke-null kolonne med default. Ingen RLS-endring (tabellen
--   er allerede admin-only). Idempotent – trygg å kjøre flere ganger.
--
--   Appen fungerer også FØR denne kjøres: spørringen som finner manglende
--   dager og cron-utkastet degraderer trygt når kolonnen ikke finnes.
-- =====================================================================

alter table cash_settlements
  add column if not exists confirmed boolean not null default true;

-- Sikkerhetsnett: skulle kolonnen ha blitt lagt til uten default/not-null
-- i en tidligere variant, normaliser eksisterende NULL til true.
update cash_settlements set confirmed = true where confirmed is null;

-- Rask oppslag på ubekreftede oppgjør (banner/påminnelse spør på dette).
create index if not exists cash_settlements_confirmed_idx
  on cash_settlements (settle_date)
  where confirmed = false;
