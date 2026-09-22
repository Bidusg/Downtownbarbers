# ENDRINGER — Kundeklubb: datadrevne nivåer (21. sept 2026)

Dette er **bygg 8**, oppå det som allerede er levert. Starter eposet
«Kundeklubb». Nå kan du styre medlemsnivåene helt selv — legge til nye
topp-nivåer (Platinum), slette nivåer og endre rekkefølgen — uten utvikler.

## Commit-tittel (lim inn i GitHub Desktop)

```
Kundeklubb: datadrevne nivåer (legg til / slett / omordne, f.eks. Platinum)
```

## Commit-beskrivelse (valgfri)

```
Migrasjon 0059: membership_tiers får sort_order (rang, høyere = bedre nivå),
backfill fra id så dagens Bronse/Sølv/Gull-rekkefølge er uendret. Nivå-regelen
er lik som før (høyeste nivå der forbruk ELLER besøk er over terskelen), bare
rangert på sort_order. Tre nye admin-RPC-er (security definer + is_admin-vakt):
membership_tier_add (atomisk ny id + rang), _delete (nekter det siste nivået),
_move (bytt rang med naboen).

- Admin → Kundeklubb: rediger nivå (navn/terskler/gode/farge), ↑/↓ for å
  omordne, slett nivå, og «+ Nytt nivå» for å legge til Platinum e.l.
- customer_membership, «min side» og kundekortet virker uendret for N nivåer.
```

---

## VIKTIG: kjør migrasjon 0059 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0059**. Uten den finnes ikke `sort_order`,
og «legg til / omordne» virker ikke.

## Slik bruker du det

1. Admin → **Kundeklubb**. Nivåene vises høyest først (toppnivået øverst).
2. **Legg til Platinum:** «+ Nytt nivå» → navn (Platinum), farge, min. forbruk
   og/eller min. besøk, og et medlemsgode. Det legges til som nytt toppnivå.
3. **Omordne:** ↑/↓ på hvert kort flytter nivået opp/ned i rangen.
4. **Slett:** «Slett nivå» (kan ikke slette det siste — det må alltid finnes ett).
5. La det **laveste** nivået ha 0 kr / 0 besøk, så alle kunder alltid havner på
   et nivå.

Nivået utledes fortsatt automatisk av livstidsforbruk og fullførte besøk —
ingen poeng, ingen manuell tildeling.

## Testsjekkliste

- [ ] Admin → Kundeklubb viser Bronse/Sølv/Gull som før, med riktig fordeling.
- [ ] Legg til «Platinum» (f.eks. 15000 kr / 20 besøk, farge #E5E4E2) → dukker
      opp som nytt toppnivå.
- [ ] En kunde over Platinum-terskelen får Platinum på kundekortet og «min side».
- [ ] ↑/↓ endrer rekkefølgen; ↑ er deaktivert øverst, ↓ nederst.
- [ ] Slett et nivå → forsvinner; prøv å slette ned til ett → nektes.
- [ ] Endre terskel/gode på et nivå og lagre → «min side» viser oppdatert gode.

## Filer i denne leveransen (bygg 8)

7 filer: ny migrasjon 0059, KJØR-I-SUPABASE.sql, ny komponent
MembershipTiersEditor, kundeklubb actions + page, membership-queries + denne fila.

## Neste i planen

Kundeklubb-eposet kan utvides med **sesong-kuponger til medlemmer** (utsted/innløs
i kassa). Den utsatte Shop UX-biten **dra-for-lengde** i kalenderen står også igjen.

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline (24). Review-agent bekreftet bakoverkompatibilitet,
idempotens og at kun admin/eier kan endre nivåene.
