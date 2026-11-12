# Testplan – Downtown Barbers (hele plattformen)

Laget etter full QA-gjennomgang november 2026. Planen dekker nettside, booking,
Min side, nettbutikk, kasse (iPad), kasseoppgjør, back-office, lønn, ansattportal,
revisorportal og sikkerhet.

## 1. Testnivåer og hvordan de kjøres

| Nivå | Hva | Kommando / sted | Når |
|---|---|---|---|
| Typesjekk | Hele kodebasen | `npx next typegen && npx tsc --noEmit` | Før hver push |
| Lint | Endrede filer | `npx eslint <filer>` | Før hver push |
| Enhetstester | Ren logikk: innkjøpspris-import, priskalkulator, Oslo-tid, turnus | `npm run test:unit` | Før hver push |
| E2E lokalt | Kundereisen i nettleser (mobil, iPad, PC) | `npm run build && npm run test:e2e` | Før større endringer |
| E2E prod | Samme, kun lesing mot downtownbarbers.no | `npm run test:e2e:prod` | Etter hver deploy |
| Manuell | Kasse, lønn, roller, betaling – se sjekklister under | Testkonto per rolle | Etter SQL-endringer og før månedsslutt |

**Testkontoer som trengs** (opprettes i admin → Brukere, merkes «TEST»):
admin, eier, shop (kasse-iPad), staff (barber med turnus), revisor, og to kunder (A og B)
med ulik e-post og telefon. Testsalg slettes/angres samme dag.

**Regel:** E2E-testene skal aldri lage bookinger, ordrer eller salg i prod.
Skrivende tester kjøres lokalt eller mot en Vercel preview med egen Supabase.

---

## 2. Sikkerhet og roller (kjøres etter hver `KJØR-I-SUPABASE-*-VERN.sql`)

| # | Test | Forventet |
|---|---|---|
| S1 | Som staff/shop/revisor: forsøk å sette egen `profiles.role = 'admin'` via Supabase API | Avvist («Du har ikke lov til å endre rolle») |
| S2 | Admin endrer rolle på en annen bruker i admin → Brukere | Virker |
| S3 | Min profil: endre navn/telefon som staff | Virker |
| S4 | Supabase Auth: åpen registrering | Skal være AV |
| S5 | Book med kunde A sin e-post + nytt telefonnummer | Booking ok, men kunde A sin telefon er uendret i admin |
| S6 | Kall alle `/api/cron/*` og `/api/marketing/worker` uten / med feil Bearer | 401 (500 hvis `CRON_SECRET` mangler) |
| S7 | `/api/sms/inbound` uten nøkkel | 401 |
| S8 | `/api/vipps/webhook?mock=1&reference=...` i prod | Ingen effekt (mock er av i prod) |
| S9 | Rollematrise: åpne `/admin`, `/kasse`, `/ansatt`, `/revisor` som hver rolle | Bare riktig rolle slipper inn |
| S10 | Kall admin-actions (tjenester, gavekort, nettside, timelister, kasseoppgjør) som shop/staff | Avvist |
| S11 | Revisor: prøv å slette/overskrive en kontrakt i Storage | Avvist; lønnsslipper kan genereres |
| S12 | Staff: prøv å slette egen kontrakt/lønnsslipp i Storage | Avvist; egne opplastinger kan slettes |
| S13 | Som innlogget ikke-admin: `select pin_hash, base_salary_nok from staff` | Feil 42501 etter `KJØR-I-SUPABASE-SIKKERHET-3.sql`; `/admin/ansatte`, lønn, revisor lønnsslipper, grunndata-eksport og `/ansatt` virker fortsatt |
| S14 | 20 parallelle feil innloggingskoder | Maks 5 forsøk telles |
| S15 | Be om kode 6 ganger for kjent vs ukjent e-post | Samme svar for begge |
| S16 | «Send meg lenke» (portal-lenke) 6 ganger | Stoppes etter 5 |
| S17 | CSV-eksport med kunde som heter `=1+1` | Vises som tekst i Excel |

## 3. Booking (nettside)

