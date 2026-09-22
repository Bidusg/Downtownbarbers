# ENDRINGER — Sesong-kuponger til medlemmer (22. sept 2026)

Dette er **bygg 9**, oppå det som allerede er levert. Fullfører eposet
«Kundeklubb». Nå kan Dawit utstede tidsavgrensede rabattkuponger til
klubbmedlemmer, og kassa løser dem inn — med rabatten beregnet og validert
trygt på serveren.

## Commit-tittel (lim inn i GitHub Desktop)

```
Kundeklubb: sesong-kuponger til medlemmer (utsted i admin, innløs i kassa)
```

## Commit-beskrivelse (valgfri)

```
Migrasjon 0060: member_campaigns + member_campaign_redemptions (+ RLS). Kuponger
er prosent eller fast beløp, målrettet per klubbnivå (f.eks. Gull og oppover),
med sesong (gyldig fra/utløp) og valgfri engangsbruk per medlem.

Server-sikkert: klienten sender BARE hvilken kupong som er valgt (p_campaign) –
aldri et kronebeløp. record_sale og record_walkin_sale får valgfri p_campaign;
er den satt, beregner + validerer apply_member_campaign rabatten mot brutto,
sjekker sesong/nivå/engangsbruk og logger innløsningen ATOMISK med salget. Er
p_campaign null, er salgsflyten byte-identisk med før (verifisert mot 0049/0050).

- Admin → Kuponger (/admin/kuponger): utsted/administrer kuponger, slå av/på,
  slett; se antall innløsninger.
- Kassa: når kunden har gyldige kuponger, dukker en «Medlemskupong»-velger opp
  i Rabatt-steget (hurtigsalg) og i betalingsboksen (time). Rabatten vises, og
  serveren fastsetter det endelige beløpet.
```

---

## VIKTIG: kjør migrasjon 0060 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0060**. Uten den finnes ikke kupong-tabellene,
og record_sale/record_walkin_sale mangler p_campaign (kassa vil feile ved salg
til den er kjørt).

## Slik bruker du det

1. **Utsted:** Admin → **Kuponger** → «+ Ny kupong». Velg prosent eller fast
   beløp, målgruppe (alle medlemmer, eller f.eks. «Gull og oppover»), evt.
   gyldig fra/utløp, og om den kan brukes én eller flere ganger per medlem.
2. **Innløs i kassa:** velg/​slå opp kunden. Har kunden en gyldig kupong, vises
   «Medlemskupong» i Rabatt-steget (hurtigsalg) eller i betalingsboksen (time).
   Trykk kupongen → rabatten trekkes fra → registrer betalingen som vanlig.
3. Kupongen gjelder bare medlemmer på riktig nivå, innenfor sesongen, og (om
   valgt) kun én gang per medlem. Alt håndheves på serveren.

## Testsjekkliste

- [ ] Admin → Kuponger: lag «−20% i august» for alle medlemmer.
- [ ] Kassa (time eller hurtigsalg) med en medlemskunde → kupongen vises →
      trekkes fra → salget registreres med riktig netto.
- [ ] Lag en kupong kun for «Gull og oppover» → vises for en Gull-kunde, ikke
      for en Bronse-kunde.
- [ ] Engangskupong: prøv å bruke den to ganger på samme kunde → nektes 2. gang.
- [ ] Sett utløp i går → kupongen dukker ikke opp i kassa.
- [ ] Slå en kupong «Av» i admin → forsvinner fra kassa. Slett → borte.

## Filer i denne leveransen (bygg 9)

10 filer: ny migrasjon 0060, KJØR-I-SUPABASE.sql, ny CouponPicker + CampaignManager,
ny /admin/kuponger side + actions, campaigns-queries, kasse/actions (p_campaign +
offers), PaymentControls + QuickSale, admin-nav + denne fila.

## Eposet «Kundeklubb» er nå komplett

Datadrevne nivåer (platinum) ✓, sesong-kuponger til medlemmer ✓. Neste utsatte
punkt i planen er **dra-for-lengde** i kalenderen (Shop UX).

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn (nye ruter
/admin/kuponger), eslint uendret fra baseline (24). Review-agent bekreftet at
salgs-RPC-ene er byte-identiske med før når ingen kupong brukes, at kupong-
rabatten ikke kan forfalskes fra klienten, og at kun admin/eier kan utstede
kuponger.
