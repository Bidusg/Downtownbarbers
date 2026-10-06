-- =====================================================================
-- KJØR-I-SUPABASE-HISTORISK-OMSETNING.sql  (idempotent)
--   Historisk omsetning per ansatt per måned, importert fra det gamle
--   kassesystemet («Omsetning en ansatt»-PDF). Beløp er INKL. mva.
--   Vises i Omsetning, Rapporter, Produktivitet, Nøkkeltall,
--   Måloppnåelse og Lønn – merket «importert». Kun admin.
-- =====================================================================

create table if not exists historical_staff_revenue (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id) on delete cascade,
  month          date not null,               -- første dag i måneden
  hours          numeric(8,2) not null default 0,
  visits         int not null default 0,
  treatment_nok  numeric(12,2) not null default 0,
  product_nok    numeric(12,2) not null default 0,
  total_nok      numeric(12,2) not null default 0,
  source         text,                        -- f.eks. filnavn
  imported_at    timestamptz not null default now(),
  constraint historical_staff_revenue_month_first check (extract(day from month) = 1),
  unique (staff_id, month)
);
create index if not exists historical_staff_revenue_month_idx on historical_staff_revenue (month);

alter table historical_staff_revenue enable row level security;
drop policy if exists historical_staff_revenue_admin_all on historical_staff_revenue;
create policy historical_staff_revenue_admin_all on historical_staff_revenue
  for all using (is_admin()) with check (is_admin());
