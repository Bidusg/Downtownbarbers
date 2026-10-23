-- =====================================================================
-- Lønn for ansatte som har sluttet (satt inaktive)
--
-- Revisor kunne bare lese AKTIVE ansatte. Når en ansatt ble satt inaktiv
-- midt i måneden, forsvant hen fra lønnslippene. Denne policyen lar
-- admin/eier/revisor lese alle ansatte (også inaktive), så lønn og
-- lønnslipp blir riktig fram til siste arbeidsdag.
--
-- Trygt å kjøre flere ganger.
-- =====================================================================

drop policy if exists staff_payroll_read on staff;
create policy staff_payroll_read on staff
  for select using (
    (select role::text from profiles where id = auth.uid()) in ('admin', 'eier', 'revisor')
  );

notify pgrst, 'reload schema';
