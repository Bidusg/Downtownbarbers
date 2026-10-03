# Downtown Barbers — go-live & backlog

Oppdatert løpende. Tre lister: (A) gjenstående go-live-steg du gjør i kontoer/config,
(B) kode-fikser fra sikkerhetsrevisjonen som Claude tar, (C) nye features etter lansering.

---

## A. Go-live — konto/config (dine steg)

Rekkefølge:

1. **Supabase SQL** (SQL Editor → lim inn → Run, én om gangen):
   - [ ] `supabase/migrations/0072_sikkerhet_revoke_anon.sql` — fjerner anonym tilgang til kasse-/kundefunksjoner. *Kritisk.*
   - [ ] `KJØR-I-SUPABASE-FIXIT.sql` (repo-rota) — Fixit-tabell + historikk-import.
2. **Supabase → Authentication → Email**: [ ] slå av «Allow new users to sign up». (Ingen kundepåvirkning — kunder bruker ikke Supabase-konto.)
3. **Vercel → Settings → Environment Variables (Production)**:
   - [ ] `CRON_SECRET` — lang tilfeldig streng (Claude kan lage den). Låser cron-endepunktene.
   - [ ] `SUPABASE_SERVICE_ROLE_KEY` — fra Supabase → Settings → API. Uten den: ingen webhooks/cron/SMS.
   - [ ] `NEXT_PUBLIC_SITE_URL` — settes til endelig domene når det er klart.
   - [ ] `EMAIL_FROM` — verifisert avsender i Resend.
4. [ ] **Commit + push** (GitHub Desktop: skriv en Summary → Commit to main → Push) + **Redeploy** i Vercel.
   - Dette får blant annet ut sikkerhetsfiksen som fjerner debug-siden `/sjekk-epost` (ligger fortsatt live til koden er deployet).
5. [x] **Flytt kontrakter til privat** — kjørt, «0 kontrakter» = allerede rent.
6. [ ] **Domene-cutover**: downtownbarbers.no fra Wix → Vercel. Claude forbereder DNS-postene; du setter dem hos domeneleverandøren.
7. **Blokkert på tredjepart:**
   - [ ] **Vipps/betaling** — Dawit velger leverandør → så `VIPPS_*`-nøkler.
   - [ ] **SMS-leverandør** — velg (GatewayAPI anbefalt) → nøkkel på /admin/integrasjoner.
   - [ ] **Google omdømme** — Places-nøkkel + Place-ID på /admin/rating (valgfritt).

---

## B. Kode-fikser fra sikkerhetsrevisjonen (Claude tar)

- [ ] **Vipps-webhook: HMAC/signaturkontroll** — *må* på plass før Vipps går live (ellers kan hvem som helst markere bookinger som betalt). Krever Vipps webhook-hemmelighet.
- [ ] **requireRole-herding** på kasse-/admin-actions (forsvar i dybden, i tillegg til RLS).
- [ ] **Gavekort som betalingsmåte i kassa** — i dag trekkes bare saldo uten salgslinje → mangler i pengespor/regnskap.
- [ ] **Tripletex-bilag: guard for reservekonto 1990** — så ett salg på ukjent betalingsmåte ikke feiler hele dagsbilaget.
- [ ] **Cron-reminders: isoler per booking** — én feil skal ikke stoppe resten + oppfølgingsjobben.
- [ ] **Lønnsslipp-ZIP: bedre passord** enn postnummer.
- [ ] **Lønn: feriepenger + AGA** — beslutning med Kumar (slippene er merket «foreløpig» i dag).

---

## C. Nye features etter lansering

- [ ] **Ekte kundekontoer** — la kunder registrere seg + varig innlogging (slipper å skrive e-post hver gang). Forutsetning som bygges i samme jobb: lås kasse-funksjonene (`shop_customer_search`, `day_agenda`, m.fl.) til `admin/eier/shop/staff`, slik at en innlogget kunde aldri kan lese andre kunders data.
- [ ] **Arbeidstimer-historikk fra Fixit** (`.xls`-eksporten) inn i timeutnyttelse — hvis ønsket.
- [ ] **Fixit-historikk i flere visninger** (f.eks. /admin/omsetning-detalj) — hvis ønsket.
- [ ] **Supabase Pro** — vurder oppgradering når trafikken tar seg opp (din vurdering).
