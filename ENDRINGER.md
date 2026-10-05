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

---

# ENDRINGER — Admin-fiks etter gjennomgang (5. okt 2026, bygg 2)

## Commit-tittel

```
Admin: eier-tilgang til /admin, månedsomsetning konsistent med graf, bilde på eksisterende ansatt
```

## Innhold

- **Eier (Dawit) låses ikke lenger ute av /admin.** `admin/layout.tsx` sjekket
  `role === "admin"` strengt, mens resten av systemet (requireRole, is_admin())
  regner «eier» som admin. En eier-bruker ville blitt sendt til
  «/logg-inn?feil=tilgang» i evig løkke. Nå brukes `isAdminRole()`.
- **«Omsetning måned» stemmer med grafen.** Grafen blander Fixit-historikk
  (t.o.m. 3. okt) med kassesalg, men KPI-flisen brukte kun kassesalg – derfor
  «0 kr» ved siden av en graf med omsetning. Månedstallet bruker nå samme
  skille, og flisen merkes «inkl. Fixit-historikk» når det gjelder. Antall salg
  / snitt / per barber gjelder fortsatt bare kassa (Fixit har kun dagstotaler).
  Gjelder dashboard, Regnskap og Revisor-oversikten.
- **Bilde kan lastes opp på eksisterende ansatt** (Ansatte → Rediger → Bilde).
  Før kunne bilde bare settes ved opprettelse – så barberne som viser initial
  på forsiden kunne ikke få bilde uten å slettes og opprettes på nytt.

Ingen migrasjon. Ingen nye env-variabler.

---

# ENDRINGER — Admin/kasse-forbedringer 4–9 + Fixit-samtykke (5. okt 2026, bygg 3)

## Commit-tittel

```
Admin/kasse: kundeklubb-telling, grupperte tjenester i kassa, telefon i bookingdetaljer, døde hero-felt, datoformat + SQL for Fixit-samtykke og kundevask
```

## Kjør i Supabase → SQL Editor (idempotente)

1. `KJØR-I-SUPABASE-SAMTYKKE-FIXIT.sql` — setter markedsføringssamtykke = ja på
   kundene importert fra Fixit (de ga samtykke der; feltet ble ikke med i
   importen). Rører ikke kunder som har meldt seg av eller som selv har valgt i
   den nye bookingen. Dokumenterer grunnlaget i ny kolonne
   `marketing_consent_source = 'fixit'`. Kjør gjerne FORHÅNDSVISNING-selecten
   øverst i fila først.
2. `KJØR-I-SUPABASE-KUNDEVASK.sql` — fjerner telefonnummer som ligger som
   fornavn («47657179 Bue» → «Bue»), og legger nummeret i phone hvis tomt.

## Kode

- **Kundeklubb-telling** («Bronse: 1000 kunder» ved 6 400+): PostgREST-taket på
  1000 rader. Salg/bookinger pagineres nå, og laveste nivå = eksakt kundetall −
  kunder på høyere nivå.
- **Tjenester i kassa er gruppert per kategori** (Klipp, Kombo, Skjegg,
  Barbering, Tillegg sist) både i Hurtigsalg og «Ny booking». Ny booking
  foreslår nå første ordinære tjeneste (ikke «Ansiktsmassasje» alfabetisk), og
  viser varighet. Hurtigsalg kan fortsatt bare ha én behandling per salg –
  behandling + tillegg i samme salg krever endring i `record_walkin_sale`
  (egen jobb, se under).
- **Bookingdetaljer i kassa viser telefon** (klikkbar `tel:`-lenke) over e-post.
  «Ikke møtt» er deaktivert til timen har startet.
- **Datooverskrift i kalender**: «Mandag 5. oktober» (små bokstaver i måned,
  uten ledende null).
- **Nettside-innstillinger**: hero-feltene som ikke lenger vises (overskrift,
  kursiv overskrift, ingress) ligger nå sammenslått under «Skjulte hero-tekster»
  med forklaring, så ingen lurer på hvorfor endringer ikke synes.

## Ikke gjort (egen jobb hvis ønsket)

- Flere behandlingslinjer (tjeneste + tillegg) i ett hurtigsalg – krever ny
  RPC-signatur (`record_walkin_sale` tar i dag én `service`).
- Gavekort som betalingsmåte direkte i hurtigsalg (i dag: egen Gavekort-side).

---

# ENDRINGER — Hurtigsalg v2: flere linjer + gavekort (5. okt 2026, bygg 4)

## Commit-tittel

```
Hurtigsalg v2: behandling + tillegg i samme salg, gavekort som betaling (ny RPC record_walkin_sale_v2)
```

## Kjør i Supabase → SQL Editor FØR push (idempotent)

`KJØR-I-SUPABASE-HURTIGSALG-V2.sql` – ny funksjon `record_walkin_sale_v2`
(den gamle beholdes), ny loggtabell `gift_card_redemptions`, og sperre mot
negativ gavekortsaldo. Kassa kaller v2 fra og med dette bygget, så SQL-en må
være kjørt før Vercel bygger – ellers feiler hurtigsalg med «function not found».

## Hva er nytt i kassa

- **Tjeneste-steget:** hovedbehandling som før (gruppert per kategori), og
  under den et «Tillegg»-felt med chips (Hårvask, Hodebunnsmassasje …) som kan
  hukes av flere av. Hver blir egen linje på salget (`sale_items`), så
  rapportene per behandlingskategori blir riktige. Auto-hopp videre skjer nå
  bare ved «Ingen behandling» – ellers står man til Neste, så tillegg kan velges.
- **Betalingssteget: «Betal med gavekort».** Skann/skriv kode → saldo vises →
  trekk (standard: så mye som mulig) → resten betales med Kontant/Kort/Vipps
  eller splitt. Dekker gavekortet alt, er det én knapp «Registrer salg».
  Trekket skjer i samme transaksjon som salget (feiler salget, røres ikke
  kortet), logges som betalingslinje «Gavekort» (synlig i kasseoppgjør / per
  betalingsmåte) og i `gift_card_redemptions`.
- Kvitterings-e-posten lister alle behandlingslinjene («Herreklipp 30' + Hårvask»).

## Test etter SQL + push

1. Admin → Gavekort → Nytt gavekort på f.eks. 200 kr (noter koden).
2. Kasse → Hurtigsalg: velg barber, Herreklipp 30' + huk av Hårvask → Neste
   gjennom til Betaling → «Betal med gavekort» → lim inn koden → trekk 200 →
   rest betales med Kort.
3. Sjekk (499 + 179 = 678 kr): Admin → Gavekort viser saldo 0 på kortet,
   Kasseoppgjør viser både «Gavekort 200» og «Kort 478», og salget har to
   behandlingslinjer (Omsetning → klikk dagen).
