-- 0073_fixit_turnover.sql
-- Fixit historisk omsetning per dag (importert fra Fixit-eksport «Omsetning per måned»).
-- Daglige aggregater (ikke enkeltsalg). Blandes inn i trendgrafene med et
-- skille-tidspunkt (FIXIT_CUTOVER i src/lib/fixit-history.ts) så live-salg og
-- historikk aldri telles dobbelt.
create table if not exists fixit_turnover_daily (
  d              date primary key,
  behandling_nok numeric(12,2) not null default 0,
  varesalg_nok   numeric(12,2) not null default 0,
  total_nok      numeric(12,2) not null default 0,
  timer          numeric(10,2) not null default 0,
  source         text not null default 'fixit',
  imported_at    timestamptz not null default now()
);

create index if not exists fixit_turnover_daily_d_idx on fixit_turnover_daily (d);

alter table fixit_turnover_daily enable row level security;

-- Lese: admin/eier (is_admin()) + revisor. Skriving: service-rollen (import).
drop policy if exists fixit_turnover_daily_admin_read on fixit_turnover_daily;
create policy fixit_turnover_daily_admin_read on fixit_turnover_daily
  for select using (is_admin());

drop policy if exists fixit_turnover_daily_revisor_read on fixit_turnover_daily;
create policy fixit_turnover_daily_revisor_read on fixit_turnover_daily
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );

-- Data importeres separat (KJØR-I-SUPABASE-FIXIT.sql) – holder migrasjonen lett.
