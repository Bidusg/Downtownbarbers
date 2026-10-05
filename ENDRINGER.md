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

---

# ENDRINGER — Lønnsbekreftelse + «ingen tilgang»-side + oppdatert sluttrapport (5. okt 2026, bygg 5)

## Commit-tittel

```
Revisor: bekreftelse med mottakere før lønnsutsending; egen «ingen tilgang»-side; oppdatert SLUTTRAPPORT
```

## Innhold

- **Lønnsoversikter:** «Generer og send» viser nå en bekreftelse inne i siden
  med måned, hver mottaker og beløp, og «Ja, generer og send til N» – før noe
  sendes. Erstatter nettleserens window.confirm (som ikke kunne vise navn).
- **/ingen-tilgang:** en innlogget bruker som åpner en side rollen ikke har
  (kasse → /admin) får en side som sier hvem hen er logget inn som, hvilken
  rolle, med knapp tilbake til egen side og Logg ut – i stedet for å havne på
  innloggingsskjemaet mens hen fortsatt er logget inn. Gjelder alle
  rollevakter (`requireRole` + admin-layout). Ikke innlogget → fortsatt /logg-inn.
- **SLUTTRAPPORT.md** er skrevet om med status per 5. okt, alt levert i dag,
  admin-oppgavene før live (inkl. avklaringen om at David/Vani/Soren/Mehetabel
  er ekte barberer og augustsalget er ekte), go-live-blokkere og åpne punkter.

Ingen migrasjon. Ingen nye env-variabler.

---

# ENDRINGER — Perioderapport med Fixit-historikk (5. okt 2026, bygg 6)

## Commit-tittel

```
Revisor: perioderapport (kvartal/halvår/helår) tar med Fixit-historikk i omsetning og per måned
```

Perioderapporten brukte bare `sales`, så Fixit-tiden (dagstotaler i
`fixit_turnover_daily` t.o.m. 3. okt) manglet – Q3 2026 viste f.eks. bare
august-importen. Nå bruker omsetning og månedsfordelingen samme skille som
grafene og måneds-KPI-en (Fixit t.o.m. cutover, kassa etter). Antall salg,
snitt, per barber og per betalingsmåte dekker fortsatt bare dager med
salgslinjer, og siden sier det eksplisitt når Fixit-tall er med.
Ingen migrasjon.

---

# ENDRINGER — Sikkerhet & personvern før live (5. okt 2026, bygg 7)

## Commit-tittel

```
Sikkerhet/personvern: CSP + sikkerhetsheadere, selvhostede fonter, kart uten Google-iframe, personvernside, honeypot + rate-limit på booking
```

## Innhold

- **Sikkerhetsheadere** (`next.config.ts`): Content-Security-Policy (eksterne
  script sperret, frame-ancestors 'self' – admin-forhåndsvisningen trenger
  egen origin), X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff,
  Referrer-Policy, Permissions-Policy (kamera kun egen origin – strekkode-
  skanneren). Verifisert lokalt: ingen CSP-brudd på forsiden.
- **Fonter serveres fra eget domene** (`src/fonts`, variable Inter + Playfair
  Display, OFL-lisens vedlagt) via `next/font/local`. Null kall til Google fra
  besøkende, og bygget er ikke lenger avhengig av nett.
- **Kart i footer** er et klikk-kort som åpner Google Maps i ny fane – ingen
  Google-iframe/cookies før besøkende selv klikker.
  → Med disse to er siden banner-fri med god samvittighet: eneste cookie er
  Supabase-innlogging for ansatte (strengt nødvendig).
- **/personvern** (NO/EN) – beskriver faktisk praksis (booking, kasse,
  min-side-token, vurderinger, markedsføring m/samtykke, databehandlere
  Supabase/Vercel/Resend/SMS/Tripletex, 5 års bokføring, rettigheter, cookies).
  Lenke i footer og under bookingskjemaet («Ved å bestille godtar du …»).
  **Kidus/Dawit må lese gjennom** – særlig e-postadressen (bruker
  site_settings.email, fallback post@) og at leverandørlista stemmer.
