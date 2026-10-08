-- =====================================================================
-- SHOP-TILGANG TIL KASSEOPPGJØR
--
--   Bakgrunn: tabellen cash_settlements var til nå ADMIN-ONLY (merket som
--   sensitiv økonomidata). Da kunne shop-brukeren (kassa) ikke levere
--   dagsoppgjør i det hele tatt – den røde «Gå til kasseoppgjør»-banneren
--   pekte på admin-siden som shop ikke har tilgang til, og tabellen avviste
--   både lesing og skriving.
--
--   Denne migrasjonen åpner NØYAKTIG så mye som trengs for at shop skal kunne
--   LEVERE et dagsoppgjør – ikke mer:
--
--     • SELECT  : shop kan lese oppgjør (så siden og banneren vet hva som
--                 er levert / mangler).
--     • INSERT  : shop kan levere et nytt oppgjør.
--     • UPDATE  : KUN på UBEKREFTEDE rader (confirmed = false), dvs. et
--                 auto-utkast fra natt-cronen kan bekreftes. Når raden først
--                 er bekreftet, kan shop IKKE lenger endre den → «lever én
--                 gang». Retting/sletting av leverte oppgjør forblir admin.
--
--   Ingen DELETE for shop. Admin/eier beholder full tilgang via den
--   eksisterende cash_settlements_admin_all-policyen (den røres ikke).
--
--   Idempotent – trygg å kjøre flere ganger. Sikrer også at confirmed-
--   kolonnen finnes (samme som KASSEOPPGJØR-TVANG), slik at update-policyen
--   nedenfor alltid kan opprettes uansett rekkefølge på migrasjonene.
-- =====================================================================

-- 0) Garanter at confirmed-kolonnen finnes (brukes av update-policyen under).
alter table cash_settlements
  add column if not exists confirmed boolean not null default true;

-- 1) SHOP kan LESE oppgjør (for side + banner + «allerede levert»-sjekk).
drop policy if exists cash_settlements_shop_read on cash_settlements;
create policy cash_settlements_shop_read on cash_settlements
  for select using (is_shop_or_admin());

-- 2) SHOP kan LEVERE (opprette) et oppgjør.
drop policy if exists cash_settlements_shop_insert on cash_settlements;
create policy cash_settlements_shop_insert on cash_settlements
  for insert with check (is_shop_or_admin());

-- 3) SHOP kan BEKREFTE et ubekreftet auto-utkast – men bare mens det er
--    ubekreftet. USING ser på EKSISTERENDE rad (må være confirmed = false);
--    WITH CHECK tillater at den nye verdien settes til confirmed = true.
--    Resultat: shop kan bekrefte én gang, men ikke redigere en allerede
--    bekreftet rad (da feiler USING). Deliver-once håndheves i databasen.
drop policy if exists cash_settlements_shop_confirm on cash_settlements;
create policy cash_settlements_shop_confirm on cash_settlements
  for update
  using (is_shop_or_admin() and confirmed = false)
  with check (is_shop_or_admin());
