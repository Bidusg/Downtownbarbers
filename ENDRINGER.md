# ENDRINGER — Rapport & eksport (22. sept 2026)

Dette er **bygg 11**, oppå det som allerede er levert. Starter eposet «Rapport &
eksport» og tar alle tre delene: dag-for-dag kasseoppgjør, penere eksporter
(Excel/PDF), og at revisor får opplastede bilag automatisk.

## Commit-tittel (lim inn i GitHub Desktop)

```
Rapport & eksport: dag-for-dag oppgjør, Excel/PDF-eksport og bilag til revisor
```

## Commit-beskrivelse (valgfri)

```
Del A — Dag-for-dag kasseoppgjør: getDailyReconciliation gir forventet (fra
salget, splitt-bevisst) vs. talt (fra oppgjøret) vs. avvik per dag. Ny «Dag for
dag»-visning i Admin → Kasseoppgjør med «Vis eldre» (bla 30 dager bakover om
gangen). Ingen nye kolonner – bruker cash_settlements fra 0046.

Del B — Penere eksporter: delt xlsx-stil, ny pen Excel av salg (Sammendrag +
detaljerte salg) på /revisor/eksport/xlsx, med knapper på revisor-oversikt og
perioderapport. Kasseoppgjøret kan lastes ned som pen PDF (dag-for-dag) i samme
stil som kundenes kjøpshistorikk.

Del C — Bilag til revisor (migrasjon 0062): privat 'vouchers'-bøtte + tabell.
Dawit laster opp fakturaer/kvitteringer/bilag i Admin → Bilag; de dukker
AUTOMATISK opp hos revisor (Revisor → Bilag), nedlastbare via signerte URL-er.
Revisor er strengt lese-kun (RLS + server-vakter). Nav lagt til begge steder.
```

---

## VIKTIG: kjør migrasjon 0062 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0062**. Uten den finnes ikke bilag-bøtta/
tabellen, og Admin → Bilag / Revisor → Bilag virker ikke. (Del A og B trenger
ingen migrasjon.)

## Slik bruker du det

**Dag-for-dag kasseoppgjør** (Admin → Kasseoppgjør): under oppgjørs-skjemaet
ligger nå «Dag for dag» – forventet, talt og avvik per dag. «Vis eldre» blar
bakover. «Last ned PDF» gir en pen rapport for perioden du har lastet inn.

**Penere eksporter:**
- Revisor → oversikt / perioderapport: «Salg (Excel)» gir en formatert .xlsx
  (sammendrag + alle salg). CSV og SAF-T er som før.
- Admin → Kasseoppgjør → «Last ned PDF»: dag-for-dag-rapport som PDF.

**Bilag til revisor:**
- Admin → **Bilag**: last opp faktura/kvittering/bilag med dato, leverandør,
  type, beløp og mva.
- Revisor → **Bilag**: ser og laster ned alt automatisk – ingen utsending.

## Testsjekkliste

- [ ] Admin → Kasseoppgjør: «Dag for dag» viser dagens + tidligere dager; avvik
      stemmer med et registrert oppgjør. «Vis eldre» henter flere dager.
- [ ] «Last ned PDF» i dag-for-dag gir en pen PDF for perioden.
- [ ] Revisor → perioderapport → «Salg (Excel)» laster ned en formatert .xlsx.
- [ ] Admin → Bilag: last opp en faktura (med beløp/mva) → vises i lista.
- [ ] Logg inn som revisor → Bilag: samme bilag vises, «Last ned» åpner filen.
- [ ] Revisor kan IKKE laste opp eller slette bilag (kun lese/laste ned).

## Filer i denne leveransen (bygg 11)

Del A: ops-queries (getDailyReconciliation), kasseoppgjor/actions + page, ny
DailyReconciliation-komponent.
Del B: ny xlsx/style + xlsx/sales + revisor/eksport/xlsx-rute; ny pdf/kasseoppgjor
+ kasseoppgjor/pdf-rute; knapper på revisor/page + revisor/rapport.
Del C: migrasjon 0062, vouchers-queries, admin/bilag (page+actions+VoucherManager),
revisor/bilag (page+VoucherList), admin-nav + RevisorNav.
Delt: KJØR-I-SUPABASE.sql + denne fila.

## Eposet «Rapport & eksport» er nå komplett

Dag-for-dag oppgjør ✓, penere eksporter (Excel/PDF) ✓, revisor får bilag
automatisk ✓. (Sesong-kupongene som lå under her ble levert i bygg 9.) Neste epos
i planen er **Nettside-CMS** eller **UI & ytelse**.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn (nye ruter
/admin/bilag, /revisor/bilag, /admin/kasseoppgjor/pdf, /revisor/eksport/xlsx),
eslint uendret fra baseline (24). Review-agent bekreftet at dag-for-dag-
beregningen matcher oppgjørets grunnlag, at eksportene er rollestyrte, og at
revisor er strengt lese-kun på bilag (ingen sti lekkes til klienten; nedlasting
kun via korte signerte URL-er).
