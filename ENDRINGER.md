# ENDRINGER — Downtown Barbers (21. sept 2026)

Arbeidstreet inneholder nå **to bygg** som ikke er pushet ennå:
**(1) Grunnmur** (eier-rolle, shop-innstillinger, nivåer & prising) og
**(2) Shop UX** (hurtigsalg-redesign + kunde før betaling). De ligger oppå
hverandre i samme filer (kassa), så enkleste vei er **én samlet push** — eller
to commits der Shop UX bygger på grunnmuren.

---

## Commit-tittel (samlet — anbefalt)

```
Grunnmur (eier + shop-flagg + nivåer) og Shop UX (hurtigsalg-redesign + kunde før betaling)
```

Vil du dele i to commits i GitHub Desktop:

1. **Grunnmur:** `Grunnmur: eier-rolle + shop-innstillinger (flagg) og nivåer & prising`
   — alle filene UNNTATT hurtigsalg-endringene (men `QuickSale.tsx` og
   `src/app/kasse/actions.ts` inneholder begge bygg, så de kan ikke skilles rent;
   ta dem med i commit 2).
2. **Shop UX:** `Shop UX: hurtigsalg-redesign (stegvis) + kunde før betaling (telefonsøk)`

I praksis er én samlet commit renest siden kasse-filene bærer begge bygg.

---

## Bygg 2 — Shop UX (nytt denne runden)

- **Hurtigsalg-redesign:** kassa sitt hurtigsalg er nå en skikkelig **stegvis
  flyt**: Ansatt → Tjeneste → Produkter → Kunde → Rabatt → Betaling, med
  stegindikator og **Neste/Forrige** for manuell overstyring. Ansatt- og
  tjenestevalg går automatisk videre. Oppsummering før betaling.
- **Kunde før betaling:** søk på **telefonnr eller navn** i kunde-steget; treff
  vises (navn + antall besøk), trykk for å knytte salget til den kunden.
  Kobles trygt via kunde-ID — telefonnummeret hentes server-side og når aldri
  nettleseren (samme personvern-linje som ellers i kassa). Kvittering kan sendes
  til kundens registrerte e-post.
- Ingen ny migrasjon i dette bygget. Endrer kun `QuickSale.tsx` og
  `src/app/kasse/actions.ts` (ny valgfri `customerId` som resolves med
  service-role).

## Bygg 1 — Grunnmur (fra tidligere i økta)

- **Eier-rolle:** full tilgang som admin + omgår alle shop-begrensninger.
- **/admin/shop-innstillinger:** av/på for rabatt, venn/familie-rabatt (+ sats),
  drop-in uten kunde, dra-for-lengde (bryter klar, funksjon kommer).
- **/admin/nivaer:** pris per nivå × tjeneste; nivå + tjeneste-tilknytning per
  ansatt (Ansatte → Rediger) erstatter ekskluderingsfilteret. Riktig pris vises
  på booking.

---

## VIKTIG: kjør SQL i Supabase (gjelder grunnmuren)

Supabase → SQL Editor → lim inn **hele** `KJØR-I-SUPABASE.sql` → Run. Den
inneholder nå alt som mangler fra økta:

- **0049 + 0050** — rabatt/splittbetaling (lå ikke i fila fra før; appen bruker
  dem allerede).
- **0051** — legger `eier` til rolle-enumet (`user_role`).
- **0052** — eier teller som admin i RLS + `shop_flags`.
- **0053** — nivåer, pris per nivå × tjeneste, tjeneste-tilknytning per ansatt.

Alt er idempotent, kan limes inn og kjøres i én omgang.

## Manuelle steg etter SQL

1. **Gi Dawit eier-rollen:** Admin → Brukere → sett rolle **Eier**.
2. **Nivå + priser:** Admin → **Nivåer & prising** (pris per nivå × tjeneste),
   og Admin → **Ansatte → Rediger** (nivå + hvilke tjenester hver ansatt leverer).
3. **Shop-flagg:** Admin → **Shop-innstillinger** (av/på + venn/familie-sats).

## Testsjekkliste (Shop UX)

- [ ] Åpne Hurtigsalg → velg ansatt (går automatisk til tjeneste) → velg
      tjeneste → legg til vare → Kunde-steget.
- [ ] Skriv et telefonnr i kunde-søket → eksisterende kunde dukker opp → trykk
      → salget knyttes til den kunden (sjekk i kundekortet etterpå).
- [ ] Fyll inn ny kunde manuelt i stedet → salget oppretter/kobler som før.
- [ ] Skru av «Drop-in uten kunde» → kunde-steget krever kunde før betaling.
- [ ] Neste/Forrige og stegprikkene lar deg hoppe fram og tilbake.
- [ ] Enkel og delt betaling registrerer salget; oppsummeringen stemmer.

## Kjente begrensninger / bevisste valg

- Kunde-lenking bruker server-side oppslag (service-role) + eksisterende
  match-logikk i `record_walkin_sale` — ingen endring i den atomiske salgs-RPC-en.
- Rabatt-flagget er en driftskontroll (ikke hard sperre): server tillater rabatt
  hvis minst én rabatt-bryter er på; begge av = all rabatt blokkert.
- `dra-for-lengde`, «ingen sletting av bookinger» og venn/familie som egen
  booking-type er IKKE i denne pushen (neste Shop UX-runde).

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline.
