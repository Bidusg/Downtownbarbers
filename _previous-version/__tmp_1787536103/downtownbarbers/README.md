# Downtown Barbers – plattform

Fullstack salong-plattform som erstatter Fixit: kundeside, booking, kasse/POS,
kundekartotek, nettbutikk, rapporter, budsjett og rating – med rolle-styrt tilgang
(admin / shop / ansatt) og visuelle dashboards.

## Stack
Next.js (App Router, TypeScript) · Tailwind CSS · Supabase (Postgres + Auth + Storage) ·
Recharts · Stripe (+ Vipps senere)

## Kom i gang
```bash
npm install
cp .env.example .env.local   # fyll inn Supabase-nøkler
npm run dev                  # http://localhost:3000
```

## Database
SQL ligger i `supabase/`:
- `migrations/0001_init.sql` – hele skjemaet med Row Level Security
- `seed.sql` – grunndata (salong, kategorier, team)

Kjøres i Supabase (SQL Editor eller `supabase db push` med Supabase CLI).

## Roller
- **admin** – full tilgang (økonomi, rapporter, budsjett, styring)
- **shop** – skranke-konto: booking, kasse, kunder, gavekort. Ingen sensitive tall. Egen dags-fremdriftsbar.
- **staff** (senere) – kun eget: kalender, rating, månedsmål som 0–100 % bar uten kroner.

## Status
Se `FREMDRIFT.md` for nøyaktig byggestatus per fase.
