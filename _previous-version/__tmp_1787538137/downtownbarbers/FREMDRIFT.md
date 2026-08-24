# FREMDRIFT – Downtown Barbers-plattform ("min versjon")

**Sist oppdatert:** 2026-08-24
**Stack:** Next.js 16 (App Router, TS) · Tailwind v4 · Supabase · Recharts · Vipps (planlagt)

## Ferdig
- Fase 0: scaffold, bygger feilfritt.
- Fase 1: database live på Supabase (kekdspamodouqqeptxwa), fullt skjema + RLS (admin/shop/staff).
- Design: ekte merkevare (varm lys/mørk OKLCH, #F47721, Playfair) – reddet fra tidligere app.
- Forside: hero, tjenester (ekte priser), team, åpningstider, kontakt – LIVE data fra Supabase m/fallback.
- Booking: flerstegs veiviser (tjeneste→barber→tid→kontakt→bekreftelse) → lagrer til Supabase. LIVE data.
- Innlogging: Supabase auth + middleware + rolle-beskyttelse (admin/shop/ansatt).
- Dashboards: admin (nøkkeltall+graf+månedsmål), shop/kasse (dagsmål-bar, LIVE booking-data), ansatt (månedsmål uten kr).
- Admin-CRUD: tjenester (opprett/aktiver/slett), ansatte (opprett m/ansattnr+bilde+kontrakt-opplasting til Storage), bookinger-liste, regnskap, rating.
- Migrasjoner 0001–0005 (skjema, tjenester, trigger, public-booking, storage-bøtte).

## Neste steg
1. Koble admin-dashboard + ansatt-dashboard til ekte data (revenue trenger salg via kasse).
2. Kasse: registrere fullført salg / kasseoppgjør (fyller omsetning + rating-grunnlag).
3. Kundekartotek (CRM)-side. 4. Rating-innsending etter fullført time. 5. Vipps-betaling (gjenbruk fra _previous-version). 6. Nettbutikk.

## Venter på Kidus (kan ikke gjøres av Claude)
- Kjøre migrasjonene 0002–0005 i Supabase SQL Editor.
- Opprette admin + shop-brukere i Supabase Auth + sette roller.
- Pushe repoet til GitHub (GitHub Desktop → commit → push).

## Plassering
- Sky: /home/claude/downtownbarbers · Brukerens maskin: Documents\GitHub\Downtownbarbers (gammel app i _previous-version/).
