# ENDRINGER — Grunnmur: eier-rolle, shop-innstillinger & nivåer/prising (21. sept 2026)

## Commit-tittel (lim inn i GitHub Desktop)

```
Grunnmur: eier-rolle + shop-innstillinger (flagg) og nivåer & prising
```

## Commit-beskrivelse (valgfri, lengre)

```
Foundation 1 – Shop-innstillinger + eier-tilgang:
- Ny «eier»-rolle: full tilgang som admin + omgår alle shop-begrensninger.
- /admin/shop-innstillinger: av/på for rabatt, venn/familie-rabatt (+ sats),
  drop-in uten kunde, dra-for-lengde (bryter klar, funksjon kommer).
- Flaggene håndheves server-side i kassa; eier/admin omgår.

Foundation 2 – Nivåer & prising:
- Nivåer (junior/barber/senior/master) + pris per nivå × tjeneste
  (/admin/nivaer). Riktig pris vises automatisk på booking.
- Nivå + hvilke tjenester en ansatt leverer velges under Ansatte → Rediger.
  Positiv tjeneste-tilknytning (staff_services) erstatter ekskluderingsfilteret.

Migrasjoner 0051–0053 (kjør KJØR-I-SUPABASE.sql).
```

---

## VIKTIG: kjør SQL i Supabase FØR du bruker de nye sidene

Åpne Supabase → SQL Editor → lim inn **hele** `KJØR-I-SUPABASE.sql` → Run.
Den inneholder nå alt som mangler fra denne økta:

- **0049 + 0050** — rabatt/splittbetaling. **Disse lå ikke i KJØR-fila fra før**
  (den sluttet på 0048). Appen din bruker dem allerede, så de må kjøres.
- **0051** — legger `eier` til rolle-enumet (`user_role`). `profiles.role` er en
  ENUM, ikke fri tekst, så verdien må legges til før noen kan få eier-rollen.
- **0052** — eier teller som admin i RLS + `shop_flags` (kasse-bryterne).
- **0053** — nivåer, pris per nivå × tjeneste, og tjeneste-tilknytning per ansatt
  (fyller `staff_services` fra dagens ekskluderinger så booking oppfører seg likt).

Alt er idempotent (`create or replace` / `if not exists`) — trygt å kjøre selv om
0049/0050 allerede er kjørt. Funksjonene bruker `role::text`, så hele skriptet kan
limes inn og kjøres i én omgang.

## Etter SQL: to manuelle steg

1. **Gi Dawit eier-rollen:** Admin → Brukere → finn Dawit → sett rolle **Eier** → Sett.
   (Han får da full tilgang overalt og ingen shop-begrensninger.)
2. **Sett nivå + priser:**
   - Admin → **Nivåer & prising**: fyll inn pris per nivå × tjeneste (tom celle =
     basispris).
   - Admin → **Ansatte → Rediger**: velg nivå på hver ansatt, og huk av hvilke
     tjenester de leverer (ingen avhuket = leverer alt).

## Sett flaggene

Admin → **Shop-innstillinger**: skru rabatt / venn-familie (+ sats) / drop-in uten
kunde av eller på. Standard bevarer dagens oppførsel (rabatt + drop-in PÅ,
venn/familie AV).

---

## Slik henger det sammen (kort)

- **Pris:** `create_booking` priser nå etter valgt barbers nivå
  (`effective_service_price(tjeneste, nivå)`), med basispris som fallback. Booking
  viser samme pris når barber er valgt.
- **Hvem leverer hva:** gikk fra «ekskludering per tjeneste» til «positiv liste per
  ansatt» (`staff_services`). Booking-filteret er uendret (samme resultat), men
  styres nå fra Ansatte → Rediger. Ekskluderings-UI-et i Tjenester er fjernet.
- **Eier:** `is_admin()`/`is_shop_or_admin()` teller nå `eier` som admin i RLS.
  I appen passerer eier alle admin-vakter (`isAdminRole`), og omgår shop-flaggene.

## Testsjekkliste

- [ ] Kjør KJØR-I-SUPABASE.sql uten feil.
- [ ] Gi en testbruker rollen «Eier» → kommer inn i /admin og /kasse, ser rabatt
      selv om rabatt er skrudd av.
- [ ] Shop-innstillinger: skru av «Rabatt» → kasse ser ikke lenger rabattfeltet;
      forsøk på salg med rabatt (via eldre klient) blokkeres server-side.
- [ ] Skru av «Drop-in uten kunde» → hurtigsalg krever kunde.
- [ ] Skru på «Venn/familie» med sats → knapp dukker opp i kassa og trekker %.
- [ ] Nivåer & prising: sett senior-pris på en tjeneste, gi en ansatt nivå «Senior»
      → book den ansatte → riktig pris vises + lagres på bookingen.
- [ ] Booking: en barber som er «avhuket bort» fra en tjeneste vises ikke for den
      tjenesten (som før).

## Kjente begrensninger / bevisste valg

- **Rabatt-flagget er en driftskontroll, ikke en hard sperre.** Fri rabatt og
  venn/familie deler samme rabattfelt. Server tillater en rabatt hvis minst én av
  de to rabatt-bryterne er på (eller eier/admin). Er BEGGE av, blokkeres all
  rabatt. Å skille «fri av, men venn/familie på» ned til kronebeløp krever
  beløpsvalidering mot sats — kan tas senere om ønskelig.
- `dra-for-lengde`-bryteren lagrer bare av/på; selve funksjonen bygges senere.
- `staff_service_exclusions`-tabellen og de gamle unntaks-funksjonene er beholdt
  (urørt, men ubrukt) for trygghets skyld — ingen data slettes.
- Eier-rollen bruker samme RLS-vei som admin. To admin-config-handlinger som
  krevde `role = 'admin'` godtar nå også eier (via `isAdminRole`).

## Filer i denne leveransen

37 filer: 3 nye migrasjoner (0051–0053) + KJØR-I-SUPABASE.sql, 4 nye lib/sider
(shop-settings, levels-queries, shop-innstillinger, nivaer), 2 nye komponenter
(ShopSettingsForm, LevelPricingMatrix), og endringer i auth/roller, kasse,
booking, ansatte- og tjeneste-admin.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline (ingen nye lint-feil i endrede filer).
