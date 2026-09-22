# ENDRINGER — Dra-for-lengde i kalenderen (22. sept 2026)

Dette er **bygg 10**, oppå det som allerede er levert. Tar den utsatte Shop
UX-biten: dra i nederkanten av en booking i dagskalenderen for å endre lengden.
Styres av flagget «Dra-for-lengde» (Admin → Shop-innstillinger), som allerede
fantes — nå er det koblet.

## Commit-tittel (lim inn i GitHub Desktop)

```
Kalender: dra-for-lengde (endre bookingens varighet ved å dra nederkanten)
```

## Commit-beskrivelse (valgfri)

```
Migrasjon 0061: set_booking_length (security definer) – shop/admin endrer en
bookings sluttid. Starttid beholdes; min 5 min; ingen overlapp med andre aktive
bookinger/blokker for samme barber. Shop kan ikke oppdatere bookings direkte,
så endringen går via RPC (speiler reschedule_booking).

- DayCalendar: dra-håndtak nederst på hver aktive booking (skjult for
  fullført/ikke-møtt og når flagget er av). Live høyde + sluttid mens man drar,
  5-min snapp, og en feilmelding hvis den nye lengden overlapper.
- Kalender-siden sender canResize fra drag_for_length_enabled (eier/admin omgår).
```

---

## VIKTIG: kjør migrasjon 0061 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0061**. Uten den finnes ikke
set_booking_length, og dra-for-lengde vil gi feil.

## Slå på funksjonen

Admin → **Shop-innstillinger** → slå på **«Dra-for-lengde i kalender»**. (Eier/
admin har den alltid på.) Uten flagget vises ingen dra-håndtak i kassa.

## Slik bruker du det

1. Åpne Kasse → **Kalender**.
2. Hold på det lille håndtaket i **nederkanten** av en booking og dra opp/ned.
   Lengden snapper til 5 minutter, og den nye sluttiden vises mens du drar.
3. Slipp for å lagre. Overlapper den nye lengden en annen booking eller blokk
   hos samme barber, får du en melding og lengden beholdes.

Fullførte og ikke-møtte timer kan ikke endres. Å flytte en booking til en annen
barber gjøres fortsatt ved å dra hele blokken (uendret).

## Testsjekkliste

- [ ] Slå på «Dra-for-lengde» i Shop-innstillinger → håndtak dukker opp i kalenderen.
- [ ] Dra nederkanten på en booking → lengden endres, sluttid vises mens du drar.
- [ ] Prøv å dra så den overlapper neste booking → melding, lengden beholdes.
- [ ] Fullført/ikke-møtt time → intet håndtak.
- [ ] Slå av flagget (som shop, ikke eier) → håndtakene forsvinner.
- [ ] Dra hele blokken til en annen barber → fungerer som før (PIN-godkjenning).

## Filer i denne leveransen (bygg 10)

6 filer: ny migrasjon 0061, KJØR-I-SUPABASE.sql, kasse/actions (setBookingLength),
kalender-siden (canResize), DayCalendar (dra-håndtak) + denne fila.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline (24). Review-agent bekreftet at RPC-en er trygg (kun
shop/admin, låser raden, min 5 min, overlapp-sjekk), at dra-håndtaket ikke
kolliderer med dag-sveip / barber-flytt / åpne-booking, og at flagget gjemmer
håndtakene når det er av.
