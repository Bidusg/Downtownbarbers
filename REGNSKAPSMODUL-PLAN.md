# Regnskapsmodul — byggeplan

**Downtown Barbers · 20. september 2026**

Skisse for å ta «Regnskap»-siden fra å vise bare omsetning til en ekte
regnskapsmodul: hovedbok, bilag, kontoplan, kostnadsside og full SAF-T. Dette
er en **teknisk byggeplan**, ikke regnskapsfaglig rådgivning — kontoplan,
mva-koder og at løsningen møter bokføringsloven må kvalitetssikres av
autorisert regnskapsfører/revisor før den brukes til offisiell rapportering.

---

## 1. Hvor vi står i dag

Appen har inntektssiden, men ikke et regnskap:

- **Salg** ligger strukturert (`sales` + `sale_items`, betalingsmåte, per barber), pluss eksterne salg/Zettle (`external_sales`) og kasseoppgjør (`cash_settlements`, nå med avstemming).
- **SAF-T** finnes som v1.30-eksport, men **kun inntektssiden** (salg + utgående mva) — `src/lib/saft.ts`.
- **«Regnskap»-siden** (`/admin/regnskap`) viser i praksis omsetning (nær duplikat av dashboardet). Ingen hovedbok, bilag, kontoplan eller kostnader.

Det som mangler for et ekte regnskap er tre ting: **dobbel bokføring** (debet/kredit mot en kontoplan), **kostnadssiden** (leverandører/utgifter + inngående mva), og en **komplett, balansert SAF-T** som følger av de to.

## 2. Bærende prinsipper (bokføringsloven)

Disse styrer hele designet og er grunnen til at dette er et eget spor, ikke en rask fiks:

- **Dobbel bokføring.** Hvert bilag har linjer der sum debet = sum kredit. Ingenting bokføres uten motpost.
- **Uforanderlighet.** Et bokført bilag skal ikke kunne endres eller slettes — korrigering skjer med et nytt, reverserende bilag. Dette er motsatt av hvordan «Angre»/sletting fungerer ellers i appen, og må bygges bevisst.
- **Sporbarhet & bilagsrekke.** Fortløpende, hullfritt bilagsnummer; hvert bilag peker tilbake til kilden (kassesalg, kasseoppgjør, faktura).
- **Spesifikasjoner.** Bokføringsforskriften krever konto-, mva-, kunde- og leverandørspesifikasjon — alt utledes av hovedboka når konteringen er på plass.
- **Periodelåsing.** Når en periode er rapportert (mva-melding/årsoppgjør), låses den mot nye/endrede bilag.

## 3. Datamodell (forslag)

Nye tabeller i Supabase, ved siden av dagens `sales`/`sale_items`:

- **`ledger_accounts`** — kontoplan: kontonr (NS 4102-basert), navn, type (eiendel/gjeld/EK/inntekt/kostnad), SAF-T standardkonto-mapping, standard mva-kode. Seedes med en barbershop-tilpasset kontoplan.
- **`vouchers`** (bilag) — bilagsnr (fortløpende), dato, type (kassesalg, kasseoppgjør, leverandørfaktura, lønn, manuelt, reversering), kilde-referanse (f.eks. `sale_id`/`cash_settlement_id`), status (kladd/bokført), opprettet av, opprettet tid. Bokført = uforanderlig.
- **`voucher_lines`** — én rad per debet/kredit-linje: bilag, konto, debet, kredit, mva-kode, beløp mva, evt. motpart (kunde/leverandør). DB-sperre/trigger som avviser bokføring hvis bilaget ikke balanserer.
- **`suppliers`** — leverandører (navn, org.nr, kontaktinfo) for kostnadssiden og SAF-T.
- **`expenses`** (leverandørfaktura/utgift) — leverandør, dato, forfall, beløp, mva, kostnadskonto, status; genererer et kostnadsbilag ved bokføring.
- (Senere) **`bank_transactions`** — for bankavstemming og betalingsbilag.

Kjerne: en **`post_voucher`-RPC** (SECURITY DEFINER) som validerer balanse (debet = kredit), tildeler bilagsnr atomisk, og setter status = bokført. Reversering skjer via en `reverse_voucher`-RPC som lager et speilbilde. Ingen direkte skriving til `voucher_lines` fra klienten.

## 4. Automatisk kontering

Regnskapet skal i størst mulig grad **føres av seg selv** fra data som allerede finnes:

- **Kassesalg** (`sales`): debet bank/kontant/kort-fordring (etter betalingsmåte), kredit salgsinntekt + utgående mva. Én mapping-regel per betalingsmåte og varetype (tjeneste vs. produkt).
- **Kasseoppgjør**: avstemmingsbilag; differanse/avvik (fra 0046) føres mot en kassediff-konto.
- **Zettle/eksterne salg**: konteres på samme måte via `external_sales`.
- **Lønn**: kostnadsbilag per måned fra lønnskjøringen (grunnlønn + provisjon), med motpost mot skyldig lønn/bank.
- **Leverandørfaktura**: fra `expenses` (manuelt registrert, evt. import senere).

