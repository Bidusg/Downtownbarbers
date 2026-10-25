-- =====================================================================
-- NETTORDRER – PLUKKING MED SKANNING + STATUS KUNDEN KAN FØLGE
--
--   Ny → Plukkes → Klar til henting / Pakket → Utlevert / Sendt
--
--   1) Kassa skanner hver vare inn på ordren (eller trykker +). Feil vare
--      blir stoppet: «står ikke på ordren».
--   2) Finnes ikke varen på hylla, trykker kassa «Mangler». Linjen tas ut
--      av ordren og totalen regnes om (Vipps trekker bare det som utleveres).
--   3) «Klar til henting» og «Utlevert» krever at hele ordren er plukket.
--   4) Kunden ser fremdriften på ordresiden.
--
--   LAGER: varene holdes av (trekkes fra lageret) idet ordren legges inn,
--   slik at ingen andre kan kjøpe de samme varene. Salget (omsetning,
--   regnskap) registreres først når kunden har fått varene. Kanselleres
--   ordren, legges varene tilbake – unntatt de som manglet på hylla
--   (de fantes aldri, så lageret var for høyt; det blir riktig nå).
--
--   Krever KJØR-I-SUPABASE-NETTBUTIKK.sql. Trygt å kjøre flere ganger.
-- =====================================================================
begin;

-- ---------- 1) Kolonner ----------
alter table online_orders add column if not exists picking_started_at timestamptz;
alter table online_orders add column if not exists picked_at timestamptz;
alter table online_orders add column if not exists picked_by uuid references profiles(id) on delete set null;
alter table online_orders add column if not exists discount_pct numeric;
alter table online_order_items add column if not exists picked_qty int not null default 0;
alter table online_order_items add column if not exists missing_qty int not null default 0;

alter table online_orders drop constraint if exists online_orders_values_check;
alter table online_orders add constraint online_orders_values_check check (
  delivery in ('pickup', 'ship')
  and payment_method in ('vipps', 'card', 'pay_at_pickup')
  and payment_status in ('pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded')
  and status in ('new', 'picking', 'ready', 'picked_up', 'shipped', 'cancelled'));

-- ---------- 2) Regn om totalen (når noe mangler) ----------
create or replace function online_order_recalc(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_o online_orders; v_full numeric; v_sub numeric; v_pct numeric;
begin
  select * into v_o from online_orders where id = p_order for update;
  select coalesce(sum(unit_price_nok * qty), 0), coalesce(sum(unit_price_nok * (qty - missing_qty)), 0)
    into v_full, v_sub from online_order_items where order_id = p_order;
  -- Rabattsatsen fra bestillingen tas vare på første gang.
  v_pct := coalesce(v_o.discount_pct,
                    case when v_full > 0 then v_o.discount_nok / v_full else 0 end);
  update online_orders
     set discount_pct = v_pct,
         subtotal_nok = v_sub,
         discount_nok = round(v_sub * v_pct),
         total_nok    = case when v_sub > 0 then v_sub - round(v_sub * v_pct) + shipping_nok else 0 end
   where id = p_order;
end $$;
revoke execute on function online_order_recalc(uuid) from public, anon, authenticated;

-- Er hele ordren plukket (hver linje enten plukket eller merket mangler)?
create or replace function online_order_fully_picked(p_order uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from online_order_items
                      where order_id = p_order and picked_qty + missing_qty < qty);
$$;
grant execute on function online_order_fully_picked(uuid) to authenticated;

-- ---------- 3) Plukk: skann strekkode, eller +/- på en linje ----------
-- p_code: strekkoden som ble skannet (p_item null).
-- p_item + p_delta: manuelt +1 / -1 på en linje (varer uten strekkode).
create or replace function online_order_pick(
  p_order uuid, p_code text default null, p_item uuid default null, p_delta int default 1)
