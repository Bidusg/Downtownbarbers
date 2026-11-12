-- =====================================================================
-- Sikkerhetsgjennomgang 3 (november 2026) – ansatt-tabellen for innloggede
--
-- KJØR DENNE FILEN KUN ETTER AT KODEN ER DEPLOYET (push til main + ferdig
-- Vercel-bygg). Eldre kode leser sensitive ansatt-kolonner direkte, og vil
-- feile (admin/ansatte, lønn, revisor-lønnsslipper, go-live, grunndata-
-- eksport, «min ansatt-kobling») hvis denne kjøres først.
--
-- Funn og tiltak:
--  1) Rollen «authenticated» kunne lese HELE ansatt-tabellen. Alle innloggede
--     (kasse-iPad, barber, revisor) kunne derfor hente PIN-hash, grunnlønn,
--     e-post, telefon, postnummer, kontrakt-lenke, ansettelsesdato og
--     profile_id for alle ansatte.
--     → Innloggede kan nå bare lese de offentlige/ufarlige kolonnene
--       (samme tanke som SIKKERHET-2 gjorde for anonyme, pluss start/slutt-
--       dato som brukes til lønnsberegning og visning).
--  2) Sensitive kolonner leses nå kun via serveren (service-klient etter
--     rollesjekk admin/eier/revisor), og «min ansatt-kobling» bruker
--     current_staff_id() (security definer).
--
-- Rører IKKE INSERT/UPDATE/DELETE-rettigheter eller RLS-policyene.
-- Service-role (serveren) og security definer-funksjoner påvirkes ikke.
-- Trygt å kjøre flere ganger.
--
-- Sjekk etterpå (som innlogget bruker, f.eks. via SQL Editor med
-- «set role authenticated;»). Første skal gi feil, andre skal virke:
--   set role authenticated;
--   select pin_hash from staff limit 1;          -- permission denied
--   select id, full_name, title from staff limit 1;  -- OK
--   reset role;
-- Eller se alle kolonne-rettigheter:
--   select column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'staff'
--      and grantee = 'authenticated' and privilege_type = 'SELECT'
--    order by column_name;
-- =====================================================================

-- ---------- Ansatt-kolonner for innloggede ----------
revoke select on staff from authenticated;
do $$
declare
  c text;
  cols text[] := array['id','full_name','display_name','title','bio','specialties',
                       'photo_url','active','employee_number','level_id','created_at',
                       'sort_order','start_date','end_date'];
begin
  foreach c in array cols loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'staff' and column_name = c) then
      execute format('grant select (%I) on staff to authenticated', c);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
