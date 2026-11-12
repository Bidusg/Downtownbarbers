-- =====================================================================
-- KJØR-I-SUPABASE-DOKUMENT-VERN.sql  (idempotent)
--   Strammer inn storage-policyene for bøtta 'staff-docs' (QA november 2026):
--
--   1) Revisor kunne gjøre ALT (select/insert/update/delete) på alle filer,
--      også kontrakter og oppsigelser. Nå:
--        - revisor_read:  kun lese (select) alle filer
--        - revisor_write: insert/update/delete KUN på filer der filnavnet
--          starter med 'lonnslipp' (appen lagrer lønnsoversikter som
--          '{staff_id}/lonnslipp-YYYY-MM.pdf', inkl. upsert/overskriving
--          og sletting ved regenerering).
--   2) Ansatt kunne slette HVA SOM HELST i egen mappe (også kontrakt og
--      lønnslipp). Nå kun filer som har en staff_documents-rad med
--      by_staff = true på samme path og samme ansatt.
--
-- Merk: opprydding av en fil som ble lastet opp uten at metadata-raden ble
-- lagret, kan ikke lenger gjøres av ansatt selv (fila blir liggende).
-- Trygg å kjøre flere ganger. Ingen data endres.
-- =====================================================================

-- Gammel «for all»-policy for revisor fjernes.
drop policy if exists "staff_docs_revisor" on storage.objects;

drop policy if exists "staff_docs_revisor_read" on storage.objects;
create policy "staff_docs_revisor_read" on storage.objects
  for select
  using (
    bucket_id = 'staff-docs'
    and (select role::text from public.profiles where id = auth.uid()) = 'revisor'
  );

drop policy if exists "staff_docs_revisor_ins" on storage.objects;
create policy "staff_docs_revisor_ins" on storage.objects
  for insert
  with check (
    bucket_id = 'staff-docs'
    and (select role::text from public.profiles where id = auth.uid()) = 'revisor'
    and storage.filename(name) like 'lonnslipp%'
  );

drop policy if exists "staff_docs_revisor_upd" on storage.objects;
create policy "staff_docs_revisor_upd" on storage.objects
  for update
  using (
    bucket_id = 'staff-docs'
    and (select role::text from public.profiles where id = auth.uid()) = 'revisor'
    and storage.filename(name) like 'lonnslipp%'
  )
  with check (
    bucket_id = 'staff-docs'
    and (select role::text from public.profiles where id = auth.uid()) = 'revisor'
    and storage.filename(name) like 'lonnslipp%'
  );

drop policy if exists "staff_docs_revisor_del" on storage.objects;
create policy "staff_docs_revisor_del" on storage.objects
  for delete
  using (
    bucket_id = 'staff-docs'
    and (select role::text from public.profiles where id = auth.uid()) = 'revisor'
    and storage.filename(name) like 'lonnslipp%'
  );

-- Ansatt: kun egne, selv opplastede filer kan slettes.
drop policy if exists "staff_docs_self_delete" on storage.objects;
create policy "staff_docs_self_delete" on storage.objects
  for delete using (
    bucket_id = 'staff-docs'
    and (storage.foldername(name))[1] = public.current_staff_id()::text
    -- Bare filer den ansatte selv lastet opp (en egen staff_documents-rad
    -- kan lages via API-et, så den alene er ikke nok).
    and owner_id = (select auth.uid())::text
    and exists (
      select 1
        from public.staff_documents d
       where d.path = storage.objects.name
         and d.by_staff = true
         and d.staff_id = public.current_staff_id()
    )
  );

notify pgrst, 'reload schema';
