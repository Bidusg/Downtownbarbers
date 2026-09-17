-- =====================================================================
-- 0038 – Ansattdokumenter (kontrakt, lønnslipp, andre) i privat storage.
--   Privat bøtte 'staff-docs' med mappe per ansatt: '{staff_id}/...'.
--   staff_documents holder metadata. Nedlasting skjer via signerte URL-er
--   server-side (ingen public read).
--
--   Tilgang:
--     admin   – alt
--     revisor – lese alt + skrive KUN lønnslipp (for generering/utsending)
--     ansatt  – lese/laste ned sine egne; laste opp/slette KUN egne 'annet'
--   current_staff_id() (0035) kobler auth-bruker → staff-rad.
-- Idempotent.
-- =====================================================================

-- 1) Privat bøtte.
insert into storage.buckets (id, name, public)
values ('staff-docs', 'staff-docs', false)
on conflict (id) do nothing;

-- 2) Metadata-tabell.
create table if not exists staff_documents (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references staff(id) on delete cascade,
  category     text not null default 'annet'
               check (category in ('kontrakt', 'lonnslipp', 'annet')),
  name         text not null,          -- visningsnavn
  path         text not null,          -- sti i bøtta 'staff-docs' ('{staff_id}/...')
  period       text,                   -- 'YYYY-MM' for lønnslipp
  size_bytes   bigint,
  mime         text,
  uploaded_by  uuid references profiles(id) on delete set null,
  by_staff     boolean not null default false,  -- true = lastet opp av ansatt selv
  created_at   timestamptz not null default now()
);
create index if not exists staff_documents_lookup_idx
  on staff_documents (staff_id, category, created_at desc);
-- Én lønnslipp per ansatt per måned (idempotent regenerering: slett+sett inn).
create unique index if not exists staff_documents_lonnslipp_uidx
  on staff_documents (staff_id, period)
  where category = 'lonnslipp';

alter table staff_documents enable row level security;

drop policy if exists staff_documents_admin_all on staff_documents;
create policy staff_documents_admin_all on staff_documents
  for all using (is_admin()) with check (is_admin());

-- Revisor: lese alt.
drop policy if exists staff_documents_revisor_read on staff_documents;
create policy staff_documents_revisor_read on staff_documents
  for select using (
    (select role from profiles where id = auth.uid()) = 'revisor'
  );

-- Revisor: skrive KUN lønnslipp (insert/update/delete).
drop policy if exists staff_documents_revisor_lonn on staff_documents;
create policy staff_documents_revisor_lonn on staff_documents
  for all
  using (
    (select role from profiles where id = auth.uid()) = 'revisor'
    and category = 'lonnslipp'
  )
  with check (
    (select role from profiles where id = auth.uid()) = 'revisor'
    and category = 'lonnslipp'
  );

-- Ansatt: lese sine egne.
drop policy if exists staff_documents_self_read on staff_documents;
create policy staff_documents_self_read on staff_documents
  for select using (staff_id = current_staff_id());

-- Ansatt: laste opp KUN egne 'annet'.
drop policy if exists staff_documents_self_insert on staff_documents;
create policy staff_documents_self_insert on staff_documents
  for insert with check (
    staff_id = current_staff_id()
    and by_staff = true
    and category = 'annet'
  );

-- Ansatt: slette KUN egne selv-opplastede.
drop policy if exists staff_documents_self_delete on staff_documents;
create policy staff_documents_self_delete on staff_documents
  for delete using (
    staff_id = current_staff_id()
    and by_staff = true
  );

-- 3) storage.objects-policies for bøtta 'staff-docs'.
--    Mappe = staff_id (første segment av objektnavnet).
drop policy if exists "staff_docs_admin_all" on storage.objects;
create policy "staff_docs_admin_all" on storage.objects
  for all
  using (bucket_id = 'staff-docs' and public.is_admin())
  with check (bucket_id = 'staff-docs' and public.is_admin());

drop policy if exists "staff_docs_revisor" on storage.objects;
create policy "staff_docs_revisor" on storage.objects
  for all
  using (
    bucket_id = 'staff-docs'
    and (select role from public.profiles where id = auth.uid()) = 'revisor'
  )
  with check (
    bucket_id = 'staff-docs'
    and (select role from public.profiles where id = auth.uid()) = 'revisor'
  );

drop policy if exists "staff_docs_self_read" on storage.objects;
create policy "staff_docs_self_read" on storage.objects
  for select using (
    bucket_id = 'staff-docs'
    and (storage.foldername(name))[1] = public.current_staff_id()::text
  );

drop policy if exists "staff_docs_self_insert" on storage.objects;
create policy "staff_docs_self_insert" on storage.objects
  for insert with check (
    bucket_id = 'staff-docs'
    and (storage.foldername(name))[1] = public.current_staff_id()::text
  );

drop policy if exists "staff_docs_self_delete" on storage.objects;
create policy "staff_docs_self_delete" on storage.objects
  for delete using (
    bucket_id = 'staff-docs'
    and (storage.foldername(name))[1] = public.current_staff_id()::text
  );

-- 4) Rollegatet lønnstall-kilde for revisor-generering (bruttosum per ansatt
--    for en måned). Revisor har ikke direkte RLS-lesetilgang på sales;
--    denne SECURITY DEFINER-funksjonen gir kun aggregatet, og kun til
--    admin/revisor.
create or replace function monthly_gross_by_staff(p_year int, p_month int)
returns table (staff_id uuid, gross_nok numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select role from profiles where id = auth.uid()) not in ('admin', 'revisor') then
    raise exception 'Kun admin/revisor har tilgang.';
  end if;
  return query
    select s.staff_id, coalesce(sum(s.total_nok), 0)::numeric
    from sales s
    where s.staff_id is not null
      and s.sold_at >= make_date(p_year, p_month, 1)
      and s.sold_at <  (make_date(p_year, p_month, 1) + interval '1 month')
    group by s.staff_id;
end $$;
grant execute on function monthly_gross_by_staff(int, int) to authenticated;
