# Downtown Barbers — sluttrapport, live test

**Dato:** 19. september 2026
**Metode:** Ekte bruker-gjennomklikk på produksjonssiden (`downtownbarbers-2kfc.vercel.app`), én rolle om gangen (Chrome deler én innlogging per profil). Ingen booking/salg/betaling fullført — prod-data urørt. Ingen filer lastet ned.
**Roller testet:** shop/kasse · admin · revisor.

---

## Kort oppsummert

Alt som ble testet **fungerer teknisk — ingen sider krasjet.** Rollegating er riktig på alle tre flater. De reelle hullene er funksjonelle (ting som ikke er bygd ferdig eller ikke er koblet på), ikke feil i det som finnes. De største blokkerne er fortsatt de kjente go-live-punktene (domene + Resend-e-post, Vipps-terminal, SMS/Google-nøkler).

---

## Per rolle

### 🟢 Shop / kasse
- Dashboard, «+ Ny booking»-dialog, kundekartotek (6425, søk), stempling (PIN-klokke, 6 ansatte) — alt laster og rendrer riktig.
- Personvern riktig: shop ser aldri omsetning/lønnsomhet; telefon skjult, kun e-post.
- Rollegating: `/admin` og `/revisor` blokkeres.

### 🟢 Admin (innlogget `jobb@downtownbarbers.no`)
15 sider gjennomgått. Fungerer: Dashboard, Bookinger (dagskalender), Ansatte, Kunder (paginering 129 sider), Kundekort (klubbnivå, GDPR, samtykke, PDF), Nøkkeltall, Produktivitet, Integrasjoner (full SMS-config), Go-live (3/10, live-status).

### 🟢 Revisor
- Rollegating riktig: `/admin` blokkert, `/revisor` + undersider åpne.
- Fungerer: Oversikt (nøkkeltall, graf m/ tooltip, per barber, per betalingsmåte, SAF-T-eksport), Omsetning, Lønnsslipper (full tabell, korrekt merket «foreløpig, uten skattetrekk»).

---

## Funn fra live-testen (nye/bekreftede)

**Data**
1. **Fixit-historikk er ikke importert — kun kundekortene.** Alle 6425 kunder viser 0 bookinger / «— sist besøkt», «kunde siden 08.09.2026». Derfor står klubbnivå og livstidsforbruk på null for alle. Trenger booking-eksport fra Fixit.
2. **Ingen ansatte kan logge inn** — alle 6 «Mangler e-post». Hele onboarding-løpet er blokkert til Resend-e-post er koblet.

**Rolle / logikk**
3. **Skrivehandling hos «read-only» revisor:** Lønnsslipper-siden har «Generer og send lønnsslipper» (lager PDF-er i ansattes private mapper) tross banneret «Read-only tilgang for revisor». Bør avklares.
4. **To ulike timeutnyttelser som motsier hverandre:** Nøkkeltall regner mot åpningstid, Produktivitet mot turnus (viser «/ 0 t» fordi staff_hours er tom). Samle til én definisjon; fyll inn turnus.

**Funksjon ikke ferdig**
5. **Nedboring virker ikke** på revisor Oversikt («klikk et punkt … bore ned i en dag») og Omsetning («klikk en dag …») — klikk gjør ingenting utover tooltip.
6. **Regnskap** («Bilag og hovedbok» i menyen) viser bare omsetning — ingen bilag/hovedbok/kontoplan.
7. **Kasseoppgjør** avstemmer ikke (bare ett totalbeløp), **Kampanjer** er dublett av Markedsføring.

**UI-polish (raske fikser)**
8. Utviklertekst i produksjon: `/admin/lonn` viser «…justerer jeg satsen ett sted i `src/lib/ops-queries.ts`».
9. Rå engelsk fil-input («Choose File / No file chosen») i Ny ansatt-skjemaet.
10. Lønnsslipp uten skattetrekk (interim).

*Kundeklubb ble bedre enn tidligere antatt: nivå-editoren finnes og er redigerbar. Mangler kun: se hvem som er på hvert nivå + legge til/fjerne nivåer.*

---

## Anbefalt rekkefølge

1. **Raske UI-seire nå:** fjern utviklerteksten (#8), style fil-input (#9).
2. **Rolle/logikk:** avklar revisor-lønnsknappen (#3), samle timeutnyttelsen (#4).
3. **Fullfør funksjon:** koble på nedboring (#5) eller fjern teksten; rydd Regnskap (#6) og Kampanjer vs. Markedsføring (#7).
4. **Data & go-live (avhenger av tredjepart/nøkler):** Fixit booking-import (#1), Resend-e-post → ansatt-onboarding (#2), Vipps-terminal, SMS/Google.

> Full, detaljert liste med filreferanser: `Downtown-Barbers-forbedringer-og-mangler.md`.
