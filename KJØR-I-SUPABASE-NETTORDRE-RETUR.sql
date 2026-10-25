-- =====================================================================
-- NETTORDRER – ENDRE ORDRE, RETUR, REKLAMASJON OG BYTTE
--
--   1) Endre en åpen ordre (før den er utlevert): endre antall, fjern
--      varer, legg til varer. Lageret og totalen følger med. For Vipps/kort
--      kan totalen ikke bli høyere enn beløpet kunden har godkjent.
--   2) Retur / reklamasjon / bytte på en utlevert ordre:
--      • varene registreres som returnert (og legges tilbake på lager om
--        ønsket – en reklamert vare som er ødelagt gjør ikke det),
--      • refusjonen føres som et negativt salg (kasseoppgjør og
--        regnskap stemmer), bytte-varer som et nytt salg,
--      • alt logges i ordrehistorikken.
--
--   Krever KJØR-I-SUPABASE-NETTBUTIKK.sql og -NETTORDRE-PLUKK.sql.
--   Trygt å kjøre flere ganger.
-- =====================================================================
begin;

-- ---------- 1) Kolonner og historikk ----------
alter table online_orders add column if not exists authorized_nok numeric(10,2);
alter table online_orders add column if not exists refunded_nok numeric(10,2) not null default 0;
alter table online_order_items add column if not exists returned_qty int not null default 0;

create table if not exists online_order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references online_orders(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references profiles(id) on delete set null,
  kind        text not null,          -- edit | return | complaint | exchange | note
  text        text not null,
  amount_nok  numeric(10,2),
  sale_id     uuid references sales(id) on delete set null
);
create index if not exists online_order_events_order_idx on online_order_events (order_id, created_at desc);
alter table online_order_events enable row level security;
drop policy if exists online_order_events_shop on online_order_events;
create policy online_order_events_shop on online_order_events for select to authenticated
  using (is_shop_or_admin());
revoke all on online_order_events from anon;

