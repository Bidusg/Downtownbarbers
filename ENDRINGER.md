# ENDRINGER — Shop UX: ingen sletting + venn/familie-type (21. sept 2026)

Grunnmuren og forrige Shop UX-runde er allerede committet og pushet (remote står
på `9efe2ca`). Dette er **neste commit** oppå det – bygg 3.

## Commit-tittel (lim inn i GitHub Desktop)

```
Shop UX: ingen sletting av bookinger (no-show) + venn/familie som salgstype
```

## Commit-beskrivelse (valgfri)

```
Ingen sletting/skjuling av no-show:
- En passert time kan ikke avlyses av kasse (må markeres «Ikke møtt»); en
  passert «ikke møtt» kan ikke «angres» av kasse. Eier/admin kan overstyre.
  Å angre et fullført salg (feiltrykk) er fortsatt lov for kasse.
- Håndheves i cancelBooking, reopenBooking og setBookingStatus; tydelig
  feilmelding i kassa.

Venn/familie som egen salgstype (migrasjon 0054):
- To knapper i kassa (Venn/Familie) tagger salget (relation_type) og trekker
  satsen (beregnes live). Rabatt håndheves type-bevisst.
- Bruk/hyppighet vises på Admin → Rapporter → Produktivitet.
```

---

## VIKTIG: kjør migrasjon 0054 i Supabase

Supabase → SQL Editor. Du kan enten kjøre **hele** `KJØR-I-SUPABASE.sql` på nytt
(idempotent), eller bare den nye biten nederst – **0054** (legger
`relation_type` på `sales`). Uten den virker ikke venn/familie-taggingen.

## Testsjekkliste

- [ ] Prøv å «Avlys» en passert, ubetalt time i kassa → blokkeres med melding om
      å bruke «Ikke møtt».
- [ ] Marker den «Ikke møtt» → prøv «Angre» som kasse → blokkeres (eier/admin kan).
- [ ] Avlys en FREMTIDIG time → går fint. Angre et fullført salg → går fint.
- [ ] Trykk «Venn» i kassa → rabatt trekkes; legg til en vare → rabatten
      oppdateres automatisk (live). Fullfør → salget er tagget.
- [ ] Admin → Rapporter → Produktivitet → «Venn/familie-salg» viser antall + kr.

## Filer i denne leveransen (bygg 3)

12 filer: ny migrasjon 0054, KJØR-I-SUPABASE.sql, kasse/actions.ts,
admin/bookinger/actions.ts, QuickSale/PaymentControls/ShopBookingList/
BookingDetailModal, admin/BookingManager, report-queries.ts og
rapporter/produktivitet/page.tsx (+ denne fila).

## Kjente begrensninger / bevisste valg

- «Kunde før betaling»: en valgt kunde uten e-post OG uten telefon kan i sjeldne
  tilfeller opprette en dublett i stedet for å koble (matcher på e-post/telefon).
- Rabatt-flagget håndhever *type* (fri vs venn/familie), men ikke at
  venn/familie-beløpet er nøyaktig satsen.
- Gjenstår i Shop UX: dra-for-lengde i kalenderen (flagget finnes alt).

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline. Verifiseringsgjennomgang med subagent; funn adressert.