- **Misbruksvern på booking** (`src/lib/abuse-guard.ts`): skjult honeypot-felt
  (roboter som fyller det får «ok» uten at noe lagres), maks 12 innsendinger
  per IP per time (minnebasert, beste-innsats), og maks 8 kommende aktive
  bookinger per kunde (e-post/telefon, databasebasert – robust).
- `sitemap.xml` inkluderer /personvern.

Ingen migrasjon. Ingen nye env-variabler.

## Rydd (manuelt)

- Slett `src/app/api/debug-email/route.ts` (nøytralisert 404-stub, kan fjernes).

---

# ENDRINGER — Etablert 2013 + «Om oss» (5. okt 2026, bygg 8)

## Commit-tittel

```
Forside: etablert 2013 (ikke 2018) + ny «Om oss»-tekst om forankringen i Oslo sentrum
```

## Kjør i Supabase (idempotent)

`KJØR-I-SUPABASE-ETABLERT-2013.sql` – setter `established = '2013'` og ny
«Om oss»-tekst i site_settings (styrer hero «Siden 2013», Om oss og
copyright «© 2013–2026»). Alternativt: admin → Nettside → Etablert + Om oss-
tekst – men bruk da nøyaktig teksten i SQL-fila, ellers treffer ikke EN-
oversettelsen og EN-modus viser norsk.

## Kode

- Fallback-verdier i koden satt til 2013 + ny tekst (brukes hvis DB ikke svarer).
- EN-oversettelse av den nye «Om oss»-teksten i content-map (den gamle beholdes).
- JSON-LD får `foundingDate` fra «Etablert», så Google ser 2013.

---

# ENDRINGER — Bygg 9 (6. okt 2026): eiers ønsker + feil funnet etter go-live

## Commit-tittel

```
Bygg 9: tidsfeil i nettbooking (+2 t), barber-steg, kundenotat, bildegalleri, nye brukere, annuller salg, grunnlønn per ansatt, m.m.
```

## Kjør i Supabase FØR push (idempotent)

`KJØR-I-SUPABASE-BYGG9.sql` – gjør alt dette:
1. Maskinklipp/Lineup og Lineup/skjeggtrim: **fra 299** (Barber 299, Senior 399, Master 549).
2. Kategorirekkefølge: **Klipp → Skjegg → Kombo → Barbering**.
3. Tjenester per ansatt: **avhuket = leverer, uavhuket = leverer ikke** (ingen
   «tomt = alt»-unntak lenger). Alle som i dag leverer «alt» får rader for alle
   tjenester, så ingenting endrer seg for kundene.
4. `create_booking_line` får `p_notes` (kundenotat). Gammel signatur droppes.
5. `void_sale` + `sale_voids` (annuller salg med logg).
6. `staff.base_salary_nok` (grunnlønn per ansatt).
7. `site_media` (bildegalleri) + `media_id` på plasseringer og håndverk-blokker,
   og de innebygde bildene (hero 1–14, galleri, om oss, banner, håndverket)
   registreres så de kan styres fra admin.
8. `settings.booking_notify` (varsel ved ny booking, standard post@…).

## FEILRETTINGER

- **Nettbooking kl. 13 ble lagret kl. 15.** Årsak: serveren (Vercel) kjører i
  UTC, og `new Date("2026-10-06T13:00")` ble tolket som UTC. Ny
  `src/lib/oslo-time.ts` regner Oslo-tid (inkl. sommertid) riktig uansett
  server. Kassa/admin var ikke rammet (kjører i nettleseren). **Bookinger
  lagt inn på nett før dette bygget ligger 2 timer feil i kalenderen** – flytt
  dem manuelt (dra/«Flytt») hvis det er noen.
