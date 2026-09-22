# ENDRINGER — UI & ytelse: admin-reskin på design-systemet (22. sept 2026)

Dette er **bygg 15**, oppå det som allerede er levert. Starter «UI & ytelse»:
de mest brukte admin-sidene legges på de delte design-primitivene
(PageHeader / Card / Button), så alt får samme rytme og hierarki.

## Commit-tittel (lim inn i GitHub Desktop)

```
UI: admin-reskin – Dashboard, Bookinger, Kasseoppgjør, Ansatte, Kunder på design-systemet
```

## Commit-beskrivelse (valgfri)

```
Tar i bruk de eksisterende primitivene (PageHeader/Card/Button) på de fem mest
brukte admin-sidene, for et enhetlig uttrykk – uten funksjonsendring.

- PageHeader (tittel + beskrivelse + evt. handlinger) på Dashboard, Bookinger,
  Kasseoppgjør, Ansatte og Kunder – erstatter ad-hoc-toppene.
- Card på panelene (Dashboard-panelene, «Dagens salg fordelt på betalingsmåte»).
- Button på aksent-knapper/-lenker («Opprett kunde», «Se regnskap»).

Ingen migrasjon, ingen oppførselsendring. Eneste synlige delta er at panel-
luften harmoniseres (p-6 → p-5, Card sin standard).
```

---

## Ingen migrasjon

Denne leveransen er ren UI – ingen database-endring. Du trenger IKKE kjøre noe
i Supabase.

## Hva som er nytt

Fem admin-sider har fått samme, ryddige topp og panel-uttrykk via de delte
komponentene som allerede lå i kodebasen:

- **Dashboard**: PageHeader + de tre panelene som Card, «Se regnskap» som Button.
- **Bookinger**: PageHeader.
- **Kasseoppgjør**: PageHeader, betalingsmåte-panelet som Card.
- **Ansatte**: PageHeader.
- **Kunder**: PageHeader (med antall til høyre), «Opprett kunde» som Button.

## Testsjekkliste

- [ ] Åpne Admin → Dashboard, Bookinger, Kasseoppgjør, Ansatte, Kunder: alle har
      lik, ryddig sidetopp.
- [ ] Kunder → «+ Ny kunde» → fyll ut → «Opprett kunde»: kunden opprettes som før.
- [ ] Dashboard → «Se regnskap»: går til /admin/regnskap.
- [ ] Kasseoppgjør: panelene ser like ut, dag-for-dag og oppgjør virker som før.

## Filer i denne leveransen (bygg 15)

6 filer: admin/page (Dashboard), admin/bookinger, admin/kasseoppgjor,
admin/ansatte, admin/kunder + denne fila. (Ingen migrasjon.)

## UI & ytelse videre

Admin-reskin på de mest brukte sidene ✓. Neste steg i denne delen: samme løft på
resten av admin, så revisor- og ansatt-sidene, forenkle åpningstider-delen, og
gjøre tunge sider lettere. Si ifra hva du vil ta.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline (24). Review-agent bekreftet at JSX-nestingen er riktig, at
skjema-innsending og lenkenavigasjon er bevart, og at layouten er uendret bortsett
fra den tilsiktede padding-harmoniseringen.
