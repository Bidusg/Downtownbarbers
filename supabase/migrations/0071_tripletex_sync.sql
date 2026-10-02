-- =====================================================================
-- 0071 – TRIPLETEX SYNK (regnskapsdata speilet til Supabase)
--
--   Leser (kun) regnskapsdata fra Tripletex og speiler den inn i Supabase
--   slik at admin- og revisor-sidene kan vise tall uten å kalle Tripletex
--   live på hver sidelast. Skrivingen gjøres av service-rollen (cron/route)
--   som omgår RLS. Lesing:
--     * admin/eier via is_admin()
--     * revisor via rolleoppslag i profiles (samme mønster som 0038/0062)
--
--   Idempotent: create table if not exists, enable RLS, drop policy if
--   exists → create. Trygt å kjøre flere ganger.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Synk-kjøringer (logg + status for cron/overvåkning)
-- ---------------------------------------------------------------------
create table if not exists tripletex_sync_run (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text,                 -- 'running' | 'ok' | 'error' | 'skipped'
  scope        text,                 -- hva synken dekket (f.eks. 'full')
  counts       jsonb,                -- antall rader per datasett
  error        text
);

create index if not exists tripletex_sync_run_started_idx
  on tripletex_sync_run (started_at desc);

-- ---------------------------------------------------------------------
-- 2) Kontoplan
-- ---------------------------------------------------------------------
create table if not exists tripletex_account (
  tripletex_id    bigint primary key,
  number          text unique,
  name            text,
  type            text,
  vat_type        jsonb,
  ledger_type     text,
  is_bank_account boolean,
  synced_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) Saldobalanse per periode (period_key = "YYYY-MM" eller "YYYY")
--    Re-synk av en periode erstatter radene på (period_key, account_number).
-- ---------------------------------------------------------------------
create table if not exists tripletex_balance (
  period_key     text not null,
  account_number text not null,
  account_name   text,
  account_type   text,
  balance_in     numeric,
  balance_change numeric,
  balance_out    numeric,
  date_from      date,
  date_to        date,
  synced_at      timestamptz not null default now(),
  primary key (period_key, account_number)
);

create index if not exists tripletex_balance_period_idx
  on tripletex_balance (period_key);

-- ---------------------------------------------------------------------
-- 4) Bilag
--    booked = number>0 && (tempNumber===0 || null) – beregnes i sync-laget.
-- ---------------------------------------------------------------------
create table if not exists tripletex_voucher (
  tripletex_id bigint primary key,
  number       int,
  temp_number  int,
  voucher_date date,
  description  text,
  voucher_type text,
  booked       boolean,
  year         int,
  synced_at    timestamptz not null default now()
);

create index if not exists tripletex_voucher_date_idx
  on tripletex_voucher (voucher_date desc);

-- ---------------------------------------------------------------------
-- 5) Posteringer (hovedbokslinjer)
-- ---------------------------------------------------------------------
create table if not exists tripletex_posting (
  tripletex_id   bigint primary key,
  posting_date   date,
  account_number text,
  account_name   text,
  amount         numeric,
  description    text,
  voucher_id     bigint,
  voucher_number int,
  synced_at      timestamptz not null default now()
);

create index if not exists tripletex_posting_date_idx
  on tripletex_posting (posting_date desc);

create index if not exists tripletex_posting_account_idx
  on tripletex_posting (account_number);

-- ---------------------------------------------------------------------
-- 6) Momstyper
-- ---------------------------------------------------------------------
create table if not exists tripletex_vat_type (
  tripletex_id bigint primary key,
  name         text,
  percentage   numeric,
  synced_at    timestamptz not null default now()
);

-- =====================================================================
-- RLS – lese-tilgang for admin/eier (is_admin()) og revisor.
--   Service-rollen (cron/route) omgår RLS og gjør all skriving, så det
--   finnes BEVISST ingen insert/update/delete-policies her.
--   Revisor-mønsteret speiler 0062_vouchers.sql (role::text in (...)).
-- =====================================================================

-- --- tripletex_sync_run ---
alter table tripletex_sync_run enable row level security;

drop policy if exists tripletex_sync_run_admin_read on tripletex_sync_run;
create policy tripletex_sync_run_admin_read on tripletex_sync_run
  for select using (is_admin());

drop policy if exists tripletex_sync_run_revisor_read on tripletex_sync_run;
create policy tripletex_sync_run_revisor_read on tripletex_sync_run
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );

-- --- tripletex_account ---
alter table tripletex_account enable row level security;

drop policy if exists tripletex_account_admin_read on tripletex_account;
create policy tripletex_account_admin_read on tripletex_account
  for select using (is_admin());

drop policy if exists tripletex_account_revisor_read on tripletex_account;
create policy tripletex_account_revisor_read on tripletex_account
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );

-- --- tripletex_balance ---
alter table tripletex_balance enable row level security;

drop policy if exists tripletex_balance_admin_read on tripletex_balance;
create policy tripletex_balance_admin_read on tripletex_balance
  for select using (is_admin());

drop policy if exists tripletex_balance_revisor_read on tripletex_balance;
create policy tripletex_balance_revisor_read on tripletex_balance
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );

-- --- tripletex_voucher ---
alter table tripletex_voucher enable row level security;

drop policy if exists tripletex_voucher_admin_read on tripletex_voucher;
create policy tripletex_voucher_admin_read on tripletex_voucher
  for select using (is_admin());

drop policy if exists tripletex_voucher_revisor_read on tripletex_voucher;
create policy tripletex_voucher_revisor_read on tripletex_voucher
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );

-- --- tripletex_posting ---
alter table tripletex_posting enable row level security;

drop policy if exists tripletex_posting_admin_read on tripletex_posting;
create policy tripletex_posting_admin_read on tripletex_posting
  for select using (is_admin());

drop policy if exists tripletex_posting_revisor_read on tripletex_posting;
create policy tripletex_posting_revisor_read on tripletex_posting
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );

-- --- tripletex_vat_type ---
alter table tripletex_vat_type enable row level security;

drop policy if exists tripletex_vat_type_admin_read on tripletex_vat_type;
create policy tripletex_vat_type_admin_read on tripletex_vat_type
  for select using (is_admin());

drop policy if exists tripletex_vat_type_revisor_read on tripletex_vat_type;
create policy tripletex_vat_type_revisor_read on tripletex_vat_type
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );
