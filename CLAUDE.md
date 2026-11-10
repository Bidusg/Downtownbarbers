@AGENTS.md

# Downtown Barbers – instruks for Claude Code

Plattform for barbersalongen Downtown Barbers AS (Oslo) som erstatter kassesystemet Fixit:
nettside + booking, kundeportal, nettbutikk, kasse/POS (iPad), back-office (admin/eier),
ansattportal + app, og revisorportal. Live på https://downtownbarbers.no.

**Les `docs/SYSTEMOVERSIKT.md` før du gjør større endringer.** Den forklarer hele systemet:
dataflyt, tabeller, RPC-er, roller, hvert område og kjente fallgruver.

## Stack
Next.js 16 (App Router – NB: nyere enn treningsdataene dine, se AGENTS.md) · React 19 · TypeScript strict ·
Tailwind v4 (OKLCH-tokens i `src/app/globals.css`) · Supabase (Postgres + RLS + Auth + Storage) ·
Vercel (push til `main` = produksjon) · Resend (e-post) · @react-pdf/renderer · exceljs · Capacitor (`app-ansatt/`).

## Kommandoer
```bash
npm run dev
npx next typegen && npx tsc --noEmit    # typesjekk (typegen trengs for LayoutProps m.m.)
npx eslint <filer du endret>            # kjente gamle lint-feil: BookingWizard, CommandPalette, ansatt/turnus
npm run test:e2e                        # Playwright
```

## Arkitektur i én setning
Side (server component) henter data via `src/lib/*` → klientkomponent viser → server action (`actions.ts`,
`"use server"`, alltid `requireRole`) skriver → atomiske operasjoner er Postgres-RPC-er (`security definer`) →
`revalidatePath`. RLS i databasen er siste forsvarslinje.

## Roller (`src/lib/auth.ts`)
`admin` og `eier` (likestilt, `isAdminRole`) → `/admin` · `shop` → `/kasse` · `staff` → `/ansatt` ·
`revisor` → `/revisor` (ser alle tall, kan i hovedsak bare lese) · `customer`.
Kunder logger inn med engangskode + cookie `dtb_kunde` (ikke Supabase Auth).

## Regler du MÅ følge
1. **`git pull` før du starter.** Ikke jobb på en gammel kopi.
2. **Skjemaendringer = ny fil `KJØR-I-SUPABASE-<NAVN>.sql` i roten.** Ingen automatisk migrering – Kidus limer
   filene inn i Supabase SQL Editor manuelt. Filene skal være idempotente (`if not exists`, `create or replace`,
   `drop policy if exists`), ha norsk header-kommentar, ende med `notify pgrst, 'reload schema';`, og nye
   `security definer`-funksjoner skal ha `revoke … from public, anon` + `grant … to authenticated`.
3. **Koden skal tåle at SQL ikke er kjørt ennå** («degrader trygt»: fallback-select uten ny kolonne, eller
   feilmelding som sier hvilken `KJØR-I-SUPABASE-*.sql` som må kjøres).
4. **PostgREST gir maks 1000 rader** – bruk `.range()`-paging for salg, kunder, bookinger osv.
5. **ENUM-er:** `booking_status` og `user_role` – sammenlign med `::text`.
6. **Tidssone:** lagre UTC, vis Oslo-tid (`src/lib/oslo-time.ts`). Vercel kjører i UTC.
7. **Sensitive data** (kontonr, lønn, PIN) aldri i `staff` (kassa og anon kan lese den) – bruk `salary_settings` e.l.
   Nye offentlige `staff`-kolonner krever `grant select (kol) on staff to anon`.
8. **Valider og beregn beløp på serveren/i databasen**, aldri i klienten.
9. **Gjenbruk** `src/components/ui/*` (Card, Table, StatTile, Button, Input/Select/Field, ConfirmButton,
   LiveSearchInput …) og `src/lib/*`. Nye sider legges inn i `src/lib/admin-nav.ts` / `backoffice-nav.ts`.
10. **All tekst i UI er norsk bokmål.** Beløp `toLocaleString("nb-NO") + " kr"`. Kassa brukes på iPad – touch-vennlig.
11. **Tripletex-broen skal aldri bokføre selv** – bare lage utkast (`sendToLedger=false`).
12. **Spør før destruktive handlinger** mot produksjonsdata.
13. **Avslutt hver leveranse** med kort norsk oppsummering, **git-tittel + beskrivelse**, og liste over
    `KJØR-I-SUPABASE-*.sql` som må kjøres (i rekkefølge). Verifiser med typesjekk/lint før du sier at noe er ferdig,
    og si ærlig hva som ikke er testet.

## Viktige steder
| Område | Filer |
|---|---|
| Booking | `src/components/booking/BookingWizard.tsx`, `src/app/booking/cart-actions.ts` (ekte flyt; `booking/actions.ts` er død kode), RPC `create_booking_group`, `available_slots_dur` |
| Kasse | `src/app/kasse/actions.ts`, `src/components/kasse/DayCalendar.tsx`, `PaymentControls.tsx`, `QuickSale.tsx`, RPC `record_sale`, `record_walkin_sale_v2` |
| Kasseoppgjør | `src/app/{kasse,admin}/kasseoppgjor/*`, `src/lib/ops-queries.ts` (`getExpectedByMethodForDate`, `getDailyReconciliation`), `src/lib/fixit-settlement.ts`, RPC `edit_cash_settlement` |
| Turnus | `staff_hours` (+ `settings.turnus_rotation`, `turnus_week_parity`), `src/app/admin/timelister/*`, `src/lib/turnus.ts` |
| Lønn | `src/lib/salary/*` (`computeSalary`), `src/lib/ops-queries.ts` (`getPayroll`, `PAYROLL`), `src/lib/payroll-slips.ts`, `src/lib/pdf/lonnsrapport.tsx` |
| Nøkkeltall | `src/lib/kpi-revenue.ts` (filtre), `src/lib/kpi-queries.ts`, `src/app/admin/nokkeltall/page.tsx` |
| Auth/roller | `src/lib/auth.ts`, `src/proxy.ts`, `src/lib/supabase/{server,client,public,service,middleware}.ts` |
| E-post/SMS | `src/lib/email.ts`, `src/lib/sms.ts`, `src/lib/marketing-worker.ts` |
| Regnskap | `src/lib/tripletex/*`, `src/lib/accounting.ts` |

Folk: Dawit = eier (heter «David» i ansattabellen), Kumar = revisor, Kidus = prosjektleder som bestiller arbeidet.
