# Sluttrapport & overlevering — Downtown Barbers-plattformen

**Dato:** 2026-09-16 · **Formål:** la en ny økt/agent fortsette byggingen uten forrige chats kontekst. Les denne + `FREMDRIFT.md` først.

---

## 1. Hva dette er
Komplett web-plattform for barbershop-klienten Downtown Barbers AS (Oslo): egen booking, kasse/POS-flyt, admin-drift, kundeportal og omdømme — bygget for å erstatte tredjepartsleverandøren fixit.no. Kidus er utvikler/prosjektleder; Dawit Solomon Mengistu eier salongen.

**Stack:** Next.js 16 (App Router, TS) · Tailwind v4 · Supabase (Postgres + RLS + SECURITY DEFINER-RPC) · Recharts · Resend (e-post) · Vipps · Zettle · exceljs/@react-pdf · Vercel.

## 2. Hvor ting er (viktig for å jobbe)
- **GitHub-repo:** `github.com/Bidusg/Downtownbarbers` (branch `main`).
- **Kidus' laptop-repo (connected folder):** `C:\Users\Melat\Documents\GitHub\DZ review\Downtownbarbers`.
- **Produksjon (den som VIRKER):** `https://downtownbarbers-2kfc.vercel.app` (Vercel-scope `kidus-girmas-projects`).
  - NB: Det finnes et **annet, ødelagt Vercel-prosjekt** `downtownbarbers` (rå deploy-URL gir `MIDDLEWARE_INVOCATION_FAILED`, mangler trolig Supabase-env). Bruk `-2kfc`. Rydd bort det andre ved anledning.
- **Supabase-prosjekt:** ref `kekdspamodouqqeptxwa` → SQL Editor for migrasjoner.
- **Nøkkeldokumenter i repoet:** `FREMDRIFT.md` (levende byggelogg), `KJØR-I-SUPABASE.sql` (samlet, idempotent migrasjons-SQL), `AGENTS.md` (les!), denne fila.

## 3. Arbeidsflyt & regler (følg nøyaktig)
1. **`AGENTS.md`: dette er IKKE standard Next.js.** Les relevant guide i `node_modules/next/dist/docs/` før du skriver ruter/actions/config.
2. **Bygg i skyklonen:** `git clone` repoet til `/home/claude/dtb`, `npm install`, rediger, `npm run build` til grønt.
3. **Levering:** lever filer **byte-eksakt** til laptop-repoet via `device_commit_files`, og **verifiser filstørrelser** med `device_list_dir` etterpå.
4. **Aldri push herfra.** Kidus committer + pusher selv via GitHub Desktop. (Stop-hook maser om «uncommitted changes» i skyklonen — ignorer; det er scratch.)
5. **Migrasjoner kjøres ALDRI automatisk.** De limes inn i Supabase SQL Editor. Hold ALT idempotent (`create ... if not exists`, `create or replace`, `drop policy if exists`, `on conflict do nothing`). Legg hver ny migrasjon til `KJØR-I-SUPABASE.sql` også.
6. **Fast to-stegs leveranse til Kidus:** «Push i GitHub Desktop → kjør `KJØR-I-SUPABASE.sql` i Supabase».
7. **Kan ikke skrive passord:** for live-verifisering logger Kidus inn (roller: admin=`jobb`, kasse=`shop`, revisor=`revisor`, øvrige `@downtownbarbers.no`; passord oppgir Kidus — ikke lagret her).
8. **Sikkerhet i review:** RLS på alle nye tabeller (`is_admin()`, ev. `is_shop_or_admin()`); aldri hemmeligheter (`pin_hash`, `portal_token`, API-nøkler) i offentlig lesbare tabeller eller eksporter; SECURITY DEFINER + `grant ... to anon` kun for ufarlige aggregat.

### Subagent-flyt med kvalitetsport (brukt for de siste pakkene, funker godt)
Én byggesubagent per arbeidspakke (egen isolert jobb) → subagenten kjører `npm run build` + krysser av selv-godkjenningsliste → leverer rapport til hovedøkta → **hovedøkta gjør uavhengig review** (leser filene, kjører bygget selv) → ved mangler sendes det tilbake til SAMME subagent med konkret punktliste → når grønt: hovedøkta integrerer delte filer (nav, samle-SQL, byggelogg), bygger samlet, leverer. Kjør subagentene **sekvensielt** (delt `.next` tåler ikke samtidige bygg).

## 4. Status — hva er bygget
Plattformen er funksjonelt komplett mot «Fixit-gapet»: **alle 14 gap-punktene er ferdig** (se `Sammenligning_og_gap_STATUS.md`). Migrasjoner **0001–0034**.