- **«Gruppe: Del av gruppebooking» på vanlige bookinger.** Alle nettbookinger
  fikk gruppe-ID, også med én tjeneste. Nå får bare bestillinger med flere
  linjer gruppe-ID, og kassa viser «gruppe» bare når gruppen faktisk har >1
  booking (gjelder også gamle rader).
- **Google-lenken ga 404** (`/nb-no?...` er gammel Wix-adresse). `next.config.ts`
  sender nå /nb-no, /en, /book-online m.fl. med 308 til / eller /booking.
  Google oppdaterer selve søketreffet når den re-crawler – meld inn
  downtownbarbers.no i Search Console og send inn sitemap.xml, så går det fort.
  **Logoen i Google-treffet** er Googles cache av den gamle siden; den nye
  favicon/OG-bildet plukkes opp ved neste crawl. Logoen i selve bedrifts-
  kortet (høyre side) endres i Google Business Profile → Bilder → Logo.
- **Utlogging «hele tiden».** Supabase roterer innloggingsnøkkelen ved hver
  fornyelse; når to personer bruker samme konto (jobb@) på hver sin maskin,
  ugyldiggjør den ene den andres. Løsning: egen bruker per person – se
  «Brukere & roller» under.
- **iPad-sveip i kalenderen** virket ikke (pointer-events + nettleserens
  scroll kansellerte). Nå touch-basert: følger fingeren med «gummistrikk»,
  bytter én dag per sveip, spretter på plass (bounce), og spretter tilbake
  om du slipper for tidlig. Mus-sveip som før.
- **Kalender: tomrom til høyre.** Kolonnene fyller nå bredden, og bare
  barbere som er **på vakt** den dagen får kolonne (turnus/vakter/fravær;
  barbere med bookinger den dagen vises alltid). Uten turnus på noen vises
  alle som før.
- **E-post lys på mobil / mørk på PC.** Skjermbildet viste Gmail-appen i mørk
  modus: den inverterer mørke e-poster selv og ignorerer color-scheme-meta.
  Løst ved å gjøre malen **lys** (samme krem/espresso som nettsiden i lys
  modus, ny mørk logo-variant `downtown-logo-email-dark.png`) – lyse e-poster
  lar alle klienter stå i fred, så den ser lik ut overalt. Samtidig: luft
  mellom «Tjeneste» og verdien, dato som «Mandag 5. oktober 2026» (ikke ISO),
  og barber-blokken viser faktisk barber (navn/tittel/bilde) i stedet for «DB».

## NYTT (eiers ønsker)

- **Forside-rekkefølge:** Hero → Team → Tjenester → Håndverket → Galleri →
  Om oss → Banner → Anmeldelser → CTA → Åpningstider/Kontakt. Menyen følger.
- **«Book nå» under hver ansatt** → åpner booking med barberen forhåndsvalgt
  (`?barber=` ble aldri koblet i veiviseren før – nå er det det).
- **Booking: eget steg «Barber»** (Tjenester → Barber → Tid → Kontakt) med
  kort per barber (bilde, tittel, pris for valgt kurv) + «Hvilken som helst /
  første ledige». Gruppe-modus (flere personer) ligger på samme steg.
- **Kundenotat** i bookingen (valgfritt, maks 500 tegn) → vises i kassa:
  📝 på blokken i kalenderen og eget felt i bookingdetaljene. Tas også med i
  varsel-e-posten til salongen.
- **Varsel ved ny nettbooking** (e-post med kunde/tid/tjeneste/notat + lenke
  til kalenderen). Slås på / mottaker settes under Admin → Integrasjoner.
  Standard: post@downtownbarbers.no.
- **Google Maps tilbake i bunnteksten** (innebygd kart + «Åpne i Google
  Maps»). CSP åpnet for google.com i frame-src.
- **Logg inn som popup** over siden (desktop og mobilmeny). /logg-inn finnes
  fortsatt som egen side (tilgangsvakter og e-postlenker peker dit).