returns json
language plpgsql security definer set search_path = public as $$
declare v_o online_orders; v_prod record; v_it online_order_items; v_code text := nullif(trim(coalesce(p_code, '')), '');
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  select * into v_o from online_orders where id = p_order for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  if v_o.status not in ('new', 'picking', 'ready') then raise exception 'CLOSED'; end if;

  if p_item is not null then
    select * into v_it from online_order_items where id = p_item and order_id = p_order for update;
    if v_it.id is null then raise exception 'NOT_FOUND'; end if;
  else
    if v_code is null then raise exception 'NO_CODE'; end if;
    select id, coalesce(web_name, name) as name into v_prod
      from products
     where barcode = v_code
        or (ltrim(barcode, '0') = ltrim(v_code, '0') and ltrim(v_code, '0') <> '')
     order by (barcode = v_code) desc
     limit 1;
    if v_prod.id is null then
      return json_build_object('ok', false, 'error', 'UNKNOWN', 'code', v_code);
    end if;
    select * into v_it from online_order_items
     where order_id = p_order and product_id = v_prod.id
     order by (picked_qty + missing_qty < qty) desc
     limit 1 for update;
    if v_it.id is null then
      return json_build_object('ok', false, 'error', 'NOT_IN_ORDER', 'name', v_prod.name);
    end if;
    if v_it.picked_qty + v_it.missing_qty >= v_it.qty then
      return json_build_object('ok', false, 'error', 'ALREADY_PICKED', 'name', v_it.name);
    end if;
    p_delta := 1;
  end if;

  update online_order_items
     set picked_qty = greatest(0, least(qty - missing_qty, picked_qty + p_delta))
   where id = v_it.id
   returning * into v_it;

  update online_orders
     set status = case when status = 'new' then 'picking' else status end,
         picking_started_at = coalesce(picking_started_at, now()),
         picked_by = coalesce(auth.uid(), picked_by)
   where id = p_order;

  -- Angret en vare etter «Klar»? Da er den ikke klar lenger.
  if not online_order_fully_picked(p_order) then
    update online_orders set status = 'picking', picked_at = null where id = p_order and status = 'ready';
  end if;

  return json_build_object('ok', true, 'name', v_it.name, 'picked', v_it.picked_qty, 'qty', v_it.qty,
                           'done', online_order_fully_picked(p_order));
end $$;
revoke execute on function online_order_pick(uuid, text, uuid, int) from public, anon;
grant  execute on function online_order_pick(uuid, text, uuid, int) to authenticated;

-- ---------- 4) Mangler på hylla ----------
create or replace function online_order_set_missing(p_item uuid, p_missing boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_it online_order_items; v_o online_orders; v_n int;
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  select * into v_it from online_order_items where id = p_item for update;
  if v_it.id is null then raise exception 'NOT_FOUND'; end if;
  select * into v_o from online_orders where id = v_it.order_id for update;
  if v_o.status not in ('new', 'picking', 'ready') then raise exception 'CLOSED'; end if;

  v_n := case when p_missing then v_it.qty - v_it.picked_qty else 0 end;
  if v_n = v_it.missing_qty then return; end if;
  update online_order_items set missing_qty = v_n where id = p_item;

  -- Spor i lagerloggen: beholdningen sa at varen fantes, men den gjorde ikke det.
  if v_it.product_id is not null then
    insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
    select v_it.product_id, 0,
           case when p_missing then 'mangler ved plukk' else 'funnet likevel' end,
           'Ordre #' || v_o.order_no || ': ' || abs(v_n - v_it.missing_qty) || ' stk',
           p.stock, auth.uid()
      from products p where p.id = v_it.product_id;
  end if;

  update online_orders
     set status = case when status = 'new' then 'picking' else status end,
         picking_started_at = coalesce(picking_started_at, now())
   where id = v_o.id;
  perform online_order_recalc(v_o.id);
end $$;
revoke execute on function online_order_set_missing(uuid, boolean) from public, anon;
grant  execute on function online_order_set_missing(uuid, boolean) to authenticated;

-- ---------- 5) Klar til henting / pakket ----------
create or replace function online_order_mark_ready(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_o online_orders;
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  select * into v_o from online_orders where id = p_order for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  if v_o.status not in ('new', 'picking') then raise exception 'ALREADY_DONE'; end if;
  if not online_order_fully_picked(p_order) then raise exception 'NOT_PICKED'; end if;
  if v_o.total_nok <= 0 then raise exception 'NOTHING_LEFT'; end if;
  update online_orders
     set status = 'ready', ready_at = now(), picked_at = now(),
         picked_by = coalesce(auth.uid(), picked_by)
   where id = p_order;
end $$;
revoke execute on function online_order_mark_ready(uuid) from public, anon;
grant  execute on function online_order_mark_ready(uuid) to authenticated;

-- ---------- 6) Kansellering: legg tilbake det som faktisk fantes ----------
create or replace function cancel_online_order(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_o online_orders; v_i record; v_new int; v_back int;
begin
  if auth.role() <> 'service_role' and not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  select * into v_o from online_orders where id = p_order for update;
  if v_o.id is null or v_o.status = 'cancelled' then return; end if;
  if v_o.status in ('picked_up', 'shipped') then raise exception 'ALREADY_DONE'; end if;
  for v_i in select product_id, qty, missing_qty from online_order_items
              where order_id = p_order and product_id is not null loop
    v_back := v_i.qty - v_i.missing_qty;
    if v_back > 0 then
      update products set stock = stock + v_back
       where id = v_i.product_id and not is_gift_card returning stock into v_new;
      if found then
        insert into stock_movements (product_id, delta, reason, note, new_stock)
        values (v_i.product_id, v_back, 'nettordre avbrutt', 'Ordre #' || v_o.order_no, v_new);
      end if;
    end if;
  end loop;
  update online_orders
     set status = 'cancelled', cancelled_at = now(),
         payment_status = case when payment_status in ('pending', 'authorized') then 'cancelled' else payment_status end
   where id = p_order;
end $$;
revoke execute on function cancel_online_order(uuid) from public, anon;
grant  execute on function cancel_online_order(uuid) to authenticated, service_role;

-- ---------- 7) Utlevert / sendt: salget = det som faktisk ble utlevert ----------
create or replace function complete_online_order(p_order uuid, p_payment_method text, p_tracking text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_o online_orders; v_sale uuid; v_i record;
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  select * into v_o from online_orders where id = p_order for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  if v_o.status in ('picked_up', 'shipped', 'cancelled') then raise exception 'ALREADY_DONE'; end if;
  if not online_order_fully_picked(p_order) then raise exception 'NOT_PICKED'; end if;
  if v_o.total_nok <= 0 then raise exception 'NOTHING_LEFT'; end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
  values (null, null, v_o.customer_id, v_o.total_nok, p_payment_method)
  returning id into v_sale;
  update sales set discount_nok = v_o.discount_nok where id = v_sale;

  for v_i in select * from online_order_items where order_id = p_order and qty - missing_qty > 0 loop
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
    values (v_sale, 'product', v_i.product_id, v_i.name, v_i.qty - v_i.missing_qty, v_i.unit_price_nok);
  end loop;
  if v_o.shipping_nok > 0 then
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
    values (v_sale, 'shipping', null, 'Frakt', 1, v_o.shipping_nok);
  end if;
  insert into sale_payments (sale_id, method, amount) values (v_sale, p_payment_method, v_o.total_nok);
  if v_o.member_tier is not null and v_o.discount_nok > 0 then
    begin
      update sales set member_tier = v_o.member_tier, member_discount_nok = v_o.discount_nok where id = v_sale;
    exception when undefined_column then null;
    end;
  end if;

  update online_orders
     set status = case when delivery = 'ship' then 'shipped' else 'picked_up' end,
         payment_status = 'paid', sale_id = v_sale, completed_at = now(),
         tracking_no = coalesce(nullif(trim(p_tracking), ''), tracking_no)
   where id = p_order;
  return v_sale;
end $$;
revoke execute on function complete_online_order(uuid, text, text) from public, anon;
grant  execute on function complete_online_order(uuid, text, text) to authenticated;

-- ---------- 8) Kundens ordreside: fremdrift ----------
create or replace function online_order_public(p_order uuid, p_token uuid)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', o.id, 'order_no', o.order_no, 'created_at', o.created_at, 'name', o.name, 'email', o.email,
    'delivery', o.delivery, 'address', o.address, 'postal_code', o.postal_code, 'city', o.city,
    'subtotal_nok', o.subtotal_nok, 'discount_nok', o.discount_nok, 'shipping_nok', o.shipping_nok,
    'total_nok', o.total_nok, 'member_tier', o.member_tier, 'payment_method', o.payment_method,
    'payment_status', o.payment_status, 'status', o.status, 'tracking_no', o.tracking_no,
    'picking_started_at', o.picking_started_at, 'ready_at', o.ready_at,
    'completed_at', o.completed_at, 'cancelled_at', o.cancelled_at,
    'items', coalesce((select json_agg(json_build_object('name', i.name, 'qty', i.qty,
                         'picked_qty', i.picked_qty, 'missing_qty', i.missing_qty,
                         'unit_price_nok', i.unit_price_nok, 'line_total_nok', i.line_total_nok))
                         from online_order_items i where i.order_id = o.id), '[]'::json))
  from online_orders o where o.id = p_order and o.access_token = p_token;
$$;
revoke execute on function online_order_public(uuid, uuid) from public;
grant  execute on function online_order_public(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