Bygget i denne perioden (migrasjoner 0024–0034):
- 0024 offentlig omdømme-aggregat · 0025 turnus uke A/B + anker · 0026 åpningstider styrer booking · 0027 innkommende SMS (STOPP/START) · 0028 avvik/fravær per dato · 0029 kopier turnus A↔B · 0030 omdømme-config i admin · 0031 tjeneste-katalog (online-bookbar, popularitet, behandlingsunntak per ansatt) · 0032 driftsmeldinger · 0033 dokumentsenter · 0034 kundeklubb (medlemsnivåer).
- Tilhørende admin-sider: `/admin/meldinger`, `/admin/dokumenter`, `/admin/kundeklubb`, «Eksporter alt» på `/admin/rapporter`, omdømme-config på `/admin/rating`, avvik + turnus-kopiering på `/admin/timelister`, STOPP-liste på `/admin/markedsforing`.

**Deploy-status:** Kidus pusher og kjører SQL i bolker. Sjekk hva som faktisk er live før du antar noe (rå deploy-URL kan vise gammel kode; test på `-2kfc`-domenet). Kundeklubb (0034) og tjeneste-katalog (0031) var de siste — bekreft at de er pushet + SQL kjørt.

## 5. Åpne oppgaver / backlog
**UX-forbedringer (fra `UX-gjennomgang.md`, prioritert):**
- Quick wins: «Logg ut» i kasse- og ansatt-panelet (mangler helt); tilgangsfeil-melding på `/logg-inn` (`?feil=tilgang` leses ikke i dag); klikkbart telefon/adresse i header; konsistente tilbake-lenker i kassa; auto-«Neste» i booking; aktiv-markering i revisor-nav.
- Større: **kasse-topbar** (`kasse/layout.tsx` finnes ikke — man kan ikke bytte direkte mellom kalender/kunder/stempling); **ny datovelger i booking** (i dag amerikansk `mm/dd/yyyy`-skrivefelt — bytt til kalender/klikkbare dager); **ansatt-selvbetjening** (min turnus, mine fravær, mine timer); **admin Cmd+K-søk** over 24 sider + del opp «Salg & marked» + mobil-accordion.

**Konfig som gjenstår (Kidus/Dawit, ikke kode):**
- SMS: velg A2P-leverandør, koble callback-URL til `/api/sms/inbound`, sett `SMS_INBOUND_SECRET` i Vercel.
- Omdømme live: legg Google/TripAdvisor place-ID + nøkler i `/admin/rating`; `SUPABASE_SERVICE_ROLE_KEY` må være satt i Vercel for at nøklene skal drive den offentlige forsiden.
- Vipps business-legitimasjon; Supabase Pro før go-live; rydd bort det ekstra Vercel-prosjektet; DNS-cutover fra fixit.no (krever Dawits godkjenning).

**Større spor (utenfor gap-lista):**
- **Native mobilapp (Spor B)** — plattformen er bygget app-klar (tynne komponenter, logikk i `src/lib` + API-ruter). Trenger egen arkitekturplan (React Native/Expo mot samme Supabase-backend).
- **Betalingsleverandør** — ikke valgt; låser opp automatisk omsetnings-innhenting.

## 6. Kjente fallgruver
- To Vercel-prosjekter; bruk `-2kfc`. Rå immutable deploy-URL-er kan gi 500 (preview-quirk) — test på domenet.
- PostgREST kutter på 1000 rader (`count:"exact", head:true` for tellinger; paginer med `.range()` for full-eksport).
- `device_bash`-mount mot laptop har vært ustabil (Windows-oppdatering) — verifiser leveranser med `device_list_dir`-størrelser når mount ikke virker.
- Server Actions body-grense er hevet til 4 MB (`next.config.ts`) for dokumentopplasting; Vercels serverless-tak er ~4,5 MB — store filer krever direkte Storage-opplasting senere.

## 7. Leveranser fra denne økta (ligger i chatten/on disk)
`FREMDRIFT.md` (byggelogg) · `KJØR-I-SUPABASE.sql` · `Sammenligning_og_gap_STATUS.md` (14/14 ferdig) · `BYGGEPLAN-subagenter.md` · `UX-gjennomgang.md` · denne `SLUTTRAPPORT.md`.

## 8. Anbefalt neste steg
Start med **UX quick wins-pakken** (logg ut i kasse+ansatt, tilgangsfeil-melding, telefon i header, konsistente tilbakelenker, auto-neste, aktiv-markering revisor) som én subagent-pakke gjennom kvalitetsporten. Deretter **kasse-topbar**, så **ny datovelger i booking**. Bekreft alltid live på `-2kfc` etter at Kidus har pushet + kjørt SQL.