- **Bildegalleri: Admin → Bilder (/admin/bilder).** Last opp flere bilder om
  gangen, se ALT som finnes (også de innebygde), legg bilder i Hero/Galleri/
  Om oss/Banner, dra for rekkefølge, vis/skjul, fjern fra seksjon, rediger
  navn/alt-tekst, slett. Håndverket-blokkene velger bilde fra galleriet.
  Admin → Nettside lenker hit (gammel bildeseksjon er fjernet).
- **Brukere & roller: opprett og slett brukere.** «+ Opprett bruker» (e-post,
  navn, rolle) → midlertidig passord vises én gang og sendes på e-post;
  brukeren bytter via «Glemt passord». Krever `SUPABASE_SERVICE_ROLE_KEY` i
  Vercel (den finnes allerede – brukes av booking-vernet).
  → **Opprett egen bruker til deg (admin) og la Dawit beholde jobb@ (eller
  opprett eier-bruker til ham).** Da slutter utloggingen.
- **Annuller salg** (Admin → Regnskap → Omsetning → dag → «Annuller» på
  raden): bekreftelse + årsak; salget fjernes fra omsetningen, lager og
  gavekort tilbakeføres, booking settes tilbake til bekreftet, og en kopi
  logges i `sale_voids` (hvem/når/hvorfor). Nektes hvis dagen allerede er
  sendt til Tripletex – da korrigeres bilaget der. Revisor ser ikke knappen.
- **Grunnlønn per ansatt:** Admin → Ansatte → Rediger → «Grunnlønn per måned»
  (tom = standard 27 000). Brukes i Lønn og lønnsoversiktene. Uten
  «gjelder fra»-dato (enklest; si fra hvis dere trenger historikk).
- **Tjenester per ansatt:** avhuket = tilbys hos denne, uavhuket = ikke.
  Ny ansatt får alle tjenester avhuket; ny tjeneste legges på alle.

## IKKE gjort (med vilje) – si fra

- **Varsel ved hvert besøk på nettsiden:** fraråder. Det blir fort
  hundrevis av e-poster/dag, og varsler uten handling blir ignorert – da
  drukner booking-varslene. Alternativ: besøksstatistikk (Vercel Analytics,
  cookiefritt) med tall i admin-dashboardet. Vil dere ha det, sier dere ja.
- **Engelsk i admin/kasse for eieren:** større jobb (hele back-office er
  norsk i koden). Kan gjøres som eget bygg: språkknapp i admin/kasse +
  ordbok for menyer, knapper og etiketter. Anslag: 1 bygg. Ja/nei?

## Test etter push

1. Book på nett kl. 13:00 → kalenderen viser 13:00 (ikke 15:00).
2. Booking: steg 2 «Barber» – velg en, pris oppdateres; «Hvilken som helst»
   fungerer. Skriv notat → 📝 i kassa.
3. Forside: Team rett under hero, «Book nå» → booking med barber valgt.
4. Admin → Bilder: last opp, legg i Galleri, dra rekkefølge, skjul, fjern.
5. Admin → Brukere: opprett bruker → logg inn med midlertidig passord.
6. Admin → Omsetning → dag → Annuller testsalget.
7. Ansatte → Rediger → sett grunnlønn → Lønn viser den.
8. iPad: sveip i kalenderen.

---

# ENDRINGER — Bygg 9b (6. okt 2026): kalenderen på mobil

## Commit-tittel

```
Kalender på mobil: hold-og-dra for å flytte/bytte barber, dag-piler, sveip som faktisk bytter dag
```

Ingen SQL.

## Hva som var galt

- **Sveip byttet ikke dag:** på mobil er kolonnene bredere enn skjermen, så
  nettleseren tok den horisontale bevegelsen som scroll og avbrøt gesten
  (touchcancel) – «gummistrikken» vistes, men ingen dag-bytte.
- **Flytte/bytte barber virket ikke på mobil:** bytte barber brukte native
  HTML-dra (finnes ikke på touch), og `draggable` på blokkene fikk iOS til å
  avbryte pointer-gesten for flytting.

