-- =====================================================================
-- 0019 – Eksterne salg (Zettle / PayPal Point of Sale)
--   Zettle er den produkterklærte kassa som tar betaling. Vi speiler
--   fullførte kjøp hit for omsetning/CRM. Skrives av webhook/sync via
--   service-role (bypasser RLS). Kun admin kan lese (shop ser aldri omsetning).
--   Idempotent på (source, external_id).
-- =====================================================================

create table if not exists external_sales (
  id            uuid primary key default gen_random_uuid(),
  source        text not null default 'zettle',
  external_id   text not null,
  sold_at       timestamptz not null,
  amount_nok    numeric not null,
  payment_type  text,
  products      jsonb,
  raw           jsonb,
  created_at    timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists external_sales_sold_at_idx on external_sales (sold_at desc);

alter table external_sales enable row level security;

-- Kun admin ser eksterne salg (omsetning). Service-role bypasser RLS ved skriving.
drop policy if exists external_sales_admin_all on external_sales;
create policy external_sales_admin_all on external_sales
  for all using (is_admin()) with check (is_admin());
