# Sluttrapport — Downtown Barbers (nettside + system)

Overleveringsdokument. Lim det inn (eller legg det ved) i en ny chat, så kan
neste økt fortsette uten å miste kontekst. Oppdatert **5. oktober 2026** etter
full gjennomgang og go-live-polish av forside, booking, admin, kasse og revisor.

---

## 1. Hva dette er

Downtown Barbers AS (barbershop i Osterhaus' gate 10, Oslo). Kidus er
konsulent/prosjektleder; eier er Dawit. Eget booking-/kasse-/admin-system som
erstatter Fixit.

**Stack:** Next.js 16 (App Router) + React 19 + Tailwind v4 (OKLCH-tokens) +
Supabase (Postgres + RLS + SECURITY DEFINER-RPC-er). E-post via Resend
(`post@downtownbarbers.no`, verifisert). Prod på Vercel under scope
**kidus-girmas-projects**. Supabase-prosjekt: **kekdspamodouqqeptxwa**.
Regnskap: Tripletex (synk aktiv, legger dagsbilag som ubokførte utkast).

---

## 2. Arbeidsflyt (VIKTIG — følg dette)

- **Repo:** `Bidusg/Downtownbarbers` (offentlig). Lokal klone på PC-en:
  `C:\Users\Melat\Documents\GitHub\DZ review\Downtownbarbers`.
- Claude kloner **live GitHub-HEAD** i skyen ved starten av hver endring, bygger
  der (`npx next build` må være grønn), og skriver endrede filer **direkte inn i
  repo-mappa** via enhetsbroen. **Kidus reviewer + committer + pusher selv i
  GitHub Desktop.** Claude kjører **ALDRI** git-kommandoer i repo-mappa.
- Lærdom 5. okt: ved overføring til PC-en må Claude bruke en **ny
  staging-mappe per leveranse** – gjenbruk av samme sti ga en gammel
  mellomlagret kopi, så endringene dukket ikke opp i GitHub Desktop.
- Databaseendringer leveres som **`KJØR-I-SUPABASE*.sql`**-filer (idempotente)
  som Kidus kjører i Supabase → SQL Editor. Når koden avhenger av ny SQL, står
  det i `ENDRINGER.md` at SQL må kjøres **før** push.
- Hver leveranse: kort oppsummering + commit-tittel i `ENDRINGER.md`.
- Claude kan ikke teste mot ekte DB fra skyen, men kan teste **live** i
  nettleserpanelet etter push (Kidus logger inn selv for admin/kasse/revisor).
- **Bindende regel:** «Hvis du ikke skjønner noe, spør — IKKE endre noe hvis du
  er usikker uten å avklare.»

---

## 3. Levert 5. oktober (alt pushet og verifisert live)

**Forside / booking (bygg 1)**
- Booking-veiviser: tekstkollisjon på mobil fikset, intro «Tre steg»,
  oppsummering med «Mandag 5. oktober kl. 14:00», per linje barber + tillegg +
  pris, totalsum i kurv og oppsummering. Ekte `<form>` med labels/autofyll,
  hint når knappen er deaktivert, klikkbare stegfaner, a11y-navn på dag-/tid-
  knapper. «Hvordan hørte du om oss?» er nedtrekk (tellbar kilde-KPI).
- Språkknappen NO/EN dekker nå alle kundesider: veiviseren (tjenester,
  tillegg, titler), bekreftelse, 404, vurdering, min-side (inkl. endre/
  avbestill), avbestilling. Back-office + logg-inn er norsk med vilje.
- Header: kun telefon-ikon. Ankerlenker lander under headeren riktig.
  Stillingstitler normaliseres («barber» → «Barber») og oversettes.
- Favicon fra logoen (ico/svg/apple), OpenGraph-bilde, robots.txt, sitemap,
  JSON-LD `HairSalon`.

**Admin (bygg 2–3)**
- Eier-rollen (Dawit) låses ikke lenger ute av /admin.
- Dashboard/Regnskap/Revisor: «Omsetning måned» bruker samme Fixit-skille som
  grafen (merket «inkl. Fixit-historikk»).
- Bilde kan lastes opp på eksisterende ansatt (Rediger → Bilde).
- Kundeklubb-telling riktig (var kappet på 1000 av PostgREST).
- Kassa: tjenester gruppert per kategori, Ny booking foreslår første ordinære
  tjeneste, telefon øverst i bookingdetaljer, «Ikke møtt» først etter start,
  datoformat «Mandag 5. oktober», døde hero-felt i Nettside-innstillinger
  samlet under «Skjulte hero-tekster».

**Kasse (bygg 4) – Hurtigsalg v2**
- Behandling + flere tillegg i samme salg (egne `sale_items`-linjer).
- Gavekort som (del)betaling i betalingssteget – atomisk med salget, logget
  som betalingslinje «Gavekort» + `gift_card_redemptions`. Ny RPC
  `record_walkin_sale_v2` (`KJØR-I-SUPABASE-HURTIGSALG-V2.sql`, kjørt).

**Data (SQL kjørt)**
- `KJØR-I-SUPABASE-SAMTYKKE-FIXIT.sql`: markedsføringssamtykke = ja på
  Fixit-importerte kunder (6 424 av 6 426), dokumentert i
  `marketing_consent_source = 'fixit'`. Avmeldte/aktivt valgte røres ikke.
- `KJØR-I-SUPABASE-KUNDEVASK.sql`: telefonnummer som lå som fornavn er flyttet.

**Bygg 5 (dette bygget)**
- «Generer og send lønnsoversikter» har bekreftelse i siden med måned,
  mottakere og beløp (erstatter window.confirm).
- Innlogget bruker med feil rolle får egen side `/ingen-tilgang` (hvem du er,
  hvilken rolle, knapp tilbake til din side / logg ut) i stedet for
  innloggingsskjemaet.

**Verifisert live:** rollesperrer (kasse og revisor avvises på /admin m.fl.),
shop-flagg håndheves for kasse, eksporter (CSV/Excel) fungerer, Tripletex-synk
og saldobalanse laster, ingen konsollfeil på noen side.

---

## 4. DEPLOY-SJEKKLISTE for dette bygget

**A) SQL:** ingen.
**B) Push** i GitHub Desktop (commit-tittel i `ENDRINGER.md`).
**C) Test:** logg inn som kasse → åpne /admin → skal vise «Ingen tilgang»-siden
med «Til kassa»-knapp. Revisor → Lønnsoversikt → knappen skal vise
bekreftelse med navn og beløp før noe sendes.

