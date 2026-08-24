-- =====================================================================
-- Storage-bøtte for ansattfiler (bilder + kontrakter).
-- MERK: bøtta er offentlig-lesbar for enkelhet nå. Flytt kontrakter til en
--       privat bøtte med signerte URL-er før reell bruk (sensitive data).
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('staff-files', 'staff-files', true)
on conflict (id) do nothing;

-- Kun admin kan laste opp / endre
drop policy if exists "staff_files_admin_insert" on storage.objects;
create policy "staff_files_admin_insert" on storage.objects
  for insert with check (bucket_id = 'staff-files' and public.is_admin());

drop policy if exists "staff_files_admin_update" on storage.objects;
create policy "staff_files_admin_update" on storage.objects
  for update using (bucket_id = 'staff-files' and public.is_admin());

-- Offentlig lesetilgang (bøtta er public)
drop policy if exists "staff_files_public_read" on storage.objects;
create policy "staff_files_public_read" on storage.objects
  for select using (bucket_id = 'staff-files');
