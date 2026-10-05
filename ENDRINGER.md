# ENDRINGER — Go-live-polish: forside + booking + språk (5. okt 2026)

Dette bygget retter funnene fra den fulle gjennomgangen av forsiden og
booking-veiviseren (testet live på Vercel-prod, mobil + desktop), og utvider
språkbyttet NO/EN til **alle** kundevendte sider.

## Commit-tittel (lim inn i GitHub Desktop)

```
Go-live-polish: booking-fiks, NO/EN på alle kundesider, favicon/SEO, header med kun telefon-ikon
```

## Commit-beskrivelse (valgfri)

```
Booking-veiviser
- «Maskinklipp/Lineup» kolliderte med «+ Legg til» på mobil (ord uten mellomrom) – fikset.
- Intro: «Tre steg: tjenester, tid og kontakt» (var «Fire steg»).
- Oppsummering før bekreftelse: «Mandag 5. oktober kl. 14:00», én linje per
  tjeneste med barber + tillegg + pris, og totalsum (var ISO-dato uten tillegg).
- Kurven har totalsum + forklaring på «fra»-pris; «✓ I kurven» på tjenestekort.
- Kontaktsteget er et ekte <form>: synlige labels, autocomplete (navn/e-post/
  telefon), Enter sender, og en hint-tekst når knappen er deaktivert.
- «Hvordan hørte du om oss?» er nedtrekk (Google / sosiale medier / venn /
  gikk forbi / fast kunde / annet) – tellbar for anbefaling-%-KPI-en.
- Stegfanene (1/2/3) kan klikkes for å gå tilbake; dag-/tid-knapper har
  tilgjengelige navn og aria-pressed.
- Tjenestenavn, kategorier, beskrivelser, tillegg og barber-titler oversettes
  nå også i veiviseren (var norsk i EN-modus).
- Mindre topp-luft på /booking og /butikk (headeren er ikke overlay der).

Forside
- Header: kun telefon-ikon (ingen nummer) – nummeret ligger i aria-label/title.
- Ankerlenker (Team, Tjenester …) lander ikke lenger under den faste headeren.
- Stillingstitler normaliseres («barber» → «Barber», «senior» → «Senior Barber»)
  og oversettes i Teamet.
- Barneklipp-beskrivelsen («under 12 år») treffer nå EN-oversettelsen.
- JSON-LD HairSalon (adresse, telefon, åpningstider, bookinglenke) for Google.

Språk NO/EN – nye sider dekket
- /booking/bekreftelse, 404, /vurder, /min-side (inkl. kommende timer og
  feilmeldinger), /avbestill. Datoer formateres etter valgt språk.
- Back-office (admin/kasse/ansatt/revisor) og logg-inn forblir norsk med vilje.

Favicon / deling / SEO
- Ekte favicon fra logoen (favicon.ico + icon.svg + apple-icon.png) – erstatter
  Next.js-standardikonet.
- OpenGraph/Twitter-metadata + opengraph-image.jpg (forhåndsvisning når lenken
  deles på Instagram/Facebook/iMessage), robots.txt og sitemap.xml.
```

---

## Ingen migrasjon

Ingen SQL. Ingen nye env-variabler (OG-/sitemap-URL bruker `siteUrl()` som
allerede følger `NEXT_PUBLIC_SITE_URL` → Vercel-prod-domene → downtownbarbers.no).

## Å gjøre i admin (ikke kode)

- Deaktiver test-barbererne **David, Vani, Soren** under /admin/ansatte (de er
  bookbare live og vises i Teamet), og legg inn Dawit + Riccardo.
- Last opp bilder på barberne som fortsatt viser initial.
- Sett nivå per barber (Kochari = Barber, Qasim + Riccardo = Senior, Dawit = Master).
- Google Places-nøkkel + Place-ID på /admin/rating → ekte stjerner/antall i hero
  (i dag vises fallback «4,5 / 5 · 6 vurderinger»).

## Test etter push

- /booking på mobil: ingen kollisjon på «Maskinklipp/Lineup»; legg til tjeneste +
  tillegg → velg tid → sjekk at oppsummeringen viser dato i klartekst, barber,
  tillegg og totalsum; bekreft én ekte booking.
- Bytt til EN: tjenestenavn/tillegg i veiviseren skal være engelske.
- Forside: klikk «Team» i menyen → «TEAMET»-etiketten skal være synlig under headeren.
- Del forsidelenken i en melding/iMessage → bilde + tittel skal vises.
- Fanen i nettleseren skal vise Downtown-logoen (hard-refresh/ny fane).
