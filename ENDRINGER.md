# ENDRINGER — Timeplan: blokker booking + bulk-turnus (21. sept 2026)

Dette er **bygg 4**, oppå det som allerede er levert. Bygg 4 rører andre filer
enn bygg 3 (timelister/turnus vs. kasse), så de kan committes hver for seg – bare
`KJØR-I-SUPABASE.sql` deles (bygg 3 la til 0054, bygg 4 la til 0055).

## Commit-tittel (lim inn i GitHub Desktop)

```
Timeplan: blokker booking (alle ansatte) + bulk-turnus
```

## Commit-beskrivelse (valgfri)

```
Blokker booking (migrasjon 0055):
- Admin sperrer hele eller deler av en dag for booking på ALLE ansatte
  (helligdag, arrangement, felles fri) – som Fixit. Blokkerte tider forsvinner
  fra ledige tider i booking (available_slots respekterer blokkeringene).
- Admin → Timelister → «Blokker booking»: legg til (hel dag / tidsintervall +
  grunn), se kommende blokkeringer, fjern.

Bulk-turnus:
- Sett arbeidstid for flere ukedager (og uke A/B/hver uke) på én gang, f.eks.
  man–fre 09–17, med valgfri «erstatt eksisterende». Admin → Timelister →
  «Bulk-turnus».
```

---

## VIKTIG: kjør migrasjon 0055 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0055** (ny `booking_blocks`-tabell +
oppdatert `available_slots`). Uten den virker ikke blokker-booking.

Bulk-turnus trenger ingen migrasjon (bruker eksisterende `staff_hours`).

## Testsjekkliste

- [ ] Admin → Timelister → «Blokker booking» → legg til en HEL dag fram i tid →
      prøv å booke den dagen på nettsiden → ingen ledige tider for noen barber.
- [ ] Legg til en DELVIS blokkering (f.eks. 12–14) → de timene forsvinner fra
      ledige tider, resten av dagen er åpen.
- [ ] Fjern blokkeringen → tidene kommer tilbake.
- [ ] «Bulk-turnus» → velg ansatt, huk av man–fre, 09–17, «Hver uke» → Lagre →
      sjekk at turnusen dukker opp i ukeplanen (uke A og B).
- [ ] Bulk med «Erstatt eksisterende» → gamle vakter for de valgte dagene byttes ut.

## Filer i denne leveransen (bygg 4)

7 filer: ny migrasjon 0055, KJØR-I-SUPABASE.sql, ops-queries.ts,
timelister/actions.ts, timelister/page.tsx, og to nye komponenter
(BulkTurnusForm, BookingBlocksManager) + denne fila.

## Gjenstår i Timeplan-eposet

- Generell **uke-rotasjon** (A/B/C/D… med valgfritt antall uker, ikke bare A/B).

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline. available_slots verifisert identisk med 0028 bortsett fra
de to blokk-sjekkene.