| # | Test | Forventet |
|---|---|---|
| B1 | Én tjeneste, «hvem som helst» | Barberen med minst belastning den dagen velges |
| B2 | Én tjeneste, valgt barber + tillegg | Riktig pris, varighet = tjeneste + tillegg fra databasen |
| B3 | To tjenester samme person | Tidene henger sammen |
| B4 | Gruppebooking 2–4 personer, ulike barbere | Felles ledige tider, alle bookinger opprettes |
| B5 | To nettlesere booker samme tid samtidig | Én får «tiden er tatt», wizard går tilbake med ny liste |
| B6 | «Finn neste ledige tid» når første ledige er > 60 dager frem | Hopper dit og viser tider (ikke tom liste) |
| B7 | Barber som ikke tilbyr tjenesten | Kan ikke velges, også ikke via direkte kall |
| B8 | Dato i fortid / > 1 år frem / ugyldig format | Avvist med norsk melding |
| B9 | Booking i dag senere på dagen | Virker |
| B10 | Sommertid/vintertid-bytte (29.03 og 25.10) | Riktig klokkeslett i bekreftelse, admin og kasse |
| B11 | Bekreftelse e-post + SMS | Kommer, Oslo-tid, riktig lenke |
| B12 | Avbestill via `/avbestill/<token>`: første gang, igjen, utløpt | Riktige meldinger |
| B13 | Vurdering `/vurder/<id>` for fullført vs ikke-fullført booking | Bare fullført godtas; ny vurdering oppdaterer den gamle |
| B14 | 13 innsendinger fra samme IP / 9 kommende bookinger for samme kunde | Stoppes med melding |

## 4. Min side (kunde)

| # | Test | Forventet |
|---|---|---|
| M1 | Ny registrering → kode → innlogget | Virker, kode på e-post (+ SMS hvis nummer) |
| M2 | Feil kode 5 ganger, utløpt kode | Låst / tydelig melding |
| M3 | Se bookinger, avbestille, for sent å avbestille | Riktig |
| M4 | Flytte booking med flere tjenester / gruppebooking | **Åpent funn** – flytting bruker bare hovedtjenestens varighet |
| M5 | Logg ut, gammel lenke fra e-post | **Åpent funn** – lenken virker fortsatt (permanent token) |
| M6 | Kunde B prøver kunde A sine booking-/ordre-id-er | Ingen data |

## 5. Nettbutikk

| # | Test | Forventet |
|---|---|---|
| N1 | Legg i kurv, lagergrense, fraktgrense | Riktig total fra server |
| N2 | Medlemsrabatt kun innlogget, QR-tilbud | Riktig rabatt |
| N3 | Vipps: fullført, avbrutt | Ordre betalt / lager tilbake |
| N4 | Vipps forlatt (lukker fanen) | **Åpent funn** – lager holdes til kunden kommer tilbake |
| N5 | Betal ved henting | Kun ved henting |
| N6 | Ordreside med feil token / gjentatt Vipps-retur | Avvist / én bekreftelse |
| N7 | Vipps-nøkler mangler i prod | «Vipps-betaling er ikke tilgjengelig» – aldri «betalt» |

## 6. Kasse (iPad) – penger

| # | Test | Forventet |
|---|---|---|
| K1 | Fullfør booking: kontant, kort, Vipps | `sales`, `sale_items`, `sale_payments` riktig; booking `completed` |
| K2 | Med produkt + manuell rabatt, rabatt-flagg av/på | Total regnes på server; shop kan ikke gi rabatt når det er slått av |
| K3 | Splittbetaling med riktig og feil sum | Feil sum avvises |
| K4 | Uten betalingsmåte | Avvises («Mangler betalingsmåte») |
| K5 | Gavekort: hel, delvis + kontant, utløpt, tomt, feil kode, samme kort to iPader samtidig | Saldo aldri negativ |
| K6 | Hurtigsalg: ny kunde, eksisterende (e-post med `_`), uten kunde | Riktig kunde kobles, ingen annen kunde overskrives |
| K7 | Vipps i kassa: godkjent → trukket → salg registrert; avbrutt; dobbel polling | Ett salg, ett trekk |
| K8 | Vipps godkjent, men salget feiler etter trekk | Tydelig melding om at pengene er trukket og salget må registreres |
| K9 | «Angre» salg betalt med gavekort | Saldo tilbake, kupong frigitt |
| K10 | «Angre» salg på en dag som er gjort opp, som shop | Avvist – admin må gjøre det |
| K11 | Etterregistrert salg: i går, 40 dager siden, oppgjort dag | 40 dager og oppgjort dag avvises for shop |
| K12 | Nettordre retur: refusjon > varenes verdi som shop | Avvist – må godkjennes av admin |
| K13 | Stempling: PIN, start/pause/slutt, feil PIN | Logg i Oslo-tid |

## 7. Kasseoppgjør

| # | Test | Forventet |
|---|---|---|
| O1 | Lever oppgjør, lever på nytt (to iPader) | Andre gang avvises |
| O2 | Endre innen 7 dager / etter 8 dager | Historikk, `edit_count`; for gammelt avvises |
| O3 | Auto-utkast (cron) → bekreft som shop og admin | Utkast blir bekreftet |
| O4 | Admin «opprett» på dag som finnes | Henvises til «Endre», ingen stille overskriving |
| O5 | Salg 23:30 og 00:30 Oslo-tid, sommer og vinter | Havner på riktig dag |
| O6 | Databasefeil under levering (simulér) | Feilmelding, ingenting lagres (aldri 0/0/0) |
| O7 | Tripletex: én kladd per dag, `sendToLedger=false`, kjør to ganger | Ingen dobbel kladd, aldri bokført |