Konteringsreglene legges i `src/lib/accounting.ts` og gjenbruker mva-satsen (`PAYROLL.MVA`) og betalingsmåte-bøttene fra kasseoppgjøret, så alt henger sammen.

## 5. SAF-T — fra inntektsside til komplett

Dagens `saft.ts` utvides fra inntektsside til full SAF-T Financial v1.30:

- **GeneralLedgerAccounts** fra `ledger_accounts` med Skatteetatens standardkonto-mapping.
- **Customers / Suppliers** fra kunde- og leverandørspesifikasjonen.
- **TaxTable** med Skatteetatens standard mva-koder.
- **GeneralLedgerEntries / Journals** med de balanserte bilagene fra hovedboka (ikke bare salgsaggregat).
- Kjøres gjennom **Skatteetatens SAF-T-validator** før bruk. (SAF-T Financial v1.30 er gjeldende i 2026, på forespørsel — verifiser eksakt versjon, standardkontoer og mva-koder mot Skatteetaten på byggetidspunktet.)

## 6. UI — «Regnskap»-siden

Siden («Bilag og hovedbok») fylles med det navnet lover:

- **Hovedbok**: per konto med inngående saldo, bevegelser, utgående saldo; drill til bilag.
- **Bilagsliste**: alle bilag med nr, dato, type, beløp; åpne ett bilag og se debet/kredit-linjene.
- **Kontoplan-admin**: se/justere kontoplan + mva-kode-mapping (regnskapsfører).
- **Kostnadsregistrering**: skjema for leverandørfaktura/utgift → kostnadsbilag.
- **Resultat** (inntekt − kostnad) og senere **balanse**.
- Roller: revisor/regnskapsfører fører og ser alt; admin ser. RLS som resten av appen.

## 7. Faser og rekkefølge

**Fase 1 — Hovedbok på inntektssiden.** Kontoplan (`ledger_accounts`) + bilagsmodell (`vouchers`/`voucher_lines`) + `post_voucher`/`reverse_voucher` + automatisk kontering av eksisterende kassesalg og kasseoppgjør. Regnskap-siden får ekte hovedbok + bilagsliste for det som selges i dag. *Størst verdi først — gjør «Regnskap» reell.*

**Fase 2 — Kostnadssiden.** `suppliers` + `expenses` + kostnadsregistrering + inngående mva + lønnsbilag. Nå finnes et resultat (inntekt − kostnad).

**Fase 3 — Full SAF-T + compliance.** Utvid `saft.ts` til komplett SAF-T fra hovedboka, balanse, periodelåsing, og validering mot Skatteetatens validator. Kvalitetssikring med regnskapsfører.

Hver fase er en egen leveranse som kan pushes og verifiseres for seg — samme arbeidsflyt som resten av økta (migrasjon + kode + `KJØR-I-SUPABASE.sql`).

## 8. Avhengigheter og risiko

- **Regnskapsfaglig validering** er en forutsetning, ikke et etterarbeid: kontoplan, mva-koder og bokføringslov-krav (uforanderlighet, oppbevaring, spesifikasjoner) må bekreftes av autorisert regnskapsfører/revisor. Skatteetaten «godkjenner» ikke systemet — leverandøren har ansvaret.
- **Uforanderlighet** krever egen disiplin i datamodellen (bokført ≠ redigerbar; korriger med reversering), i motsetning til resten av appen.
- **Henger sammen med kassasystemlova-sporet**: den produkterklærte kassa/native app er et parallelt spor; hovedboka her er regnskapssiden, ikke kassa-journalen — hold dem adskilt men koblet via bilag.
- Anbefalt neste steg: kort avklaringsmøte med regnskapsfører om kontoplan + mva-koder, så bygger vi Fase 1.

## Kilder
- [SAF-T Financial — Skatteetaten](https://www.skatteetaten.no/en/business-and-organisation/start-and-run/best-practices-accounting-and-cash-register-systems/saf-t-financial/)
- [Norwegian SAF-T Standard VAT codes (Skatteetaten, PDF)](https://www.skatteetaten.no/globalassets/bedrift-og-organisasjon/starte-og-drive/rutiner-regnskap-og-kassasystem/saf-t-regnskap/oppdateringer/norwegian-saf-t-standard-vat-codes.pdf)
- [Norway — SAF-T Financial v1.30 in force (2026)](https://www.vatupdate.com/2026/06/30/norway-saf-t-financial-v1-30-in-force-on-demand-submission-model/)
- [Standard mva-koder (SAF-T) — Sticos](https://www.sticos.no/fagstoff/standard-mva-koder)
