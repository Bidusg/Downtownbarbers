# ENDRINGER — UI-reskin: resten av admin på design-systemet (22. sept 2026)

Dette er **bygg 16**, oppå det som allerede er levert. Fortsetter «UI & ytelse»:
resten av admin-sidene legges på de delte primitivene (PageHeader / Card /
Button), så hele admin-området er enhetlig. Bygg 15 tok de fem mest brukte
sidene; her tas ~29 sider til.

## Commit-tittel (lim inn i GitHub Desktop)

```
UI: reskin resten av admin på design-systemet (PageHeader/Card/Button)
```

## Commit-beskrivelse (valgfri)

```
Tar i bruk PageHeader (og Card/Button der det er en ren 1:1-bytte) på de
resterende admin-sidene, for et enhetlig uttrykk – uten funksjonsendring.
Fordelt på tre agenter, integrert og verifisert samlet.

- PageHeader (tittel + beskrivelse + evt. handlinger) på ~29 admin-sider.
- Button på de rene aksent-knappene (submit/lenker) der byttet er trygt.
- Card der et panel var en åpenbar 1:1-match; ellers latt urørt.
- kampanjer (ren redirect) og omsetning (bruker delt OmsetningView med egen
  tittel) er bevisst utelatt – de har ingen egen sidetopp å bytte.

Ingen migrasjon, ingen oppførselsendring. Enkelte undertitler mistet inline-
utheving (kursiv/farge) fordi PageHeader.description er ren tekst – ordene er
beholdt.
```

---

## Ingen migrasjon

Ren UI – ingen database-endring. Du trenger IKKE kjøre noe i Supabase.

## Hva som er nytt

Resten av admin-sidene har fått samme ryddige sidetopp via de delte
komponentene: bl.a. Tjenester, Produkter, Lager, Gavekort, Lønn, Timelister,
Fravær, Brukere, Ansattdokumenter, Dokumenter, Bilag, Kundeklubb, Kuponger,
Oppfølging, Markedsføring, Meldinger, Nøkkeltall, Rapporter, Produktivitet,
Regnskap, Rating, Nettside, Nivåer, Shop-innstillinger, Go-live, Integrasjoner,
Budsjett, Måloppnåelse, og kundekortet.

## Testsjekkliste

- [ ] Bla gjennom admin-menyen: alle sider har lik, ryddig sidetopp (tittel +
      evt. beskrivelse/handlinger til høyre).
- [ ] Sider med skjema (f.eks. Lager «Registrer», Meldinger «Opprett»,
      Markedsføring «Send»): knappene virker som før.
- [ ] Sider med eksport/periode (Regnskap, Rapporter, Nøkkeltall,
      Produktivitet): eksport-lenker og velgere virker som før.
- [ ] Kundekort (Kunder → en kunde): tittelen er kundens navn, «Kjøpshistorikk
      (PDF)» og «Kunde siden …» ligger til høyre.

## Filer i denne leveransen (bygg 16)

~29 admin-sider (page.tsx) + denne fila. Ingen migrasjon.

## UI & ytelse videre

Admin-reskin er nå komplett (mest brukte i bygg 15 + resten her). Gjenstår i
denne delen: samme løft på **revisor** og **ansatt**-sidene, forenkle
**åpningstider**-delen, og lette tunge sider. Si ifra hva du vil ta.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn (alle ruter
kompilerer), eslint uendret fra baseline (24). Spot-sjekket de vanskeligste
(dynamisk kundekort-tittel, eksport-handlinger). Ingen oppførsels- eller
data-endring – kun sidetopp/panel-kosmetikk.