## 8. Lønn og rapporter

| # | Test | Forventet |
|---|---|---|
| L1 | Måned med > 1000 salg | `/admin/lonn` = SQL-sum per barber |
| L2 | Salg 00:15 den 1. og 23:45 siste dag (Oslo) | Riktig måned i lønn, PDF og revisor |
| L3 | Ansatt starter/slutter midt i måneden, ikke startet, sluttet | Grunnlønn pro rata / 0 |
| L4 | Fravær: ulønnet, syk, ferie, med og uten fravær-SQL | Trekk eller tydelig banner |
| L5 | Provisjon: under/på/over terskel, split-modell | Samme tall i admin, PDF og revisor (**åpent funn**: `/admin/lonn` bruker globale satser) |
| L6 | Nøkkeltall-filtre × kilde/mva/type/barber/betaling | Sum = kasseoppgjør |
| L7 | Rapport for kvartal/år (> 1000 rader) | Riktige totaler |
| L8 | Excel-rapportsenter: alle rapporter åpnes, summer stemmer | |
| L9 | Varemargin: import Lagerverdi-CSV og varemargin-xlsx | 142/142 matchet for xlsx |
| L10 | Markedsføring: utsending, avmelding midt i utsending, to workere samtidig | Ingen dobbel e-post, avmeldte får ikke |

## 9. Ansattportal

| # | Test | Forventet |
|---|---|---|
| A1 | «Kommende kunder» vs «Neste» | Samme Oslo-tid |
| A2 | Turnus med 4-ukers rotasjon | Alle uker vises, riktig «Denne uken» og merker |
| A3 | Ekstravakt lagt inn av admin | Vises under «Ekstravakter» |
| A4 | Månedsmål som staff (etter ANSATT-MAAL-SQL) | Vises |
| A5 | Dokumenter som eier på `/ansatt/dokumenter` | Bare egne dokumenter |
| A6 | Fraværssøknad: søk, trekk tilbake, admin godkjenner | Riktig status |
| A7 | Capacitor-app: innlogging, Android tilbake-knapp, utløpt økt | |

## 10. Revisorportal

| # | Test | Forventet |
|---|---|---|
| R1 | Alle sider leses | Ingen skrivekontroller utenom lønn |
| R2 | Lønnsinnstillinger: tom sats, sats > 1, ugyldig kontonr | Avvist med norsk melding |
| R3 | Generer lønnsslipper to ganger | E-post bare når «Send e-post» er krysset av |
| R4 | CSV/xlsx-eksport > 1000 salg | Alle rader med |

## 11. UI og tilgjengelighet (apple-design)

- Trykkflater ≥ 44 px på iPad (kasse).
- Etiketter koblet til felt (`Field`): trykk på etikett gir fokus.
- Redusert bevegelse: animasjoner og fremdriftslinjer respekterer `prefers-reduced-motion`.
- Dialoger (innlogging, «Mer», dokumentvisning): **åpent funn** – mangler fokusfelle og fokus tilbake.
- Ingen sidelengs scroll på mobil (dekket av e2e).

---

## 12. Åpne punkter (ikke rettet i denne runden – krever beslutning eller større endring)

1. **Capacitor-appen (`app-ansatt/`)** er ikke gjennomgått for direkte `staff`-lesinger før SIKKERHET-3 kjøres (den laster nettsiden, så trolig ok).
2. **Min side-token er permanent** og ligger i e-poster; utlogging ugyldiggjør det ikke. Krever ny øktmodell.
3. **Booking-RPC-ene kan kalles direkte med anon-nøkkel** og hoppe over serverens sjekker (varighet, rate-limit). Krever at RPC-en regner varighet selv eller at anon-tilgang fjernes.
4. **Flytting av booking i Min side** bruker bare hovedtjenestens varighet og låser ikke.
5. **Forlatte Vipps-/hentebestillinger holder lager** – trenger cron som kansellerer etter 30 min.
6. **`/admin/lonn` og lønns-PDF bruker ulike datakilder/satser.** Bør samles på `computeSalary`.
7. **IP-begrensning er i minnet per server-instans** – svak mot angrep. Bør flyttes til database/KV.
8. **Revisor kan endre lønnsdata** (dokumentert som ønsket) – bekreft med Kumar/Dawit, vurder logg.
9. **Dialoger mangler fokushåndtering.**
10. **PIN for stempling har ingen sperre** etter feil forsøk.
