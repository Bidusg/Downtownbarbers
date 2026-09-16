-- =====================================================================
-- 0033 – DOKUMENTSENTER (DocCenter)
--   Generelt filarkiv for salongen (ikke bare ansattkontrakter): last opp,
--   kategoriser, list, last ned, slett. Kun admin.
--   Bøtta er PRIVAT – nedlasting skjer via signerte URL-er (server-side).
-- Idempotent.
-- =====================================================================

-- Privat Storage-bøtte (public = false). Samme mønster som 0005_storage.sql.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- storage.objects-policies for bøtta 'documents': kun admin.
drop policy if exists "documents_admin_insert" on storage.objects;
create policy "documents_admin_insert" on storage.objects
  for insert with check (bucket_id = 'documents' and public.is_admin());

drop policy if exists "documents_admin_select" on storage.objects;
create policy "documents_admin_select" on storage.objects
  for select using (bucket_id = 'documents' and public.is_admin());

drop policy if exists "documents_admin_update" on storage.objects;
create policy "documents_admin_update" on storage.objects
  for update using (bucket_id = 'documents' and public.is_admin());

drop policy if exists "documents_admin_delete" on storage.objects;
create policy "documents_admin_delete" on storage.objects
  for delete using (bucket_id = 'documents' and public.is_admin());

-- Metadata-tabell for dokumentene.
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,           -- visningsnavn
  path         text not null,           -- sti i Storage-bøtta 'documents'
  category     text,                    -- fritekst/enkel kategori
  size_bytes   bigint,
  mime         text,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists documents_category_created_idx
  on documents (category, created_at desc);

-- RLS: kun admin, ingen public read.
alter table documents enable row level security;
drop policy if exists documents_admin_all on documents;
create policy documents_admin_all on documents
  for all using (is_admin()) with check (is_admin());