## Løsning

- **Hold-og-dra på touch:** hold fingeren ~0,35 s på en booking (liten
  vibrasjon) → flyttemodus. Dra opp/ned = ny tid (15-min-steg), dra
  sidelengs over en annen kolonne (lyser opp) og slipp = bytt barber (samme
  bekreftelsesdialog som på PC). Kort trykk = detaljer, rask bevegelse =
  vanlig scroll. Desktop er uendret (umiddelbar dra).
- **Dag-piler ‹ ›** ved datoen (alle skjermer), og sveip på topplinja bytter
  alltid dag. Sveip i selve rutenettet bytter dag bare når alle kolonnene får
  plass (ellers scroller det sidelengs, som det skal).

## Test på mobil

1. Hold på en booking → den «løfter seg» → dra ned → slipp → ny tid.
2. Hold → dra til nabokolonnen (lyser) → slipp → bekreft bytte av barber.
3. Pil ‹ › bytter dag; sveip på datolinja bytter dag med bounce.
4. Vanlig scroll opp/ned og sidelengs fungerer uten at noe flyttes.

---

# ENDRINGER — Bygg 9c (6. okt 2026): mobil-finpuss

## Commit-tittel

```
Mobil: innlogging midt på skjermen, tomrom over header fjernet, ingen auto-zoom etter innlogging
```

Ingen SQL.

- **Innlogging** er nå et svevende vindu midt på skjermen også på mobil (ikke
  ark nedenfra).
- **Tomrom over headeren** på iPhone: kom av `viewport-fit=cover` + safe-area-
  innrykk på headeren når adresselinja krymper. Begge fjernet – standard
  viewport.
- **«Siden kuttes i kantene» / må zoome ut:** iOS Safari zoomer inn når et
  felt med skrift under 16px får fokus (e-post/passord i innloggingen) og
  blir værende zoomet etter at du er sendt videre til admin. Alle felt er nå
  minst 16px på berøringsskjermer – da zoomer ikke iOS. (Hvis du fortsatt
  er zoomet inn akkurat nå: dobbelttrykk eller knip ut én gang; det er
  gammel tilstand i fanen.)

---

# ENDRINGER — Bygg 9d (6. okt 2026): Rediger ansatt + visningsnavn

## Commit-tittel

```
Ansatte: rediger-dialog som ikke kuttes, og visningsnavn for kundene
```

## Kjør i Supabase FØR push

`KJØR-I-SUPABASE-VISNINGSNAVN.sql` – legger til `staff.display_name`.

- **Rediger ansatt**-dialogen lå inne i sideanimasjonen/topplinja og ble
  kuttet i toppen (Navn-feltet var usynlig). Nå rendres den over alt annet,
  med fast topp (tittel + lukk), rullbart innhold og Lagre/Avbryt alltid
  synlig nederst – også på små skjermer.
- **Visningsnavn på nettsiden** (nytt felt): det kundene ser i Teamet, i
  booking-steget «Barber» og i bekreftelses-e-posten. Tomt = fullt navn.
  Kassa, lønn og timelister bruker fortsatt fullt navn.

---

# ENDRINGER — Bygg 9e (6. okt 2026): prislapper

## Commit-tittel

```
Booking: oransje prislapper (tjenester, barber-kort, kurv, totalsum) + «fra» i prislista på forsiden
```

Ingen SQL.

- Priser i veiviseren er nå oransje «prislapper» (pille med lys oransje bakgrunn,
  «FRA» i liten kapitél når prisen avhenger av barber). Brukes på tjenestelista,
  barber-kortene, kurvlinjene, totalsummen og oppsummeringen. Tillegg-chips viser
  «+149 kr» i oransje.
- Prislista på forsiden viser «FRA» foran prisen når nivåprisen varierer
  (Barber/Senior/Master) – f.eks. «fra 299 kr».

---

# ENDRINGER — Bygg 9f: kategori «Hårklipp»

