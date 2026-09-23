-- =====================================================================
-- 0052 – FJERN ZETTLE / EKSTERNE SALG
--
--   external_sales var en speiling fra den gamle Zettle-kassa. Nå kjører vi
--   eget betalingssystem der ALT salg registreres i `sales` uansett terminal-
--   leverandør, så external_sales er overflødig og fjernes helt.
--
--   Tilhørende kode (lib/zettle*, /api/zettle/*) er slettet i samme slipp.
-- =====================================================================
drop table if exists external_sales cascade;
