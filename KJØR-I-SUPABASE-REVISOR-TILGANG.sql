-- =====================================================================
-- REVISOR SER ALLE TALL SOM ADMIN SER (kun lesetilgang)
--
-- Revisor skal se det samme som admin når det gjelder tall, lønn og
-- regnskap – men ingenting av det daglige arbeidet (booking, kunder,
-- markedsføring, innstillinger). Dette skriptet gir revisor LESETILGANG
-- (select) til tabellene bak lønn, fravær, omsetning, kasse og lager,
-- og til ansattdokumentene (kontrakter, lønnsoversikter, oppsigelser).
-- Revisor kan fortsatt ikke endre noe av dette.
--
-- Tabeller som ikke finnes hoppes over. Trygt å kjøre flere ganger.
-- =====================================================================

-- Rolle-helper (samme som i KJØR-I-SUPABASE-LONN-ANSATT.sql).
create or replace function is_admin_or_revisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'eier', 'revisor')
  );
$$;

do $$
declare
  t text;
  n int := 0;
begin
  foreach t in array array[
    -- Lønn og fravær
    'staff', 'staff_hours', 'staff_exceptions', 'absences', 'leave_requests',
    'staff_levels', 'shifts',
    -- Omsetning og kasse
    'sales', 'sale_items', 'sale_payments', 'cash_settlements',
    'services', 'service_categories', 'service_level_prices',
    -- Varer, lager, nettbutikk, gavekort
    'products', 'stock_movements', 'online_orders', 'online_order_items',
    'gift_cards',
    -- Budsjett og mål
    'budgets', 'daily_targets'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on %I', t || '_revisor_les', t);
      execute format(
        'create policy %I on %I for select using (is_admin_or_revisor())',
        t || '_revisor_les', t);
      n := n + 1;
    end if;
  end loop;
  raise notice 'Revisor har nå lesetilgang til % tabeller.', n;
end $$;

-- Ansattdokumenter: revisor kan lese ALLE dokumenter (kontrakt, lønnsoversikt,
-- oppsigelse, annet) og åpne filene i den private bøtta «staff-docs».
-- Revisor kan fortsatt bare skrive lønnsoversikter (eksisterende policy).
do $$
begin
  if to_regclass('public.staff_documents') is not null then
    drop policy if exists staff_documents_revisor_les on staff_documents;
    create policy staff_documents_revisor_les on staff_documents
      for select using (is_admin_or_revisor());
    raise notice 'Revisor kan lese ansattdokumenter.';
  else
    raise notice 'Tabellen staff_documents finnes ikke – ansattdokumenter hoppes over.';
  end if;
end $$;

drop policy if exists "staff_docs_revisor_les" on storage.objects;
create policy "staff_docs_revisor_les" on storage.objects
  for select using (bucket_id = 'staff-docs' and public.is_admin_or_revisor());

-- Fraværstrekket i lønn (RPC) – revisor har allerede tilgang der den finnes.

notify pgrst, 'reload schema';

-- Sjekk: lese-policyene for revisor.
select schemaname, tablename, policyname
  from pg_policies
 where schemaname in ('public', 'storage') and policyname like '%revisor\_les' escape '\'
 order by schemaname, tablename;
