# Downtown Barbers — mangler & forbedringer

Konsolidert gjennomgang (19. sept 2026) av hele plattformen, delt på tre rolle-flater: **kunde/booking**, **ansatt/kasse**, **admin/revisor**. Basert på dyp kodegjennomgang + live-stikkprøver. Sortert etter effekt, ikke etter hvor det ble funnet.

> Alt her er *i tillegg* til de kjente go-live-blockerne (domene + Resend-e-post, Vipps-terminal, Google/SMS-nøkler) som allerede står på `/admin/go-live`.

---

## 🔴 Topp-prioritet (bør fikses før/rundt lansering)

1. **Kassen svelger feil stille (kasse-integritet).** `completeBooking` returnerer ingen feil; betalingsknappene kaller `onDone()` uansett. Feiler DB-skrivingen (nett/RLS), lukkes raden og alt *ser* fullført ut — men salget er ikke registrert. → returnér feil fra `completeBooking` og vis den i `PaymentControls`. *(kasse/actions.ts, PaymentControls.tsx)*

2. **Ingen produkt-/varesalg i kassen.** Datamodellen og rapportene støtter `kind:"product"`, men POS skriver alltid bare en `service`-linje — det finnes ingen UI for å selge voks/sjampo o.l. Varesalg over disk er umulig, og produktrapporten viser alltid 0. *(kasse/actions.ts)*

3. **Kan ikke angre «Fullført»/«Ikke møtt» i kassen.** Ett feiltrykk på nettbrett låser salget (feil kunde/betalingsmåte) — må rettes av admin. Ingen `reopen`/`undo`. Kombinert med #1 er dette risikabelt. → legg til angre-steg eller «angre i 5 sek». *(BookingDetailModal, ShopBookingList)*

4. **Kunden kan ikke avbestille eller endre time fra «Min side».** Avbestilling finnes kun via engangs-lenke i e-post (som i dag ikke sendes, siden Resend ikke er koblet). Reschedule finnes ikke i det hele tatt. Portalen har allerede en gyldig token — dette er lavthengende selvbetjening kunder forventer. *(min-side/[token], BookingWizard)*

5. **«Kampanjer» er en ikke-fungerende dublett av «Markedsføring».** Lagrer bare tekst, sender ingenting, sier selv «kobles på når leverandøren er satt opp» — men leverandøren *er* satt opp og brukes av Markedsføring. Forvirrende. → slå sammen med Markedsføring eller koble på reell planlagt sending. *(kampanjer/page.tsx, CampaignManager)*

6. **Kasseoppgjør avstemmer ikke.** Lover å «avstemme mot faktisk kontant/kort», men registrerer bare ett totalbeløp — ingen sammenligning mot forventet salg, ingen differanse/avvik. Selve poenget (fange avvik) mangler. *(kasseoppgjor, SettlementManager)*

---

## 🟠 Viktige funksjonshull (per flate)

**Kunde/booking**
- On-screen bekreftelse etter booking har ingen handlingslenker (til Min side / avbestill / «Legg til i kalender») — alt ligger kun i e-posten.
- «Legg til i kalender» (.ics / Google) finnes ingen steder — reduserer no-shows.
- Vurder-siden viser ikke hva som vurderes (barber/tjeneste/dato) og validerer ikke lenken før innsending.

**Ansatt/kasse**
- Ingen hurtigsalg/drop-in uten booking (må opprette booking først for å ta betalt).
- Ingen rabatt / prisjustering / splittbetaling i kassen.
- Innløsing av klippekort mangler i selve betalingsflyten (kun på kundekortet) — belønning glipper hvis resepsjon glemmer å åpne kundekortet.
- Stemplingsbrettet oppdateres ikke automatisk (ingen polling på kiosk-skjermen).

**Admin/revisor**
- «Regnskap»-siden matcher ikke navnet «Bilag og hovedbok» — viser bare omsetning (nær duplikat av dashboard). Ingen hovedbok/bilag/kontoplan/kostnadsside. *(live-bekreftet 19. sept)*
- **Kundekortene er importert, men ikke kjøpshistorikken.** Alle 6425 kunder viser 0 bookinger / «— sist besøkt», «kunde siden 08. sep 2026», 0 kr livstid. Kontaktinfo kom med fra Fixit, men ingen historiske timer — derfor står klubbnivå/livstidsforbruk på null for alle. Fikses med Fixit-eksempelfil (booking-eksport). *(live-funn 19. sept)*
- **Ingen ansatte kan logge inn.** Alle 6 står «Mangler e-post → Opprett innlogging». Hele onboarding-løpet er blokkert til Resend-e-post er koblet — barberne finnes i systemet, men ikke som brukere. Brukerinvitasjon skjer dessuten utenfor appen (Supabase Auth). *(live-funn 19. sept)*
- **To ulike timeutnyttelser som motsier hverandre.** `Nøkkeltall` regner mot åpningstid (1872 t kapasitet), `Produktivitet` regner mot turnus (viser «/ 0 t» fordi staff_hours er tom). I tillegg sier Nøkkeltall «turnus-presis utnyttelse aktiveres når A/B-anker er satt», mens Go-live sier A/B-anker *er* satt. Samle til én utnyttelsesdefinisjon. *(live-funn 19. sept)*
- **Turnus (staff_hours) er ikke fylt inn** → timeutnyttelsen i produktivitetsrapporten viser 0 %. Legg inn turnus per barber, så begynner den å regne. *(live-funn)*
- Kundeklubb: nivå-editoren finnes og er redigerbar (navn/farge/terskel/gode per Bronse/Sølv/Gull), men kan ikke se *hvem* som er på hvert nivå, og kan ikke legge til/fjerne nivåer utover de tre faste. *(live-korrigert 19. sept)*
- Lønnsslipp uten skattetrekk (interim, men ikke en reell lønnsslipp).

**Revisor-flaten** *(live-testet 19. sept — rollegating OK: /admin blokkert, /revisor + undersider åpne)*
- **Nedboring virker ikke.** Både Oversikt («klikk et punkt i grafen for å bore ned i en dag») og Omsetning («klikk en dag for å se enkeltsalgene») lover nedboring til enkeltsalg, men klikk gjør ingenting (kun hover-tooltip på grafen). Enten koble på dagsdetaljen, eller fjern teksten.
- **Skrivehandling eksponert for «read-only» revisor.** Lønnsslipper-siden har «Generer og send lønnsslipper» som lager PDF-er og legger dem i ansattes private mapper — en skrivehandling, tross banneret «Read-only tilgang for revisor». Avklar: skal revisor kunne kjøre lønn? Hvis nei, skjul knappen (og sjekk at server-action avviser revisor-rollen); hvis revisor = regnskapsfører som kjører lønn, fjern «read-only»-teksten.
- «Eksport (CSV)» er et direkte nedlastings-endepunkt (`/revisor/eksport`), ikke en side — å åpne den trigger en CSV-nedlasting. Fungerer, men greit å vite.

---

## 🎨 UI/UX — gjennomgående forbedringer

**Størst effekt (konsistens på tvers):**
- **Intern navigasjon bruker `<a href>` (full sideinnlasting) i stedet for `next/link`** på AdminNav + ~12 sider → hvert menytrykk laster hele siden på nytt uten prefetch. Standardiser på `Link`.
- **Ingen delt `Button`-komponent** — hver knapp er håndlaget, to ulike hover-konvensjoner (`accent-hover` vs `opacity-90`). Lag én.
- **Periodevelgeren er implementert 3 ulike måter** på tvers av Økonomi (chips+dato / måned-år / faner); `presets()` er kopiert i 3 filer. Samle i én komponent.
- **`ProgressBar` finnes, men bar-markup er duplisert 5 steder.** Gjenbruk den.
- **Breadcrumb-komponent finnes men brukes aldri**, og tilbake-navigasjon er ad-hoc/ulik på dype sider. Standardiser ett mønster.

**Sikkerhet mot feiltrykk (touch/nettbrett):**
- Booking-dialog og PIN-panel i kassen lukkes ved klikk utenfor → mister halvutfylt skjema uten bekreftelse.
- Betalingsknapper fullfører umiddelbart uten totalvisning/bekreftelse.
- Destruktive handlinger uten `confirm()`: «Anonymiser kunde» (ugjenkallelig), slett i meldinger/dokumenter/ansattdokumenter. (Inkonsistent — andre steder *har* bekreftelse.)

**Booking-skjema (tilgjengelighet + konvertering):**
- Inputs bruker kun `placeholder`, ingen `<label>`/`autoComplete`/`type="tel"` → dårlig for skjermleser og autofyll.
- «Bekreft booking» er disabled uten forklaring når felt mangler/er ugyldige.
- Serverfeil ved henting av ledige tider maskeres som «Ingen ledige tider» (skiller ikke feil fra tomt).

**Detaljer/polish:**
- Kalenderen: «+ Ny booking» forhåndsutfyller ikke valgt dag; tomme tidsluker er ikke klikkbare; ingen barber-filter (mye sideveis scroll).
- Kundesøk i kassen mangler «ingen treff»-tilstand.
- **Utvikler-rettet mikrokopi i produksjon.** `/admin/lonn` viser bokstavelig «…si fra, så justerer jeg satsen ett sted i `src/lib/ops-queries.ts`» — kildekode-referanse midt i eierens skjermbilde. Rask fiks. *(live-funn 19. sept)*
- **Rå engelsk fil-input** («Choose File / No file chosen») i Ny ansatt-skjemaet (kontrakt + bilde), midt i norsk UI. Bør styles/oversettes. *(live-funn 19. sept)*
- Hardkodet merkefarge `accent-[#F47721]` på avkryssingsbokser og hardkodet «40 %»/sluttår flere steder — bør bruke tokens / utledes.
- Emoji i UI-tekst (dashboard, oppfølging, kundekort) bryter med det ellers nøkterne uttrykket.
- Revisor-navet mangler mobilhåndtering, og SAF-T ligger bare på revisor-forsiden — ikke i menyen.

---

## Forslag til rekkefølge

1. **Kasse-integritet + angre** (#1, #3) og **produktsalg** (#2) — daglig drift + pengesikkerhet.
2. **Kunde selvbetjening: avbestill/endre fra Min side** (#4).
3. **Rydd Kampanjer vs Markedsføring** (#5) og **kasseoppgjør-avstemming** (#6).
4. **UI-fundament**: delt `Button`, `next/link`, felles periodevelger — gjør alt videre arbeid raskere og mer konsistent.
5. Resten som løpende forbedringer.

Si hvilke(t) punkt du vil at jeg tar først, så bygger jeg.
