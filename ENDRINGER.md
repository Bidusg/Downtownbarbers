# ENDRINGER — Digitalt gavekort med strekkode (21. sept 2026)

Dette er **bygg 7**, oppå det som allerede er levert. Fullfører eposet «Produkt /
lager / strekkode».

## Commit-tittel (lim inn i GitHub Desktop)

```
Gavekort: digitalt gavekort med strekkode (skann → saldo → innløs)
```

## Commit-beskrivelse (valgfri)

```
Migrasjon 0058: gift_cards.barcode (unik) + find_gift_card + redeem_gift_card_by_code
(atomisk, med utløps-/saldosjekk). Gavekort er admin-only via RLS, så oppslag og
innløsning går via security-definer-RPC-er som også shop kan bruke.

- Gjenbrukbar GiftCardScan: skann/skriv strekkode eller kode → saldo kommer opp →
  innløs et beløp (trekker inntil saldo). Kamera eller strekkodeleser.
- Admin → Gavekort: skann-verktøy øverst, strekkode-felt ved utstedelse, og
  strekkode-kolonne (koble/endre) per kort.
- Ny shop-side Kasse → Gavekort (/kasse/gavekort) for iPad.
```

---

## VIKTIG: kjør migrasjon 0058 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0058**. Uten den finnes ikke strekkode-feltet
på gavekort, og skann/innløsning virker ikke.

## Slik bruker du det

1. Admin → **Gavekort**: sett strekkode ved utstedelse, eller «Koble» en strekkode
   til et eksisterende kort (skann/skriv).
2. **Skann & innløs** (Admin → Gavekort, eller shop-iPad → Kasse → **Gavekort**):
   skann kortets strekkode → saldoen vises → skriv beløp (eller «Hele saldoen») →
   Innløs. Trekker inntil saldo, sjekker utløp.

## Testsjekkliste

- [ ] Utsted et gavekort med strekkode i Admin → Gavekort.
- [ ] Skann/skriv strekkoden i «Skann & innløs» → saldo kommer opp.
- [ ] Innløs et beløp → saldoen synker; innløs «Hele saldoen» → 0.
- [ ] Utløpt kort → melding om at det er utløpt. Ukjent kode → tydelig melding.
- [ ] Logg inn som shop → Kasse → Gavekort → samme flyt virker på iPad.

## Filer i denne leveransen (bygg 7)

9 filer: ny migrasjon 0058, KJØR-I-SUPABASE.sql, ny GiftCardScan-komponent, ny
side /kasse/gavekort, ops-queries, gavekort/actions + page, GiftCardManager,
KasseTopbar + denne fila.

## Eposet «Produkt / lager / strekkode» er nå komplett

Produkt-strekkode ✓, skann i kassa ✓, lager ved skanning ✓, digitalt gavekort med
strekkode ✓. Neste epos i planen er **Kundeklubb** (datadrevne nivåer / platinum
+ sesong-kuponger).

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline. (Kamera-skanning testes på iPad; felt/leser-fallback er
verifisert i koden.)
