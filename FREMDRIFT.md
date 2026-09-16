# FREMDRIFT – Downtown Barbers-plattform

**Sist oppdatert:** 2026-09-16
**Stack:** Next.js 16 (App Router, TS) · Tailwind v4 · Supabase (Postgres + RLS + RPC) · Recharts · Resend (e-post) · Vipps · Zettle · Vercel
**Produksjon:** https://downtownbarbers-2kfc.vercel.app (Vercel-scope `kidus-girmas-projects`)
**DB-migrasjoner:** kjøres manuelt i Supabase SQL Editor (samlefil: `KJØR-I-SUPABASE.sql`). Alle er idempotente.

> Denne fila er den løpende byggeloggen. Oppdateres for hver leveranse: hva som er bygget, hva som gjenstår, og hva som venter på Kidus/klient.

---

## ✅ Ferdig bygget

### Fundament
- Scaffold, bygger feilfritt. Ekte merkevare-design (varm lys/mørk OKLCH, aksent #F47721, Playfair).
- Supabase-skjema + RLS for roller admin / shop / ansatt. Auth via Supabase + proxy/middleware (Next 16) med rolle-beskyttelse.
- Seed: 6 barbere + 8 tjenester.

### Kundeflate (offentlig)
- Forside med LIVE data: hero, tjenester (ekte priser), team, galleri, åpningstider, kontakt/kart, samlet omdømme-snitt.
- Booking: flerstegs veiviser (tjeneste → barber → tid → kontakt → bekreftelse), lagrer til Supabase.
- Ledige tider (`available_slots`) tar hensyn til: salongens åpningstider ∩ barberens turnus (uke A/B) ∩ avvik/fravær ∩ eksisterende bookinger.
- Kundeportal (`/min-side/<token>`), avbestilling, GDPR persondata-eksport, avmelding fra markedsføring.

### Admin
- Dashboards: nøkkeltall + graf + månedsmål.
- CRUD/drift: tjenester, ansatte (ansattnr, bilde, kontrakt-opplasting til Storage), bookinger, kunder (CRM), produkter, lager, gavekort, kampanjer, budsjett, måloppnåelse, rapporter (m/ Excel-eksport), regnskap, omsetning, oppfølging, nøkkeltall, brukeradmin.
- **Nettside**: rediger forsideinnhold + strukturerte åpningstider (styrer både visning og booking).
- **Timelister / turnus**: uke A/B med konfigurerbart anker, visuell ukeplan, redigering per barber (inkl. inline «Endre» + «Kopier uke A ↔ B»). **Avvik & fravær** per dato (fri hel/del av dag, ekstravakt).
- **Fravær** (`/admin/fravaer`): flerdagers ferie/sykdom — blokkerer nå også booking.
- **Rating/omdømme**: aggregert snitt fra Google + TripAdvisor + egne kunder. Nøkler/ID-er kobles til direkte i `/admin/rating` (lagres admin-only, env-fallback).
- **Markedsføring**: e-post + SMS, samtykke-først, segmenter (alle / gullkunder / inaktive), avmeldingslenke + «svar STOPP». Liste over innkommende STOPP/START-svar.

### Kasse (shop)
- Dagskalender, kundesøk, stempling inn/ut.
- Salg/kasseoppgjør → fyller omsetning + rating-grunnlag.
- Flytt kunde til annen barber med **PIN-godkjenning** fra opprinnelig barber (drag-and-drop). «Flytt»-knapp låst til PIN-flyten.
- Kunde bookt hos barber X krediteres alltid X uansett hvem som slår inn.

### Integrasjoner / infrastruktur
- Betaling: Vipps ePayment (mock + ekte webhook + capture).
- POS: Zettle sync + webhook. Eksterne salg.
- Påminnelser (e-post + SMS) + oppfølging via Vercel Cron.
- **SMS**: leverandør-uavhengig A2P-utsending (GatewayAPI / Sveve / Twilio / generisk). Innkommende **STOPP/START** via `/api/sms/inbound` → styrer samtykke.
- Kundekilde-sporing.

### Migrasjoner
0001–0030. Nyeste: 0027 innkommende SMS · 0028 avvik/fravær · 0029 kopier turnus A↔B · 0030 omdømme-config (admin).

---

## 🔜 Backlog (mulige neste bygg)
1. Verifisering innlogget: QA-gjennomgang av kasse/admin (kundetall, drag-med-PIN, turnus-anker, SMS-kanal).
2. Native mobilapp (Spor B) — plattformen er bygget app-klar (tynne komponenter, logikk i `src/lib` + API-ruter).

---

## ⏳ Venter på Kidus / klient (konfig, ikke kode)
- **Push + kjør SQL** for hver leveranse (GitHub Desktop + `KJØR-I-SUPABASE.sql` i Supabase).
- **A2P SMS-leverandør**: velg leverandør, sett callback-URL til `/api/sms/inbound`, og `SMS_INBOUND_SECRET` i Vercel. (Se prosjektnotat — «senere»-oppgave.)
- **Omdømme live**: legg inn Google/TripAdvisor place-ID + API-nøkler i `/admin/rating`. For at nøklene skal drive den OFFENTLIGE forsiden må `SUPABASE_SERVICE_ROLE_KEY` være satt i Vercel (ellers faller forsiden tilbake til env-variablene).
- **Vipps** business-legitimasjon.
- **Supabase Pro** før go-live (unngå auto-pause på ekte kundebookinger).
- **Rydd Vercel**: to prosjekter i dag (`downtownbarbers` + `downtownbarbers-2kfc`). Kjør alt på `-2kfc`, gjerne eget domene (f.eks. `booking.downtownbarbers.no`).
- **DNS-cutover fra fixit.no** — krever eierens uttrykkelige godkjenning (tar ned den gamle live-siden).

---

## Arbeidsflyt (for oss)
- Kode redigeres i skyklonen, verifiseres med `npm run build`, leveres byte-eksakt til laptop-repoet (`…\DZ review\Downtownbarbers`). Kidus committer + pusher via GitHub Desktop.
- Migrasjoner kjøres manuelt i Supabase (auto-kjøres ikke). Alltid idempotente.
- `_previous-version/` er den gamle appen — ikke i bruk.
