# ENDRINGER — Nettside-CMS etappe 1: redigerbare bilder + preview (22. sept 2026)

Dette er **bygg 12**, oppå det som allerede er levert. Starter det største eposet,
**Nettside-CMS**, med etappe 1. Teksten på forsiden var allerede redigerbar
(site_settings); det som manglet var **bildene** – hero-karusellen og galleriet
var hardkodet. Nå kan Dawit styre dem selv fra admin, med live forhåndsvisning.

## Commit-tittel (lim inn i GitHub Desktop)

```
Nettside-CMS (etappe 1): redigerbare hero-/galleri-bilder + live forhåndsvisning
```

## Commit-beskrivelse (valgfri)

```
Migrasjon 0063: offentlig 'site'-storage-bøtte + site_images (seksjon hero/gallery,
kind image/video, path, alt, sort_order, active). RLS: offentlig lesing (forsiden
er offentlig), admin skriv.

- Admin → Nettside: ny «Bilder»-seksjon – last opp, omordne (↑/↓), skjul/vis og
  slett bilder i hero-karusellen og galleriet. Hero tar bilde ELLER klipp;
  galleriet tar bilder. Nye bilder legger seg bakerst.
- Live «Forhåndsvisning»: forsiden vises i en ramme i forhåndsvisningsmodus
  (?preview=1, kun for admin), så også skjulte/upubliserte bilder er med. «Skjul»
  tar et bilde av den offentlige forsiden uten å slette det.
- Forsiden leser aktive bilder fra site_images, med fallback til de innebygde
  bildene når ingen er lastet opp (ingenting brekker før Dawit har lagt til noe).
```

---

## VIKTIG: kjør migrasjon 0063 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0063**. Uten den finnes ikke 'site'-bøtta/
tabellen, og bilde-håndteringen virker ikke. (Forsiden fungerer som før med de
innebygde bildene til du har kjørt migrasjonen og lastet opp egne.)

## Slik bruker du det

1. Admin → **Nettside** → **Bilder**.
2. **Hero-karusell:** last opp bilder eller klipp; ↑/↓ endrer rekkefølgen.
3. **Galleri:** last opp bilder (med alt-tekst).
4. **Forhåndsvisning** nederst: se forsiden med endringene. Trykk **Oppdater**
   etter at du har lastet opp. Skjulte bilder vises her, men ikke på den
   offentlige forsiden før du trykker **Vis**.
5. **Skjul** tar et bilde midlertidig av forsiden; **Slett** fjerner det helt.

## Testsjekkliste

- [ ] Admin → Nettside → Bilder: last opp et hero-bilde → dukker opp i lista.
- [ ] Forhåndsvisning → Oppdater: bildet vises i hero-karusellen.
- [ ] «Skjul» → åpne forsiden (uten preview) i egen fane: bildet er borte der,
      men fortsatt synlig i forhåndsvisningen. «Vis» → tilbake på forsiden.
- [ ] Last opp flere → ↑/↓ endrer rekkefølgen på forsiden.
- [ ] Galleri: last opp et bilde med alt-tekst → vises i «Fra stolen».
- [ ] Uten opplastede bilder: forsiden viser fortsatt standardbildene.

## Filer i denne leveransen (bygg 12)

9 filer: ny migrasjon 0063, KJØR-I-SUPABASE.sql, ny site-images-lib, admin/nettside
actions + page, nye komponenter SiteImagesManager + SitePreview, forsiden
(page.tsx) + denne fila.

## Nettside-CMS videre (senere etapper)

Etappe 1 (bilder + preview) ✓. Senere: flere seksjoner i innholdsmodellen
(plassering/rekkefølge på flere blokker), og evt. utkast/publiser-flyt for tekst.

**Heads-up (utenfor denne leveransen):** de frittstående skriptene
`supabase/setup.sql` / `setup_all.sql` definerer `is_admin()` som kun `admin`
(ikke `eier`). Migrasjonskjeden (0052, som du kjører via KJØR-fila) er riktig og
dekker eier – så dette treffer bare hvis et miljø settes opp fra de gamle
skriptene. Verdt å rydde ved en senere anledning.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline (24). Review-agent bekreftet at kun admin/eier kan laste
opp/endre bilder (både server-vakt og RLS), at forhåndsvisning av skjulte bilder
er låst til admin, og at forsiden faller trygt tilbake til standardbildene.
