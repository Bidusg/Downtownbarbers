# ENDRINGER — Nettside-CMS etappe 2: «Håndverket» redigerbart (22. sept 2026)

Dette er **bygg 13**, oppå det som allerede er levert. Fortsetter Nettside-CMS-
eposet med etappe 2: «Håndverket»-seksjonen på forsiden (tre blokker med bilde,
tittel og tekst) var hardkodet – nå styrer Dawit dem selv fra admin. Samme
mønster som etappe 1 (bilder).

## Commit-tittel (lim inn i GitHub Desktop)

```
Nettside-CMS (etappe 2): «Håndverket»-blokkene redigerbare fra admin
```

## Commit-beskrivelse (valgfri)

```
Migrasjon 0064: site_craft (bilde + tittel + tekst + sort_order + active) på
den offentlige 'site'-bøtta fra 0063. RLS: offentlig lesing, admin skriv.

- Admin → Nettside → «Håndverket»: legg til blokk (bilde + tittel + tekst),
  rediger tekst, omordne (↑/↓), skjul/vis og slett. Skjulte blokker vises kun
  i forhåndsvisningen.
- Forsiden leser aktive blokker fra site_craft, med fallback til de innebygde
  blokkene når ingen er lagt til.
- Live forhåndsvisning (fra etappe 1) dekker også dette.
```

---

## VIKTIG: kjør migrasjon 0064 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0064**. Bruker samme 'site'-bøtte som 0063
(ingen ny bøtte). Uten migrasjonen viser forsiden de innebygde håndverk-blokkene
som før.

## Slik bruker du det

1. Admin → **Nettside** → **Håndverket**.
2. **+ Ny blokk**: velg bilde, skriv tittel og en kort tekst → «Legg til blokk».
3. Rediger tittel/tekst på en eksisterende blokk og trykk **Lagre tekst**.
4. **↑/↓** endrer rekkefølgen, **Skjul/Vis** tar en blokk av/på forsiden,
   **Slett** fjerner den helt.
5. **Forhåndsvisning** nederst viser resultatet (også skjulte blokker).

## Testsjekkliste

- [ ] Admin → Nettside → Håndverket → Ny blokk (bilde + tittel + tekst) → vises.
- [ ] Forhåndsvisning → Oppdater: blokken vises i «Håndverket»-seksjonen.
- [ ] Endre tittel/tekst → Lagre tekst → forhåndsvisning viser endringen.
- [ ] ↑/↓ endrer rekkefølgen på forsiden.
- [ ] Skjul → borte på offentlig forside, synlig i forhåndsvisning. Vis → tilbake.
- [ ] Uten egne blokker: forsiden viser standard-håndverket.

## Filer i denne leveransen (bygg 13)

8 filer: ny migrasjon 0064, KJØR-I-SUPABASE.sql, site-images-lib (getSiteCraft),
admin/nettside actions + page, ny SiteCraftManager-komponent, forsiden (page.tsx)
+ denne fila.

## Nettside-CMS videre

Etappe 1 (hero + galleri-bilder) ✓, etappe 2 (Håndverket-blokker) ✓. Mulig
etappe 3 senere: flere seksjoner / mer fri plassering, og evt. utkast/publiser
for tekst. Ellers gjenstår **UI & ytelse** i planen.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline (24). Review-agent bekreftet at det er en trygg speiling av
etappe 1 – kun admin/eier kan endre (server-vakt + RLS), forhåndsvisning av
skjulte blokker er låst til admin, og forsiden faller trygt tilbake til
standardinnholdet.