-- Notat i historikken (kassa/admin).
create or replace function online_order_note(p_order uuid, p_text text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  if nullif(trim(coalesce(p_text, '')), '') is null then return; end if;
  insert into online_order_events (order_id, created_by, kind, text)
  values (p_order, auth.uid(), 'note', left(trim(p_text), 1000));
end $$;
revoke execute on function online_order_note(uuid, text) from public, anon;
grant  execute on function online_order_note(uuid, text) to authenticated;

-- ---------- 2) Endre en åpen ordre ----------
-- p_changes: [{"item": "<uuid>", "qty": 2}]  (qty 0 = fjern linjen)
-- p_adds:    [{"product": "<uuid>", "qty": 1}]
create or replace function online_order_edit(p_order uuid, p_changes jsonb, p_adds jsonb, p_note text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_o online_orders; v_c jsonb; v_it online_order_items; v_new int; v_delta int; v_stock int;
  v_prod record; v_full numeric; v_log text[] := '{}'; v_added boolean := false; v_after online_orders;
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  select * into v_o from online_orders where id = p_order for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  if v_o.status not in ('new', 'picking', 'ready') then raise exception 'CLOSED'; end if;

  -- Ta vare på rabattsatsen og det godkjente beløpet FØR noe endres.
  select coalesce(sum(unit_price_nok * qty), 0) into v_full from online_order_items where order_id = p_order;
  update online_orders
     set discount_pct = coalesce(discount_pct, case when v_full > 0 then discount_nok / v_full else 0 end),
         authorized_nok = coalesce(authorized_nok, total_nok)
   where id = p_order
   returning * into v_o;

  for v_c in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    select * into v_it from online_order_items where id = (v_c->>'item')::uuid and order_id = p_order for update;
    if v_it.id is null then raise exception 'NOT_FOUND'; end if;
    v_new := greatest(0, least(50, coalesce((v_c->>'qty')::int, v_it.qty)));
    v_delta := v_new - v_it.qty;
    if v_delta = 0 then continue; end if;
    if v_it.product_id is not null then
      if v_delta > 0 then
        select stock into v_stock from products where id = v_it.product_id for update;
        if coalesce(v_stock, 0) < v_delta then raise exception 'OUT_OF_STOCK:%', v_it.name; end if;
      end if;
      -- Varer som manglet på hylla fantes ikke – de legges ikke tilbake.
      update products set stock = stock - greatest(v_delta, -(v_it.qty - v_it.missing_qty))
       where id = v_it.product_id and not is_gift_card returning stock into v_stock;
      if found then
        insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
        values (v_it.product_id, -greatest(v_delta, -(v_it.qty - v_it.missing_qty)), 'nettordre endret',
                'Ordre #' || v_o.order_no, v_stock, auth.uid());
      end if;
    end if;
    if v_new = 0 then
      delete from online_order_items where id = v_it.id;
      v_log := v_log || ('Fjernet ' || v_it.name);
    else
      update online_order_items
         set qty = v_new,
             line_total_nok = unit_price_nok * v_new,
             missing_qty = least(missing_qty, v_new),
             picked_qty = least(picked_qty, v_new - least(missing_qty, v_new))
       where id = v_it.id;
      v_log := v_log || (v_it.name || ' ' || v_it.qty || ' → ' || v_new);
      if v_delta > 0 then v_added := true; end if;
    end if;
  end loop;

  for v_c in select * from jsonb_array_elements(coalesce(p_adds, '[]'::jsonb)) loop
    v_new := greatest(1, least(50, coalesce((v_c->>'qty')::int, 1)));
    select id, coalesce(web_name, name) as name, price_nok, stock into v_prod
      from products where id = (v_c->>'product')::uuid and active and not is_gift_card for update;
    if v_prod.id is null then raise exception 'NOT_FOUND'; end if;
    if v_prod.stock < v_new then raise exception 'OUT_OF_STOCK:%', v_prod.name; end if;
    select * into v_it from online_order_items where order_id = p_order and product_id = v_prod.id limit 1;
    if v_it.id is not null then
      update online_order_items set qty = qty + v_new, line_total_nok = unit_price_nok * (qty + v_new) where id = v_it.id;
    else
      insert into online_order_items (order_id, product_id, name, unit_price_nok, qty, line_total_nok)
      values (p_order, v_prod.id, v_prod.name, v_prod.price_nok, v_new, v_prod.price_nok * v_new);
    end if;
    update products set stock = stock - v_new where id = v_prod.id returning stock into v_stock;
    insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
    values (v_prod.id, -v_new, 'nettordre endret', 'Ordre #' || v_o.order_no, v_stock, auth.uid());
    v_log := v_log || ('La til ' || v_new || ' × ' || v_prod.name);
    v_added := true;
  end loop;

  if not exists (select 1 from online_order_items where order_id = p_order) then
    raise exception 'EMPTY';
  end if;

  perform online_order_recalc(p_order);
  select * into v_after from online_orders where id = p_order;

  -- Vipps/kort: kan ikke trekke mer enn kunden har godkjent.
  if v_after.payment_method <> 'pay_at_pickup' and v_after.payment_status in ('authorized', 'paid')
     and v_after.total_nok > coalesce(v_after.authorized_nok, v_after.total_nok) then
    raise exception 'OVER_AUTHORIZED:%', v_after.authorized_nok;
  end if;

  -- Nye varer må plukkes.
  if v_added and v_after.status = 'ready' then
    update online_orders set status = 'picking', picked_at = null where id = p_order;
  end if;

  if array_length(v_log, 1) > 0 then
    insert into online_order_events (order_id, created_by, kind, text, amount_nok)
    values (p_order, auth.uid(), 'edit',
            array_to_string(v_log, '; ') || coalesce('. ' || nullif(trim(coalesce(p_note, '')), ''), ''),
            v_after.total_nok);
  end if;

  return json_build_object('total_nok', v_after.total_nok, 'changes', array_to_string(v_log, '; '));
end $$;
revoke execute on function online_order_edit(uuid, jsonb, jsonb, text) from public, anon;
grant  execute on function online_order_edit(uuid, jsonb, jsonb, text) to authenticated;

-- ---------- 3) Retur / reklamasjon / bytte ----------
-- p_kind:         retur | reklamasjon | bytte
-- p_lines:        [{"item": "<uuid>", "qty": 1}]      varer kunden leverer tilbake
-- p_restock:      legg de returnerte varene tilbake på lager
-- p_refund:       beløp kunden får tilbake (0 ved rent bytte)
-- p_refund_method Vipps | Kort | Kontant
-- p_replacements: [{"product": "<uuid>", "qty": 1}]  varer kunden får i bytte
-- p_extra:        mellomlegg kunden betaler (bytte til dyrere vare)
create or replace function online_order_return(
  p_order uuid, p_kind text, p_lines jsonb, p_restock boolean,
  p_refund numeric, p_refund_method text,
  p_replacements jsonb default '[]'::jsonb, p_extra numeric default 0, p_extra_method text default null,
  p_note text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_o online_orders; v_l jsonb; v_it online_order_items; v_q int; v_stock int; v_prod record;
  v_sale uuid; v_items_sum numeric := 0; v_total numeric; v_log text[] := '{}'; v_repl text[] := '{}';
  v_refund numeric := round(coalesce(p_refund, 0), 2); v_extra numeric := round(coalesce(p_extra, 0), 2);
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  if p_kind not in ('retur', 'reklamasjon', 'bytte') then raise exception 'BAD_KIND'; end if;
  select * into v_o from online_orders where id = p_order for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  if v_o.status not in ('picked_up', 'shipped') then raise exception 'NOT_COMPLETED'; end if;
  if v_refund < 0 or v_extra < 0 then raise exception 'BAD_AMOUNT'; end if;
  if v_refund > v_o.total_nok - v_o.refunded_nok then raise exception 'REFUND_TOO_HIGH:%', v_o.total_nok - v_o.refunded_nok; end if;
  if v_refund > 0 and p_refund_method not in ('Vipps', 'Kort', 'Kontant') then raise exception 'BAD_METHOD'; end if;
  if v_extra > 0 and coalesce(p_extra_method, '') not in ('Vipps', 'Kort', 'Kontant') then raise exception 'BAD_METHOD'; end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
  values (null, null, v_o.customer_id, 0,
          case when v_refund > 0 then p_refund_method when v_extra > 0 then p_extra_method else 'Bytte' end)
  returning id into v_sale;

  -- Varene som kommer tilbake.
  for v_l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_q := coalesce((v_l->>'qty')::int, 0);
    if v_q <= 0 then continue; end if;
    select * into v_it from online_order_items where id = (v_l->>'item')::uuid and order_id = p_order for update;
    if v_it.id is null then raise exception 'NOT_FOUND'; end if;
    if v_q > v_it.qty - v_it.missing_qty - v_it.returned_qty then raise exception 'TOO_MANY:%', v_it.name; end if;
    update online_order_items set returned_qty = returned_qty + v_q where id = v_it.id;
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
    values (v_sale, 'product', v_it.product_id,
            initcap(p_kind) || ': ' || v_it.name || ' (ordre #' || v_o.order_no || ')', -v_q, v_it.unit_price_nok);
    v_items_sum := v_items_sum - v_it.unit_price_nok * v_q;
    if v_it.product_id is not null then
      if p_restock then
        update products set stock = stock + v_q where id = v_it.product_id and not is_gift_card returning stock into v_stock;
        if found then
          insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
          values (v_it.product_id, v_q, p_kind, 'Ordre #' || v_o.order_no, v_stock, auth.uid());
        end if;
      else
        insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
        select v_it.product_id, 0, p_kind || ' – ikke på lager igjen', 'Ordre #' || v_o.order_no || ': ' || v_q || ' stk', stock, auth.uid()
          from products where id = v_it.product_id;
      end if;
    end if;
    v_log := v_log || (v_q || ' × ' || v_it.name);
  end loop;

  -- Varene kunden får i bytte.
  for v_l in select * from jsonb_array_elements(coalesce(p_replacements, '[]'::jsonb)) loop
    v_q := coalesce((v_l->>'qty')::int, 0);
    if v_q <= 0 then continue; end if;
    select id, coalesce(web_name, name) as name, price_nok, stock into v_prod
      from products where id = (v_l->>'product')::uuid and active and not is_gift_card for update;
    if v_prod.id is null then raise exception 'NOT_FOUND'; end if;
    if v_prod.stock < v_q then raise exception 'OUT_OF_STOCK:%', v_prod.name; end if;
    update products set stock = stock - v_q where id = v_prod.id returning stock into v_stock;
    insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
    values (v_prod.id, -v_q, 'bytte', 'Ordre #' || v_o.order_no, v_stock, auth.uid());
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
    values (v_sale, 'product', v_prod.id, 'Bytte: ' || v_prod.name || ' (ordre #' || v_o.order_no || ')', v_q, v_prod.price_nok);
    v_items_sum := v_items_sum + v_prod.price_nok * v_q;
    v_repl := v_repl || (v_q || ' × ' || v_prod.name);
  end loop;

  if array_length(v_log, 1) is null and array_length(v_repl, 1) is null then raise exception 'NOTHING'; end if;

  -- Pengene som faktisk går inn/ut. Avvik mot varelinjene (kundeklubb-
  -- rabatt, kulanse) føres som egen justeringslinje, så salget stemmer.
  v_total := v_extra - v_refund;
  if v_total <> v_items_sum then
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
    values (v_sale, 'adjustment', null, 'Rabatt / justering (ordre #' || v_o.order_no || ')', 1, v_total - v_items_sum);
  end if;
  update sales set total_nok = v_total where id = v_sale;
  if v_refund > 0 then
    insert into sale_payments (sale_id, method, amount) values (v_sale, p_refund_method, -v_refund);
  end if;
  if v_extra > 0 then
    insert into sale_payments (sale_id, method, amount) values (v_sale, p_extra_method, v_extra);
  end if;

  update online_orders
     set refunded_nok = refunded_nok + v_refund,
         payment_status = case when v_refund > 0 and refunded_nok + v_refund >= total_nok then 'refunded' else payment_status end
   where id = p_order;

  insert into online_order_events (order_id, created_by, kind, text, amount_nok, sale_id)
  values (p_order, auth.uid(),
          case p_kind when 'retur' then 'return' when 'reklamasjon' then 'complaint' else 'exchange' end,
          initcap(p_kind) || ': ' || coalesce(array_to_string(v_log, ', '), '–')
            || case when array_length(v_repl, 1) > 0 then ' → byttet til ' || array_to_string(v_repl, ', ') else '' end
            || case when v_refund > 0 then '. Refundert ' || v_refund || ' kr (' || p_refund_method || ')' else '' end
            || case when v_extra > 0 then '. Mellomlegg ' || v_extra || ' kr (' || p_extra_method || ')' else '' end
            || case when array_length(v_log, 1) > 0 then case when p_restock then '. Lagt tilbake på lager' else '. Ikke lagt på lager' end else '' end
            || coalesce('. ' || nullif(trim(coalesce(p_note, '')), ''), ''),
          v_total, v_sale);

  return json_build_object('sale_id', v_sale, 'refund', v_refund, 'extra', v_extra);
end $$;
revoke execute on function online_order_return(uuid, text, jsonb, boolean, numeric, text, jsonb, numeric, text, text) from public, anon;
grant  execute on function online_order_return(uuid, text, jsonb, boolean, numeric, text, jsonb, numeric, text, text) to authenticated;

-- ---------- 4) Kundens egne nettordrer (Min side) ----------
create or replace function customer_portal_orders(p_token uuid)
returns table (id uuid, order_no bigint, created_at timestamptz, status text, total_nok numeric,
               refunded_nok numeric, access_token uuid, item_count int)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_no, o.created_at, o.status, o.total_nok, o.refunded_nok, o.access_token,
         (select coalesce(sum(i.qty - i.missing_qty), 0)::int from online_order_items i where i.order_id = o.id)
    from online_orders o
    join customers c on c.portal_token = p_token
   where (o.customer_id = c.id or lower(trim(o.email)) = lower(trim(c.email)))
     and not (o.payment_method <> 'pay_at_pickup' and o.payment_status in ('pending', 'failed'))
   order by o.created_at desc
   limit 50;
$$;
revoke execute on function customer_portal_orders(uuid) from public;
grant  execute on function customer_portal_orders(uuid) to anon, authenticated;

-- ---------- 5) Kundens ordreside: vis retur og refusjon ----------
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
    'completed_at', o.completed_at, 'cancelled_at', o.cancelled_at, 'refunded_nok', o.refunded_nok,
    'items', coalesce((select json_agg(json_build_object('name', i.name, 'qty', i.qty,
                         'picked_qty', i.picked_qty, 'missing_qty', i.missing_qty, 'returned_qty', i.returned_qty,
                         'unit_price_nok', i.unit_price_nok, 'line_total_nok', i.line_total_nok))
                         from online_order_items i where i.order_id = o.id), '[]'::json))
  from online_orders o where o.id = p_order and o.access_token = p_token;
$$;
revoke execute on function online_order_public(uuid, uuid) from public;
grant  execute on function online_order_public(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