Kjør `KJØR-I-SUPABASE-HAARKLIPP.sql` (døper om «Klipp» → «Hårklipp»).
EN-oversettelse «Haircuts» lagt i content-map (dekker både gammelt og nytt navn).
Kategori-overskriftene i booking er uendret (plain), prislappene som før.

---

# ENDRINGER — Bygg 9g: rekkefølge på tjenester

Kjør `KJØR-I-SUPABASE-KATEGORIER.sql` (rydder dubletter → Hårklipp/Skjegg/
Kombo/Barbering/Tillegg) og `KJØR-I-SUPABASE-REKKEFOLGE-KLIPP.sql`.

- Rekkefølgen innen en kategori styres nå av sort_order (Admin → Tjenester),
  ikke popularitet. Popularitet er bare tiebreak. Før overstyrte popularitet
  rekkefølgen, så Maskinklipp/Lineup havnet øverst uansett.
- Hårklipp: Herreklipp 30' → Herreklipp 45' → Maskinklipp/Lineup → Barneklipp.

---

# ENDRINGER — Bygg 9h: dag-sveip, bulk-opplasting, hastighet

## Commit-tittel

```
Kalender: dag-bytte virket ikke (tidssonefeil i addDays); bilder lastes rett til Storage (bulk/video); raskere sidebytte
```

Ingen SQL.

- **Sveip/piler byttet ikke dag.** Hjelperen `addDays` regnet «neste dag» i
  lokal tid og formaterte i UTC: lokal midnatt 7. okt = 6. okt 22:00 UTC →
  «2026-10-06» igjen. Fremover sto stille, bakover hoppet to dager.
  Animasjonen spilte, men URL-en ble den samme. Fikset (UTC-regning).
- **Opplasting av mange filer/videoer ga «This page couldn't load».** Alle
  filene gikk gjennom serveren i én forespørsel (grense 4,5 MB på Vercel).
  Nå lastes hver fil **rett fra nettleseren til Supabase Storage** (ingen
  servergrense, inntil 200 MB per fil, 3 parallelt) med egen fremdriftslinje
  per fil, og registreres etterpå. Fungerer for 20+ filer og videoer.
  NB: Supabase har en global filgrense per prosjekt (Storage → Settings →
  «Upload file size limit», standard 50 MB) – sett den til 200 MB hvis
  videoer over 50 MB skal inn.
- **Treg/«laggy» sidebytte i admin/kasse:** sideanimasjonen brukte 0,5 s
  blur på hele siden (tungt). Nå 0,18 s enkel inntoning, og alle admin-/kasse-/
  revisor-sider viser et skjelett med én gang mens data hentes (streaming),
  så det ikke «henger» på forrige side.

---

# ENDRINGER — Bygg 9i: auto-oppdatering

Ingen SQL.

- **Kalenderen (kasse + admin → Bookinger) henter nye bookinger selv** hvert
  minutt og hver gang fanen får fokus igjen. Liten indikator «Oppdatert 14:32»
  ved datoen. Pauser mens en booking dras/forlenges eller en dialog er åpen,
  så ingenting hopper midt i en handling.
- Kasse-forsiden (stemplingstavla) oppdateres også hvert minutt.

---

# ENDRINGER — Bygg 9j: markedsføring i bakgrunnen (kø)

## Kjør i Supabase FØR push

`KJØR-I-SUPABASE-UTSENDING-KO.sql` (status/total på utsendinger + kø-tabell).

## Hva som var galt

- «Send til segment» sendte alle e-postene **synkront i én forespørsel**:
  skjermen sto stille til alt var sendt. Den var dessuten kappet på 500, og
  mottakerlista stoppet i praksis på 1000 (PostgREST-grense) – derfor «500».
- Resend tillater ~2 forespørsler/sek; 20 parallelle enkeltsendinger ga
  rate-limit (429), og koden telte 429 som «sendt». Tallet 500 var dermed
  trolig for høyt.
