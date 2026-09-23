# ENDRINGER — UI-reskin: revisor + ansatt på design-systemet (23. sept 2026)

Dette er **bygg 17**, oppå det som allerede er levert. Fullfører reskin-arbeidet
i «UI & ytelse»: revisor-sidene og ansatt-portalen legges på de delte
primitivene (PageHeader / Card / Button), så alle tre områdene — admin, revisor
og ansatt — ser like ryddige ut.

## Commit-tittel (lim inn i GitHub Desktop)

```
UI: reskin revisor + ansatt på design-systemet (PageHeader/Card/Button)
```

## Commit-beskrivelse (valgfri)

```
Tar i bruk PageHeader (og Button der byttet er rent) på revisor- og
ansatt-sidene, for et enhetlig uttrykk – uten funksjonsendring.

Revisor: Regnskapsoversikt, Perioderapport, Lønnsslipper, Bilag. Eksport-/SAF-T-
knapper flyttet til sidetoppens handlinger der det passet; skjemaer og
disclaimere urørt. revisor/omsetning er utelatt (bruker delt OmsetningView med
egen tittel).
Ansatt: Min side, Mine dokumenter, Mine fravær, Mine timer, Min turnus.

Ingen migrasjon, ingen oppførselsendring.
```

---

## Ingen migrasjon

Ren UI – ingen database-endring. Du trenger IKKE kjøre noe i Supabase.

## Hva som er nytt

- **Revisor**: Regnskapsoversikt, Perioderapport, Lønnsslipper og Bilag har fått
  enhetlig sidetopp; eksport- og SAF-T-lenker ligger nå ryddig i toppen.
- **Ansatt-portalen**: Min side, Mine dokumenter, Mine fravær, Mine timer og Min
  turnus har fått samme sidetopp.
- revisor/omsetning er bevisst utelatt (deler OmsetningView med admin, som har
  egen tittel — unngår dobbel tittel).

## Testsjekkliste

- [ ] Logg inn som revisor: alle sider har lik sidetopp; eksport (Excel/CSV/
      SAF-T) og perioderapport-velgerne virker som før.
- [ ] Logg inn som ansatt: Min side, dokumenter, fravær, timer og turnus har lik
      sidetopp og virker som før.

## Filer i denne leveransen (bygg 17)

9 sider (4 revisor + 5 ansatt) + denne fila. Ingen migrasjon.

## UI & ytelse videre

Reskin er nå komplett for admin, revisor og ansatt. Gjenstår i denne delen:
forenkle **åpningstider**-delen, og **lette tunge sider**. Si ifra hva du vil ta.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn (alle ruter
kompilerer), eslint uendret fra baseline (24). Kun sidetopp/panel-kosmetikk —
ingen data- eller oppførselsendring.