---

## 5. Må gjøres i admin (ikke kode) — FØR LIVE

Avklart 5. okt: David/Vani/Soren/Mehetabel er **ekte** Fixit-barberer, og
augustsalget (472 salg, 307 738 kr) er ekte historikk som skal stå.

- **David** → Inaktiv (har sluttet). Historikk beholdes.
- **Mehetabel** → forblir inaktiv til hun er tilbake; aktiver + turnus da.
- **Vani og Soren** (fortsatt i stolen) → legg inn e-post, bilde, nivå (Vani
  mangler), og sjekk at turnusen man–fre 9–17 stemmer.
- **Kochari og Qasim** → turnus (uten er de bookbare 09–21 alle dager, og
  timeutnyttelsen regnes mot 324 t/mnd). Rett tittel «barber» → «Barber».
- **Dawit og Riccardo** → opprett med e-post, nivå (Master/Senior), bilde,
  turnus. Dawit: bruker med rollen **Eier** under /admin/brukere.
- **Nivåer:** Kochari = Barber, Qasim + Riccardo = Senior, Dawit = Master.
- **Rating:** Nettside → «Vis vurdering på forsiden: Nei» til Google Places
  er koblet (4,5/6 i hero er håndskrevet fallback).
- **Hero-bilder:** rydd evt. blanke bilder i /admin/nettside.

---

## 6. Go-live-blokkere (tredjepart / nøkler) — se /admin/go-live (5/9)

- **Domene:** koble downtownbarbers.no i Vercel + DNS i Domeneshop (venter på
  den som styrer dagens nettside). E-postlenker følger automatisk.
- **SMS:** velg leverandør på /admin/integrasjoner (GatewayAPI anbefalt).
- **Google Places:** nøkkel + Place-ID på /admin/rating → ekte stjerner/antall.
- **Vipps:** venter på Dawit (betalingsleverandør) → VIPPS_*-nøkler i Vercel.
  (Zettle er droppet; egen betalingsregistrering + leid terminal.)

---

## 7. Åpne punkter / ting å vite

- **SAF-T-eksporten** fra september finnes ikke i repoet lenger (trolig borte i
  overskrivingen 24. sept). Besluttet 5. okt: **ikke** gjenoppbygg nå.
- **Kasse-kundeliste** viser e-post, ikke telefon (telefon finnes i søk og i
  bookingdetaljer). Vurder å vise telefon i lista.
- **Hero-bildelasting:** ved load lastes poster + 3 bilder (~0,8 MB); alle 14
  lastes først etter hvert som karusellen sykler. Ikke en feil, men `next/image`
  ville gitt WebP/AVIF automatisk hvis mobil-hastighet blir et tema.
- **Språk-fallback:** nye tjenester/tekster lagt til i admin vises på norsk i
  EN-modus til `src/lib/i18n/content-map.ts` utvides (nøkkel = eksakt norsk
  tekst). Barber-titler oversettes via kartet `titles`.
- **Tillegg-varighet:** admin viser 15 min på alle fire tillegg (sluttrapporten
  fra september sa 10/10/10/5). Juster i /admin/tjenester hvis ønskelig.
- **Lønn:** regnes kun fra kassesalg (eks. mva = ÷1,25); august viser riktig
  provisjon fordi august-importen ligger i `sales`.
- **Kundeklubb:** alle 6 426 ligger på Bronse til salg registreres i kassa.
- **To Vercel-prosjekter** (downtownbarbers + downtownbarbers-2kfc) bør ryddes
  til ett; den gamle 2kfc-URL-en er død (404).

---

## 8. Nyttige fakta for neste økt

- Prod-URL (stabil): `downtownbarbers-kidus-girmas-projects.vercel.app`.
- Brukere: `jobb@downtownbarbers.no` (admin), `shop@` (kasse), `revisor@`
  (revisor). Roller settes på /admin/brukere. Eier-rolle finnes (ENUM
  `user_role`), ingen eier-bruker opprettet ennå.
- Supabase service-nøkkelen i repoets `.env.local` er en dummy – Claude kan
  ikke lese ekte DB fra skyen; `node_modules` finnes ikke på PC-en, så bygg
  skjer i sky-klonen.
- Fixit-historikk: `fixit_turnover_daily` (dagstotaler t.o.m. `FIXIT_CUTOVER` =
  2026-10-03 i `src/lib/fixit-history.ts`) brukes i grafer/måneds-KPI;
  augustsalg ligger i tillegg som rader i `sales` (per barber).
- Priser: Barber 499, Senior 549, Master 649 (Herreklipp 30'); nivåmatrise på
  /admin/nivaer. Voks = 149 kr (riktig).
- i18n: `src/lib/i18n/` (LanguageProvider, dictionary, T.tsx, content-map).
- Kasse-RPC-er: `record_sale` (booking), `record_walkin_sale_v2` (hurtigsalg),
  `redeem_gift_card_by_code` (gavekort-side), `find_gift_card`.
