# ENDRINGER — Strekkode: produkt + kassa + lager (21. sept 2026)

Dette er **bygg 6**, oppå det som allerede er levert. Starter epos «Produkt /
lager / strekkode» (kjernen).

## Commit-tittel (lim inn i GitHub Desktop)

```
Strekkode: produkt-strekkode + skann i kassa + lager-skanning (admin + shop)
```

## Commit-beskrivelse (valgfri)

```
Migrasjon 0057: products.barcode (unik når satt) + find_product_by_barcode-RPC.
record_stock_movement åpnet for shop (is_shop_or_admin) så lager-skanning virker
fra shop-iPad; loggen viser hvem som justerte.

- Gjenbrukbar BarcodeScanner: kamera (BarcodeDetector) når støttet + tekstfelt
  for strekkodeleser/manuelt (funker på iPad uten ekstra maskinvare).
- Admin → Produkter: strekkode-kolonne (sett/skann per produkt) + felt i skjema.
- Kassa (Hurtigsalg, produkt-steget): «Skann strekkode» → varen legges i kurv.
- Lager ved skanning: skann → antall inn/ut → lagre. Fra Admin → Lager OG ny
  shop-side Kasse → Lager (/kasse/lager).
```

---

## VIKTIG: kjør migrasjon 0057 i Supabase

Supabase → SQL Editor. Kjør enten hele `KJØR-I-SUPABASE.sql` på nytt (idempotent)
eller bare den nye biten nederst – **0057**. Uten den finnes ikke strekkode-feltet
og shop kan ikke justere lager.

## Slik bruker du det

1. Admin → **Produkter**: sett strekkode på et produkt (skriv inn, eller trykk
   «Sett» → 📷 Kamera / skann med leser).
2. Kassa → **Hurtigsalg** → produkt-steget → «Skann strekkode» → varen legges i
   kurv automatisk.
3. **Lager ved skanning**: Admin → Lager, eller shop-iPad → Kasse → **Lager**:
   skann en vare, velg inn/ut + antall + årsak, Lagre.

## Teknisk

- Kamera-skanning bruker nettleserens `BarcodeDetector` (funker på iPad Safari
  17+ og Chrome). Der det ikke støttes, brukes tekstfeltet – en USB/Bluetooth-
  strekkodeleser skriver rett i feltet, eller du taster manuelt. Ingen ekstra
  maskinvare kreves.

## Testsjekkliste

- [ ] Sett en strekkode på et produkt i Admin → Produkter (unik – prøv å bruke
      samme på to produkter → får feilmelding).
- [ ] Hurtigsalg → produkt-steget → «Skann strekkode» → skann/skriv koden → varen
      i kurv. Ukjent kode → tydelig melding.
- [ ] Admin → Lager → «Lager ved skanning» → skann → inn 5 (varemottak) → lagre →
      beholdning øker.
- [ ] Logg inn som shop (kasse) → Kasse → Lager → samme flyt virker på iPad.

## Filer i denne leveransen (bygg 6)

13 filer: ny migrasjon 0057, KJØR-I-SUPABASE.sql, ny BarcodeScanner + StockScanAdjust,
ny side /kasse/lager, admin-queries, kasse/actions (findProductByBarcode),
produkter/actions + ProductManager, lager/actions + lager/page, QuickSale,
KasseTopbar + denne fila.

## Gjenstår i strekkode-eposet

- Digitalt gavekort med strekkode (skann fysisk gavekort → digital saldo).

**Verifisert i sky-klone:** `tsc --noEmit` 0 feil, `next build` grønn, eslint
uendret fra baseline. (Kamera-skanning kan ikke testes i sky – test på iPad;
tekstfelt/leser-fallback er verifisert i koden.)
