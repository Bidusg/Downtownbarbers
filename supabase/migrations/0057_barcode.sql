-- =====================================================================
-- 0057 — STREKKODE PÅ PRODUKTER + LAGER-JUSTERING FRA SHOP
--
--   1) products.barcode: strekkode/serienr per produkt (settes i admin).
--      Skann i kassa → varen kommer opp automatisk. Unik når satt.
--   2) record_stock_movement: åpnes for shop (is_shop_or_admin) slik at
--      lager-skanning også virker fra shop-iPad (varemottak/justering).
--      Loggen (stock_movements.created_by) sier hvem som gjorde endringen.
--   Idempotent.
-- =====================================================================

alter table products add column if not exists barcode text;

-- Unik strekkode når satt (tom/NULL teller ikke).
create unique index if not exists products_barcode_uidx
  on products (barcode)
  where barcode is not null and barcode <> '';

-- Lager-justering: tidligere kun admin. Nå shop ELLER admin (eier dekkes av
-- is_admin). Selve loggen viser hvem som justerte.
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
  if not is_shop_or_admin() then
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

-- Offentlig/shop-lesbart oppslag på strekkode (aktive produkter). Security
-- definer så både admin og shop kan bruke det uten bred tilgang til products.
create or replace function find_product_by_barcode(p_code text)
returns table (id uuid, name text, price_nok numeric, stock int, is_gift_card boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.price_nok, p.stock, p.is_gift_card
  from products p
  where p.active = true
    and p.barcode is not null
    and p.barcode = trim(p_code)
  limit 1;
$$;
grant execute on function find_product_by_barcode(text) to authenticated;
