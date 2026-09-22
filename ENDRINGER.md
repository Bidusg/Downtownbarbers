# ENDRINGER — Nettside-CMS etappe 3: Om oss + banner redigerbart (22. sept 2026)

Dette er **bygg 14**, oppå det som allerede er levert. Fullfører de siste
hardkodede bildene på forsiden: **«Om oss»-bildet** og **neon-banneret** kan nå
byttes fra admin. Banner-teksten bruker nå slagordet fra innstillingene.

## Commit-tittel (lim inn i GitHub Desktop)

```
Nettside-CMS (etappe 3): «Om oss»- og banner-bilde redigerbart + banner-tekst fra slagord
```

## Commit-beskrivelse (valgfri)

```
Migrasjon 0065: utvider site_images.section til hero/gallery/about/banner (samme
'site'-bøtte som 0063). «Om oss» og banneret er enkeltbilder – forsiden bruker
det første aktive, med fallback til de innebygde.

- Admin → Nettside → Bilder: to nye slots, «Om oss»-bilde og Banner-bilde
  (bilde, ikke klipp). Samme opplasting/skjul/slett som de andre seksjonene.
- Forsiden: Om oss-bildet og neon-banneret leses fra CMS med fallback; banner-
  teksten viser nå slagordet (site_settings.slogan) i stedet for hardkodet tekst.
```

---

## VIKTIG: kjør migrasjon 0065 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0065**. Uten den godtar ikke databasen de
nye seksjonene (about/banner), og opplasting til dem feiler. Ingen ny bøtte –
bruker 'site' fra etappe 1.

## Slik bruker du det

1. Admin → **Nettside** → **Bilder**.
2. **«Om oss»-bilde:** last opp ett bilde → erstatter bildet i «Om oss»-seksjonen.
3. **Banner-bilde:** last opp ett bilde → erstatter neon-banneret.
4. Bruk **Forhåndsvisning** for å se resultatet. «Skjul» tar bildet av forsiden
   (da vises fallback-bildet igjen).
5. Banner-teksten styres av **slagordet** øverst i Nettside-skjemaet.

## Testsjekkliste

- [ ] Admin → Nettside → Bilder: «Om oss»-bilde → last opp → forhåndsvisning
      viser nytt bilde i «Om oss».
- [ ] Banner-bilde → last opp → neon-banneret bytter bilde.
- [ ] Endre slagordet i skjemaet → banner-teksten oppdateres.
- [ ] Skjul et av dem → fallback-bildet vises igjen på forsiden.
- [ ] Uten opplasting: forsiden viser standardbildene som før.

## Filer i denne leveransen (bygg 14)

7 filer: ny migrasjon 0065, KJØR-I-SUPABASE.sql, site-images-lib (SiteSection),
admin/nettside actions (validering), SiteImagesManager (nye slots), forsiden
(page.tsx) + denne fila.

## Nettside-CMS er nå bredt dekket

Etappe 1 (hero + galleri) ✓, etappe 2 (Håndverket) ✓, etappe 3 (Om oss + banner
+ banner-tekst) ✓. Alle de store forside-bildene og -tekstene er nå redigerbare
fra admin. Gjenstår i planen: **UI & ytelse**. (Videre CMS-finpuss – f.eks.
CTA-seksjonens tekster – kan tas ved behov.)

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline (24). Bygger på det samme, allerede review'de CMS-mønsteret
(site_images + admin-vakt + RLS + forhåndsvisning + fallback) – kun seksjons-
listen og to enkeltbilde-oppslag er nytt.
