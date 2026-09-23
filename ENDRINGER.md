# ENDRINGER — UI: forenklet åpningstider (23. sept 2026)

Dette er **bygg 18**, oppå det som allerede er levert. Del av «UI & ytelse»:
åpningstider-redigeringen (i Nettside-innstillingene) var for kronglete — sju
rader med to klokkeslett hver og en «Stengt»-avkrysning der *avkrysset = stengt*
(motsatt av hva folk forventer). Nå er den raskere å fylle ut og lettere å lese.

## Commit-tittel (lim inn i GitHub Desktop)

```
UI: forenklet åpningstider (rask utfylling + tydelig åpen/stengt)
```

## Commit-beskrivelse (valgfri)

```
Åpningstider i Nettside-innstillingene er forenklet:
- Rask utfylling: sett fra/til én gang og trykk «Bruk på man–fre» eller
  «Bruk på alle dager» for å fylle flere dager i ett grep.
- Hver dag har nå en tydelig Åpen/Stengt-bryter i stedet for en «Stengt»-
  avkrysning (der avkrysset betydde stengt — motsatt av forventet).
- Stengte dager viser «Ingen ledige timer» i stedet for to nedtonede felt.

Samme datamodell (HoursMap, dager 0–6). Ingen migrasjon, ingen oppførselsendring
mot forsiden eller booking.
```

---

## Ingen migrasjon

Ren UI – ingen database-endring. Du trenger IKKE kjøre noe i Supabase.

## Hva som er nytt

- **Rask utfylling**: øverst i åpningstider-boksen kan du sette et felles fra/til
  og trykke «Bruk på man–fre» eller «Bruk på alle dager». Da slipper du å skrive
  samme klokkeslett sju ganger.
- **Tydelig Åpen/Stengt-bryter** per dag erstatter den forvirrende «Stengt»-
  avkrysningen. «Åpen» fyller dagen med det du har satt i rask utfylling; «Stengt»
  fjerner tidene.
- Stengte dager viser teksten «Ingen ledige timer» i stedet for to nedtonede
  klokkeslettfelt.

## Testsjekkliste

- [ ] Åpne Admin → Nettside. Sett fra 09:00 / til 18:00, trykk «Bruk på man–fre»
      → mandag–fredag får 09:00–18:00, lørdag/søndag urørt.
- [ ] Trykk «Stengt» på en dag → feltene forsvinner, «Ingen ledige timer» vises.
      Trykk «Åpen» igjen → tidene kommer tilbake.
- [ ] Lagre → forsiden og booking viser de nye tidene (uendret lagrings-logikk).

## Filer i denne leveransen (bygg 18)

- `src/components/admin/SiteSettingsForm.tsx` — forenklet åpningstider-UI.
- denne fila.

Ingen migrasjon.

## UI & ytelse videre

Reskin er komplett (admin/revisor/ansatt), og åpningstider er nå forenklet.
Gjenstår siste punkt i denne delen: **lette tunge sider** (gjøre de tyngste
sidene raskere/lettere). Si ifra når du vil ta den.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn (alle ruter
kompilerer), eslint uendret fra baseline (24 problemer: 14 feil, 10 advarsler).
Kun UI i redigeringsskjemaet — ingen data- eller oppførselsendring.
