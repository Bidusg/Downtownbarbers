# FREMDRIFT – Downtown Barbers-plattform

> Denne filen holdes ALLTID oppdatert med nøyaktig hvor byggingen står, slik at
> arbeidet kan gjenopptas automatisk i en ny økt hvis tokens tar slutt.

**Sist oppdatert:** 2026-08-23
**Nåværende fase:** Fase 2 (offentlig kundeside – første utkast klart)
**Stack:** Next.js (App Router, TS) · Tailwind · Supabase · Recharts · Stripe (+Vipps senere)

---

## Statusoversikt

| Fase | Tittel | Status |
|---|---|---|
| 0 | Fundament (Next.js, Tailwind, struktur) | ✅ Ferdig |
| 1 | Database, roller & datastrategi | ✅ Live på Supabase (skjema + seed kjørt, verifisert) |
| 2 | Offentlig kundeside | 🟡 Forside klar (statisk data); mangler egne undersider + ekte innhold |
| 3 | Booking & tilgjengelighet | ⬜ |
| 4 | Kasse/POS (shop) + shop-fremdriftsbar | ⬜ |
| 5 | Kundekartotek (CRM) | ⬜ |
| 6 | Ansatt-portal (senere) | ⬜ |
| 7 | Admin-dashboard & rapporter | ⬜ |
| 8 | Budsjett & mål | ⬜ |
| 9 | Produkter & nettbutikk | ⬜ |
| 10 | Turnus & fravær | ⬜ |
| 11 | Markedsføring | ⬜ |
| 12 | Stripe (booking-depositum) | ⬜ |
| 13 | Import, polering & test | ⬜ |

---

## Gjort så langt
- Next.js-prosjekt scaffoldet (TypeScript, Tailwind, App Router, src/).
- Avhengigheter: @supabase/supabase-js, @supabase/ssr, recharts, lucide-react, cva, clsx, tailwind-merge, date-fns.
- Databaseskjema `supabase/migrations/0001_init.sql`: roller (admin/shop/staff/customer), ansatte (m/ansattnr + kontrakt + bilde), tjenester, kunder, booking, rating, produkter/nettbutikk/gavekort, salg/kasseoppgjør, budsjett, dagsmål, markedsføring, innstillinger — med full Row Level Security.
- Seed `supabase/seed.sql`: salong-innstillinger, tjenestekategorier, team (6 ansatte).
- Supabase-klienter (klient + server), cn-util, `.env.example`.

## Rollemodell (låst)
- **admin**: alt.
- **shop**: operativ tilgang (booking, kunder, tjenester(les), salg, gavekort). INGEN budsjett/omsetning/kasseoppgjør-aggregat. Egen fremdriftsbar (fase 1: kundeantall/dag; senere: fast kronemål/dag).
- **staff** (senere): kun eget + månedsmål som 0–100 % bar uten kroner.

## Neste steg
1. Bygg auth-flyt + middleware (admin/shop innlogging).
2. Bygg offentlig kundeside (Fase 2).
3. **Trenger fra Kidus:** durabelt hjem for koden (GitHub-repo anbefalt) + Supabase-prosjekt (URL + nøkler).

## Blokkeringer / venter på bruker
- [ ] Supabase-prosjekt opprettet + nøkler i `.env.local`
- [ ] Beslutning: GitHub-repo for varig lagring (kritisk for auto-gjenopptak)
- [ ] Ekte prisliste (tjenester/pris/varighet)
- [ ] Logo + bilder
