# Downtown Barbers – teknisk oppsett: domene + e-post

**Til:** deg som administrerer nettsiden og DNS for Downtown Barbers
**Fra:** Kidus (prosjektledelse, ny plattform)
**Gjelder:** koble `downtownbarbers.no` til den nye plattformen (hostet på Vercel) og slå på utgående e-post (via Resend). DNS styres i **Domeneshop**.

Kort forklart: den nye siden ligger klar på Vercel, og all e-post (bookingbekreftelser, påminnelser, ansatt-innlogging og lønnslipper) sendes via Resend. Begge trenger noen DNS-oppføringer i Domeneshop. **Alle verdier under skal kopieres nøyaktig fra dashbordene** (Vercel/Resend genererer domene-spesifikke verdier – ikke gjett).

Det er to uavhengige deler – A (domenet) og B (e-post). Begge gjøres i Domeneshop under **DNS / pekere** for `downtownbarbers.no`.

---

## Del A – Koble domenet til Vercel

**I Vercel** (prosjektet `downtownbarbers-2kfc`, team «Kidus Girma's projects»): Settings → Domains → **Add** `downtownbarbers.no` (og `www.downtownbarbers.no`). Vercel viser da nøyaktig hvilke DNS-oppføringer som trengs («domain card»). Bruk de verdiene Vercel viser.

**I Domeneshop** legger du inn (typiske verdier – bruk det Vercel faktisk viser):

| Type  | Navn/host | Verdi |
|-------|-----------|-------|
| A     | `@` (rot) | IP-en Vercel viser (som regel `76.76.21.21`, nyere prosjekter kan få f.eks. `216.198.79.1`) |
| CNAME | `www`     | CNAME-målet Vercel viser (f.eks. `cname.vercel-dns.com` eller en prosjekt-spesifikk `…vercel-dns-###.com`) |

Viktig:
- **Fjern eventuelle AAAA-oppføringer** på roten (`@`) – Vercel støtter ikke IPv6 for domener via tredjeparts-DNS.
- Har dere en **CAA-oppføring**, må den tillate **Let's Encrypt** (`letsencrypt.org`), ellers får ikke Vercel utstedt SSL-sertifikat.
- Ikke pek `@` mot både A og CNAME samtidig.

Når oppføringene er lagt inn, går Vercel automatisk fra «Invalid Configuration» til «Valid» (kan ta fra minutter til noen timer pga. DNS-propagering), og SSL settes opp av seg selv.

---

## Del B – Slå på e-post via Resend

**I Resend** (resend.com): Domains → **Add Domain** → `downtownbarbers.no`. Resend viser da et sett DNS-oppføringer med **unike verdier for dette domenet**. Legg dem inn i Domeneshop nøyaktig som vist. Strukturen er:

| Type  | Host (navn) | Verdi |
|-------|-------------|-------|
| MX    | `send` | `feedback-smtp.<region>.amazonses.com` (prioritet `10`) |
| TXT   | `send` | `v=spf1 include:amazonses.com ~all` |
| CNAME | `<token>._domainkey` | `<token>.dkim.amazonses.com` — **tre** slike DKIM-oppføringer, hver med sin unike token |

Valgfritt, men anbefalt (kan legges inn etter at domenet er verifisert):
- **CNAME** `links` → sporingsverdien Resend viser (for klikk-sporing i e-post).
- **TXT** `_dmarc` → en DMARC-policy, f.eks. `v=DMARC1; p=none; rua=mailto:post@downtownbarbers.no` (start med `p=none`).

Merk: Domeneshop legger ofte domenenavnet til automatisk, så host skrives som `send` og `<token>._domainkey` (ikke med `.downtownbarbers.no` bak). Sjekk hvordan Domeneshop viser eksisterende oppføringer og følg samme mønster.

Når Resend viser domenet som **Verified**, si ifra til Kidus – da settes avsenderadressen (se Del C).

---

## Del C – Miljøvariabler i Vercel (Kidus setter disse)

Når A og B er på plass, settes disse i Vercel → Settings → Environment Variables (Production), og prosjektet re-deployes:

- `NEXT_PUBLIC_SITE_URL` = `https://downtownbarbers.no`
- `EMAIL_FROM` = f.eks. `Downtown Barbers <ikkesvar@downtownbarbers.no>` (må være på det verifiserte domenet)

Disse er allerede satt og trenger ingen endring: `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## Del D – Midlertidig (gjør nå, uavhengig av domenet)

Til domenet er live: sett `NEXT_PUBLIC_SITE_URL` = `https://downtownbarbers-2kfc.vercel.app` i Vercel nå. Ellers peker lenkene i e-postene på et domene som ennå ikke svarer.

---

## Kort sjekkliste

- [ ] Vercel: lagt til `downtownbarbers.no` + `www` i prosjektet
- [ ] Domeneshop: A `@` + CNAME `www` (verdier fra Vercel), AAAA fjernet, CAA tillater Let's Encrypt
- [ ] Vercel viser domenet som «Valid» + SSL aktivt
- [ ] Resend: lagt til domenet, hentet DNS-oppføringene
- [ ] Domeneshop: MX + SPF (`send`) + 3× DKIM CNAME lagt inn (evt. `links` + `_dmarc`)
- [ ] Resend viser domenet som «Verified»
- [ ] Kidus: satt `NEXT_PUBLIC_SITE_URL` + `EMAIL_FROM` i Vercel og re-deployet

Spørsmål underveis? Ta kontakt med Kidus, så kan vi ev. ta en skjermdeling på de nøyaktige verdiene fra Vercel/Resend.
