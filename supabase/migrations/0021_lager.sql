-- =====================================================================
-- 0021 – LAGERSTYRING
--   Lav-lager-terskel per produkt + bevegelseslogg (varemottak, svinn,
--   justering, telling). Atomisk RPC oppdaterer beholdning og logger i ett.
-- Idempotent.
-- =====================================================================

alter table products add column if not exists low_stock_threshold int not null default 5;

create table if not exists stock_movements (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  delta       int not null,
  reason      text not null default 'justering',
  note        text,
  new_stock   int,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on stock_movements (product_id, created_at desc);

alter table stock_movements enable row level security;
drop policy if exists stock_movements_admin_all on stock_movements;
create policy stock_movements_admin_all on stock_movements
  for all using (is_admin()) with check (is_admin());

-- Atomisk lagerbevegelse: oppdaterer products.stock (aldri under 0) + logger. Kun admin.
create or replace function record_stock_movement(
  p_product uuid,
  p_delta int,
  p_reason text default 'justering',
  p_note text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_new int;
begin
  if not is_admin() then
    raise exception 'Ikke tilgang';
  end if;
  update products set stock = greatest(0, stock + p_delta)
    where id = p_product
    returning stock into v_new;
  if v_new is null then
    raise exception 'Fant ikke produktet';
  end if;
  insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
    values (
      p_product, p_delta,
      coalesce(nullif(trim(p_reason), ''), 'justering'),
      nullif(trim(p_note), ''),
      v_new,
      (select id from profiles where id = auth.uid())
    );
  return v_new;
end $$;
grant execute on function record_stock_movement(uuid, int, text, text) to authenticated;
