# Downtown Barbers — Rammeverk-integrasjon (instruksjoner for Claude Code)

Du jobber i det eksisterende Downtown Barbers-repoet (Next.js App Router + Supabase).
Nettside, booking, admin-panel, barber-portal, Resend-e-post og simulert Vipps
fungerer allerede lokalt. **Ikke ødelegg noe av dette.**

Denne pakken inneholder ferdige moduler som skal flettes inn i repoet. Målet:
**hele rammeverket ferdig nå, med mock-modus** — når ekte nøkler (Shopify, Vipps,
domene) kommer, skal go-live kun kreve utfylling av `.env`, null kodeendringer.

## Arkitekturprinsipper (ufravikelige)

1. **Mock-modus via config.ts.** All ekstern integrasjon leser tilstand fra
   `src/lib/config.ts`. Mangler nøkler → mock-data og simulert flyt, tydelig
   merket i UI med et diskret "Demo"-badge. Nøkler til stede → ekte API.
   Ingen `if (process.env...)` spredt rundt i komponenter — alt via config.
2. **App-klar arkitektur.** Siden skal senere bli en React Native-app.
   Derfor: all forretningslogikk i `src/lib/` og API-routes — komponenter er
   tynne. Appen skal kunne gjenbruke Supabase-klienten og de samme API-routene
   uendret.
3. **Kundens designsystem vinner.** Modulene i denne pakken bruker CSS-variabler
   (`--db-bg`, `--db-surface`, `--db-text`, `--db-muted`, `--db-accent`,
   `--db-border`). Finn de faktiske design-tokens i det eksisterende repoet
   (globals.css / tailwind.config) og map disse variablene til dem. Shop-siden
   skal være umulig å skille visuelt fra resten av siden.
4. **Norsk i alt brukervendt.** UI-tekst, e-poster, feilmeldinger: norsk.
   Kode, kommentarer, commits: engelsk.

## Fletteplan (utfør i denne rekkefølgen)

### Steg 1 — Konfigurasjonslag
- Kopier inn `src/lib/config.ts` og `.env.example`.
- Flytt eksisterende hardkodede verdier (Resend-avsender, base-URL osv.) inn
  i config. Legg til `.env.example`-variablene i lokal `.env.local` (tomme
  der nøkler mangler).

### Steg 2 — Shopify (/shop)
- Kopier inn `src/lib/shopify.ts`, `src/app/shop/page.tsx`,
  `src/components/shop/ProductGrid.tsx` og `ProductCard.tsx`.
- Tilpass komponentene til eksisterende layout (header/footer/nav) og
  design-tokens. Legg "Nettbutikk" i hovednavigasjonen.
- Uten nøkler viser siden 8 mock-produkter (definert i shopify.ts) med
  "Demo"-badge. Med nøkler hentes ekte produkter via Storefront API, og
  "Kjøp"-knappen oppretter en cart og sender kunden til Shopify checkout-URL.
- Ikke bygg egen handlekurv i v1 — direkte produktkort → Shopify checkout
  (cartCreate med én linje). Enkel, robust, rask å levere. Handlekurv kan
  legges på senere uten arkitekturendring.

### Steg 3 — Vipps (ekte struktur, mock-utførelse)
- Kopier inn `src/lib/vipps.ts` og API-routene under `src/app/api/vipps/`.
- Koble den **eksisterende betalingsmodalen** i bookingflyten til
  `POST /api/vipps/create` i stedet for dagens rene simulering:
  - Mock-modus: routen svarer med redirect til intern bekreftelsesside og
    markerer bookingen som betalt (samme sluttresultat som i dag, men nå
    gjennom den ekte kodebanen).
  - Test/prod-modus: routen oppretter ekte Vipps ePayment og returnerer
    Vipps' redirect-URL. Webhook-routen håndterer AUTHORIZED → capture →
    oppdater booking i Supabase.
- Bookingtabellen trenger felter for `payment_provider`, `payment_status`,
  `vipps_reference` hvis de ikke finnes — lag migrasjon.

### Steg 4 — E-post
- Bytt Resend-avsender til `config.email.from` (faller tilbake til
  `onboarding@resend.dev` til domenet er verifisert). Ingen annen endring.

### Steg 5 — Deploy-klargjøring
- Verifiser `npm run build` uten feil.
- Opprett GitHub- eller GitLab-repo, push.
- Følg `DEPLOY.md` for Vercel. Siden skal kunne deployes i dag på
  `*.vercel.app` — eget domene kobles når kunden leverer DNS-tilgang.

### Steg 6 — Verifisering (obligatorisk før du sier deg ferdig)
- Full bookingflyt lokalt: tjeneste → barber → tid → kontakt → mock-Vipps →
  bekreftelse + e-post + booking synlig i admin-panelet.
- /shop rendrer mock-produkter, responsivt ned til 375 px.
- `npm run build` grønn.
- Commit per steg, beskrivende meldinger.

## Go-live-prosedyren (det som gjenstår NÅR kunden leverer)

| Kunden leverer | Du gjør |
|---|---|
| Shopify-butikk + produkter | Fyll `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_STOREFRONT_TOKEN` |
| Vipps bedriftsavtale | Fyll de fem `VIPPS_*`-variablene, sett `VIPPS_ENV=test`, test, så `production` |
| Domenetilgang | Pek DNS til Vercel, verifiser domenet i Resend, sett `EMAIL_FROM` |

Ingenting annet. Det er hele poenget med rammeverket.
