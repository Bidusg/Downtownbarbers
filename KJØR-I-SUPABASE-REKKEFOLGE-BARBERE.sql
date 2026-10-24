-- =====================================================================
-- Rekkefølge på barberne på nettsiden
--
-- Ny kolonne staff.sort_order styrer rekkefølgen i booking og «Teamet» på
-- forsiden. Settes i admin → Ansatte → «Rekkefølge på nettsiden».
-- Første gang fylles den med dagens rekkefølge (ansattnummer), så ingenting
-- flytter seg før du endrer det.
--
-- Trygt å kjøre flere ganger.
-- =====================================================================

alter table staff add column if not exists sort_order int;

update staff s
   set sort_order = r.rn
  from (select id, row_number() over (order by employee_number nulls last, full_name) as rn
          from staff) r
 where r.id = s.id
   and s.sort_order is null;

-- Nettsiden (uten innlogging) må kunne lese kolonnen.
grant select (sort_order) on staff to anon;

notify pgrst, 'reload schema';