- Ingen dobbeltklikk-vern: utsendingen 5. okt 14:07 ble startet to ganger.

## Løsning

- **Kø:** alle mottakerne (nå hele lista, f.eks. 6 169) legges i
  `marketing_queue` med én gang → skjermen svarer på et sekund: «Utsending
  startet til 6 169 mottakere».
- **Bakgrunnsjobb** (`/api/marketing/worker`) sender e-post via Resends
  batch-API (100 per kall, ~200/sek) og SMS 5 parallelt, inntil ~50 s per
  runde, og starter seg selv på nytt til køen er tom. 6 000 e-poster tar
  1–3 minutter. Feil (rate-limit o.l.) logges per mottaker, og «Fortsett»-
  knapp i lista gjenopptar.
- **Fremdrift** under «Sendt før»: «Sender … 43 %» og «2 650 / 6 169», siden
  oppdaterer seg selv hvert 5. sekund mens noe sendes.
- **Bekreftelse før sending** (kanal, segment, antall) + knappen låses mens
  den starter + server nekter identisk utsending innen 15 min.
- Teller nå bare faktisk aksepterte e-poster (sjekker svaret fra Resend).

Env: bruker `CRON_SECRET` hvis satt i Vercel (fallback utledet av service-
nøkkelen) til å beskytte arbeider-ruten. Ingenting nytt må settes.

---

# ENDRINGER — Bygg 9k: «Send til resten»

Ingen ny SQL (bruker kø-tabellen fra 9j – den må være kjørt).

- Ny lenke **«Send til resten»** på hver ferdige e-postutsending under
  «Sendt før». Sender samme emne + tekst til alle med samtykke som ikke har
  fått den. Hvem som har fått den sjekkes mot (1) køen og (2) **Resends egen
  logg** (`GET /emails`, filtrert på emne og dato) – nødvendig fordi
  utsendingene 5. okt kl. 14:07 ble sendt før køen fantes og ikke ble logget
  per mottaker. Bouncede/feilede regnes som ikke mottatt; de som ble avvist
  av rate-limit nådde aldri Resend og får den nå.
- Feilsikring: får vi ikke lest Resend-loggen, sendes ingenting (ingen
  risiko for dobbel e-post).

---

# ENDRINGER — Bygg 9l: «Send til resten» med forhåndsvisning + robust kø

## Kjør i Supabase (valgfritt, men anbefalt)

`KJØR-I-SUPABASE-UTSENDING-KO-2.sql` – kolonnen `updated_at` (brukes til å
oppdage og restarte en utsending som står fast). Koden tåler at den mangler.

## Hva som skjedde

«Send til resten» ble trykket, men ingen ny utsending ble opprettet (lista
viser fortsatt bare de to fra 14:07). Mest sannsynlig: Resend-nøkkelen har
bare «Sending access» og kan ikke lese loggen (GET /emails → 401). Da nekter
koden å sende (for å unngå dobbel e-post) – men den sa bare ifra med et
banner øverst, lett å overse.

## Nå

- **Forhåndsvisning før sending:** dialogen sjekker først og viser tall –
  «Kan nås: 6 169 · Har fått den: 5xx · Får den nå: 5 6xx» – og knappen sier
  «Send til 5 6xx». Kan loggen ikke leses, står det rett ut hvorfor og hva du
  gjør (se under), og det finnes ingen send-knapp.
- **Ny valgfri env `RESEND_LOG_KEY`:** en Resend-nøkkel med *Full access*,
  bare til å lese loggen. Sendenøkkelen kan beholdes som den er.
- **Kø mer robust:** første bolk sendes direkte i bakgrunnen etter svaret
  (ikke via et HTTP-kall til seg selv), og står en utsending stille i 30 s
  mens admin-siden er åpen, dyttes den i gang igjen. «Fortsett» legger
  feilede mottakere tilbake i køen.
- **Fremdriftslinje** og feilmelding (f.eks. rate-limit) vises på raden.
