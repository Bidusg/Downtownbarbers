-- =====================================================================
-- 0062 – BILAG TIL REVISOR (Vouchers)
--   Dawit (admin) laster opp fakturaer/kvitteringer/bilag i admin-området.
--   De dukker AUTOMATISK opp på revisor-siden, nedlastbare, uten manuell
--   utsending. Revisor er strengt LESE-KUN (RLS + server-action-vakter).
--   Bøtta er PRIVAT – nedlasting skjer via signerte URL-er (server-side).
-- Idempotent. Speiler 0033_documents.sql + revisor-mønsteret i 0038.
-- =====================================================================

-- Privat Storage-bøtte (public = false). Samme mønster som 0033/0038.
insert into storage.buckets (id, name, public)
values ('vouchers', 'vouchers', false)
on conflict (id) do nothing;

-- storage.objects-policies for bøtta 'vouchers'.
-- Admin (is_admin() = admin/eier) har full tilgang (insert/update/delete/select).
drop policy if exists "vouchers_admin_insert" on storage.objects;
create policy "vouchers_admin_insert" on storage.objects
  for insert with check (bucket_id = 'vouchers' and public.is_admin());

drop policy if exists "vouchers_admin_select" on storage.objects;
create policy "vouchers_admin_select" on storage.objects
  for select using (bucket_id = 'vouchers' and public.is_admin());

drop policy if exists "vouchers_admin_update" on storage.objects;
create policy "vouchers_admin_update" on storage.objects
  for update using (bucket_id = 'vouchers' and public.is_admin());

drop policy if exists "vouchers_admin_delete" on storage.objects;
create policy "vouchers_admin_delete" on storage.objects
  for delete using (bucket_id = 'vouchers' and public.is_admin());

-- Revisor: KUN lesing (select). Speiler profiles-rolleoppslaget som is_admin()
-- og staff_docs_revisor (0038) bruker. Admin/eier er med her også, slik at
-- én select-policy dekker «admin eller revisor». Revisor får ALDRI
-- insert/update/delete på bøtta.
drop policy if exists "vouchers_revisor_select" on storage.objects;
create policy "vouchers_revisor_select" on storage.objects
  for select using (
    bucket_id = 'vouchers'
    and (select role::text from public.profiles where id = auth.uid())
        in ('admin', 'eier', 'revisor')
  );

-- Metadata-tabell for bilagene.
create table if not exists vouchers (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,                    -- visningsnavn/tittel
  supplier      text,                             -- leverandør
  voucher_date  date,                             -- bilagsdato
  kind          text check (kind in ('faktura', 'kvittering', 'bilag', 'annet'))
                default 'bilag',
  amount_nok    numeric(12, 2),                   -- beløp inkl. mva
  vat_nok       numeric(12, 2),                   -- mva-andel
  path          text not null,                    -- sti i Storage-bøtta 'vouchers'
  size_bytes    bigint,
  mime          text,
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists vouchers_date_created_idx
  on vouchers (voucher_date desc, created_at desc);

-- RLS: admin full tilgang, revisor kun lesing.
alter table vouchers enable row level security;

drop policy if exists vouchers_admin_all on vouchers;
create policy vouchers_admin_all on vouchers
  for all using (is_admin()) with check (is_admin());

-- Revisor: KUN select. Samme «admin eller revisor»-uttrykk som storage-policyen.
drop policy if exists vouchers_revisor_read on vouchers;
create policy vouchers_revisor_read on vouchers
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );
