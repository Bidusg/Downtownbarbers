# ENDRINGER — Generell uke-rotasjon (21. sept 2026)

Dette er **bygg 5**, oppå det som allerede er levert (grunnmur, Shop UX, Timeplan-
del 1). Fullfører Timeplan-eposet.

## Commit-tittel (lim inn i GitHub Desktop)

```
Timeplan: generell uke-rotasjon (A/B/C… valgfritt antall uker)
```

## Commit-beskrivelse (valgfri)

```
Generaliserer A/B-turnusen til et rotasjonsmønster med valgfritt antall uker
(1–6). Mønsteret defineres én gang (antall uker + anker); systemet regner ut
hvilken uke (1..N) som gjelder for enhver dato framover – uten årsskifte-glitch
(teller uker fra ankeret, ikke ISO-ukenummer).

- Migrasjon 0056: generalisert turnus_week_parity + rotasjons-config i settings.
  Seeder N=2 med et anker som REPRODUSERER dagens A/B, så ingenting forskyves.
- Admin → Timelister: «Rotasjon»-kontroll (antall uker + «start på denne uken»),
  uke-faner A..N, og parity-valg (Hver uke / Uke A..N) i turnus, bulk-turnus og
  ukeplan. available_slots er uendret (funker for enhver N).
```

---

## VIKTIG: kjør migrasjon 0056 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0056**. Den bevarer dagens A/B automatisk.

## Slik bruker du det

1. Admin → Timelister → **Rotasjon**: velg antall uker (f.eks. 3 = A/B/C). Huk av
   «Start rotasjonen på denne uken» hvis du vil at inneværende uke skal være Uke A,
   og Lagre.
2. Uke-fanene (A, B, C …) lar deg sette ulik turnus per uke i mønsteret. «Hver uke»
   gjelder alle.
3. Bulk-turnus og «Ny/rediger vakt» har nå samme uke-valg (Hver uke / Uke A..N).

## Testsjekkliste

- [ ] Sett rotasjon til 3 uker + «start på denne uken» → fanene viser A, B, C, og
      «Denne uken er Uke A».
- [ ] Legg en vakt på «Uke C» for en ansatt → sjekk at den kun vises i uke C i
      ukeplanen, og at kunder bare får de tidene i den uken.
- [ ] Sett rotasjon tilbake til 2 uker → A/B som før (ingenting forskjøvet).
- [ ] Booking på nett: velg en dato langt fram → riktig uke i rotasjonen brukes.

## Filer i denne leveransen (bygg 5)

10 filer: ny migrasjon 0056, KJØR-I-SUPABASE.sql, ny lib `turnus.ts`,
ops-queries.ts, timelister/actions.ts, timelister/page.tsx, ny komponent
RotationControl, og BulkTurnusForm/StaffHoursManager/WeekSchedule (generalisert)
+ denne fila.

## Timeplan-eposet er nå komplett

Bulk-turnus ✓, blokker booking ✓, generell uke-rotasjon ✓. Neste epos i planen er
Produkt / lager / strekkode.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline. Rotasjonsformelen simulert og bekreftet (N=2 gir A/B, N=3/4
roterer riktig, fortidsdatoer håndteres); seeding bevarer dagens A/B.
