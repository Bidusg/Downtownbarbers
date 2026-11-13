-- =====================================================================
-- KASSE-VERN – hull i pengesporet funnet i QA-gjennomgangen
--
--   1) reopen_booking: gavekort-saldo ble ikke tilbakeført når et salg ble
--      angret, og medlems-kupongen forble «brukt». Nå tilbakeføres begge.
--      Er dagen allerede gjort opp (cash_settlements), kan bare admin angre.
--   2) record_sale: et salg med beløp over 0 kunne registreres helt uten
--      betaling. Nå kreves betalingsmåte («Mangler betalingsmåte.»).
--   3) record_walkin_sale_v2: manglet revoke fra public/anon.
--   4) online_order_return: kassa (ikke admin) kan ikke refundere mer enn
--      verdien av varene som leveres tilbake (+ frakt når alt er returnert).
--
--   Kopiert fra siste definisjon:
--     reopen_booking   ← KJØR-I-SUPABASE.sql (1742-1777)
--     record_sale      ← KJØR-I-SUPABASE-GAVEKORT-BETALING.sql (20-217)
--     online_order_return ← KJØR-I-SUPABASE-NETTORDRE-TILGODELAPP.sql (34-161)
--   Krever at disse er kjørt først (gift_card_redemptions, member_campaign_redemptions).
--   Idempotent – trygg å kjøre flere ganger.
-- =====================================================================

-- 1) reopen_booking
create or replace function reopen_booking(p_booking uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sale record;
  v_agg  record;
  v_gc   record;
  v_new  int;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  for v_sale in select id, sold_at from sales where booking_id = p_booking loop
    -- Vern: er dagen allerede gjort opp, kan bare admin angre salget.
    if not is_admin() and exists (
      select 1 from cash_settlements
        where settle_date = (v_sale.sold_at at time zone 'Europe/Oslo')::date
    ) then
      raise exception 'Dagen er allerede gjort opp – be admin om å angre salget.';
    end if;

    -- Tilbakefør lager per produkt (summert, så flere linjer med samme
    -- produkt håndteres riktig) og logg reverseringen.
    for v_agg in
      select ref_id, sum(quantity)::int as qty
        from sale_items
        where sale_id = v_sale.id and kind = 'product' and ref_id is not null
        group by ref_id
    loop
      update products set stock = stock + v_agg.qty
        where id = v_agg.ref_id
        returning stock into v_new;
      if v_new is not null then
        insert into stock_movements (product_id, delta, reason, new_stock, created_by)
          values (v_agg.ref_id, v_agg.qty, 'salg angret', v_new,
                  (select id from profiles where id = auth.uid()));
      end if;
    end loop;

    -- Tilbakefør gavekort-saldo som ble brukt på salget, og fjern innløsningene.
    for v_gc in
      select gift_card_id, sum(amount_nok) as amt
        from gift_card_redemptions
        where sale_id = v_sale.id
        group by gift_card_id
    loop
      update gift_cards set balance_nok = balance_nok + v_gc.amt where id = v_gc.gift_card_id;
    end loop;
    delete from gift_card_redemptions where sale_id = v_sale.id;

    -- Frigjør medlems-kupongen som ble brukt på salget (ellers er en
    -- engangskupong brent selv om salget er angret).
    delete from member_campaign_redemptions where sale_id = v_sale.id;

    delete from sales where id = v_sale.id;
  end loop;

  update bookings set status = 'confirmed' where id = p_booking;
end $$;

revoke execute on function reopen_booking(uuid) from public, anon;
grant execute on function reopen_booking(uuid) to authenticated;

-- 2) record_sale (signatur uendret)
create or replace function record_sale(
  p_booking        uuid,
  p_payment_method text    default null,
  p_products       jsonb   default '[]'::jsonb,
  p_discount       numeric default 0,
  p_payments       jsonb   default null,
  p_campaign       uuid    default null,
  p_gift_code      text    default null,   -- gavekort-kode/strekkode
  p_gift_amount    numeric default null    -- ønsket trekk; null = så mye som mulig
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking      record;
  v_sale         uuid;
  v_gross        numeric(10,2) := 0;
  v_discount     numeric(10,2) := 0;
  v_campaign_disc numeric(10,2) := 0;
  v_net          numeric(10,2) := 0;
  v_item         jsonb;
  v_prod         record;
  v_qty          int;
  v_new          int;
  v_pay          jsonb;
  v_paysum       numeric(10,2) := 0;
  v_paycount     int := 0;
  v_method       text;
  v_amount       numeric(10,2);
  v_single       text;
  v_gift_id      uuid;
  v_gift_balance numeric(10,2);
  v_gift_expired boolean;
  v_gift_take    numeric(10,2) := 0;
  v_rest         numeric(10,2) := 0;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  select id, staff_id, customer_id, service_id, price_nok, status
    into v_booking
    from bookings
    where id = p_booking
    for update;
  if not found then
    raise exception 'Fant ikke timen';
  end if;
  if v_booking.status = 'completed' then
    raise exception 'Timen er allerede fullført';
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (p_booking, v_booking.staff_id, v_booking.customer_id, 0, null)
    returning id into v_sale;

  if v_booking.service_id is not null then
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_booking.service_id, 1,
              coalesce(v_booking.price_nok, 0));
    v_gross := v_gross + coalesce(v_booking.price_nok, 0);
  end if;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));

    select id, name, price_nok
      into v_prod
      from products
      where id = (v_item->>'id')::uuid and active = true
      for update;
    if not found then
      raise exception 'Fant ikke produktet';
    end if;

    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'product', v_prod.id, v_prod.name, v_qty, v_prod.price_nok);
    v_gross := v_gross + (v_prod.price_nok * v_qty);

    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id
      returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  -- Medlems-kupong (valgfri): beregnes + valideres + logges server-side.
  if p_campaign is not null then
    v_campaign_disc := apply_member_campaign(v_sale, v_booking.customer_id, p_campaign, v_gross);
  end if;

  -- Rabatt: manuell + kupong, begrenset til [0, brutto]. Netto = brutto − rabatt.
  v_discount := least(greatest(coalesce(p_discount, 0), 0) + v_campaign_disc, v_gross);
  v_net := v_gross - v_discount;

  -- ---------- Gavekort (valgfritt) – samme regler som hurtigsalget ----------
  if p_gift_code is not null and trim(p_gift_code) <> '' and v_net > 0 then
    select g.id, g.balance_nok,
           (g.expires_at is not null and g.expires_at < current_date)
      into v_gift_id, v_gift_balance, v_gift_expired
    from gift_cards g
    where g.code = trim(p_gift_code)
       or (g.barcode is not null and g.barcode = trim(p_gift_code))
    for update
    limit 1;

    if v_gift_id is null then
      raise exception 'Fant ikke gavekortet';
    end if;
    if v_gift_expired then
      raise exception 'Gavekortet er utløpt';
    end if;
    if v_gift_balance <= 0 then
      raise exception 'Gavekortet er tomt';
    end if;

    v_gift_take := least(coalesce(round(p_gift_amount, 2), v_net), v_gift_balance, v_net);
    if v_gift_take > 0 then
      update gift_cards set balance_nok = balance_nok - v_gift_take where id = v_gift_id;
      insert into gift_card_redemptions (gift_card_id, sale_id, amount_nok)
        values (v_gift_id, v_sale, v_gift_take);
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, 'Gavekort', v_gift_take);
      v_paysum := v_paysum + v_gift_take;
      v_paycount := v_paycount + 1;
      v_single := 'Gavekort';
    end if;
  end if;

  v_rest := v_net - v_gift_take;

  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    for v_pay in select * from jsonb_array_elements(p_payments)
    loop
      v_method := nullif(trim(coalesce(v_pay->>'method', '')), '');
      v_amount := round(coalesce((v_pay->>'amount')::numeric, 0), 2);
      if v_method is null then
        raise exception 'Betalingslinje mangler betalingsmåte';
      end if;
      if lower(v_method) = 'gavekort' then
        raise exception 'Gavekort angis via gavekort-feltet, ikke som splittlinje';
      end if;
      if v_amount <= 0 then
        continue;
      end if;
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_method, v_amount);
      v_paysum := v_paysum + v_amount;
      v_paycount := v_paycount + 1;
      v_single := v_method;
    end loop;

    if v_paycount = 0 or (v_paycount = 1 and v_gift_take > 0 and v_rest > 0) then
      raise exception 'Ingen gyldige betalingslinjer';
    end if;
    if abs(v_paysum - v_net) > 1 then
      raise exception 'Betaling (% kr) stemmer ikke med totalen (% kr)',
        round(v_paysum), round(v_net);
    end if;

    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = case when v_paycount = 1 then v_single else 'Delt' end
      where id = v_sale;

  else
    v_method := nullif(trim(coalesce(p_payment_method, '')), '');
    if v_gift_take > 0 then
      -- Gavekort dekker hele/deler: resten (hvis noe) med valgt måte.
      if v_rest > 0 then
        if v_method is null or lower(v_method) = 'gavekort' then
          raise exception 'Velg betalingsmåte for resten (% kr)', round(v_rest);
        end if;
        insert into sale_payments (sale_id, method, amount)
          values (v_sale, v_method, v_rest);
        v_paycount := v_paycount + 1;
        v_single := v_method;
      end if;
    else
      v_single := v_method;
      if v_net > 0 and v_single is null then
        raise exception 'Mangler betalingsmåte.';
      end if;
      if v_single is not null and v_net > 0 then
        insert into sale_payments (sale_id, method, amount)
          values (v_sale, v_single, v_net);
      end if;
    end if;
    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = case when v_paycount > 1 then 'Delt' else v_single end
      where id = v_sale;
  end if;

  update bookings set status = 'completed' where id = p_booking;

  return v_sale;
end $$;

revoke execute on function record_sale(uuid, text, jsonb, numeric, jsonb, uuid, text, numeric) from public, anon;
grant execute on function record_sale(uuid, text, jsonb, numeric, jsonb, uuid, text, numeric) to authenticated;

-- 3) record_walkin_sale_v2: bare revoke/grant
revoke execute on function record_walkin_sale_v2(
  uuid, text, jsonb, jsonb, jsonb, boolean, numeric, jsonb, uuid, text, numeric
) from public, anon;
grant execute on function record_walkin_sale_v2(
  uuid, text, jsonb, jsonb, jsonb, boolean, numeric, jsonb, uuid, text, numeric
) to authenticated;

-- 4) online_order_return
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
  v_gift text := null; v_try int; v_ret_value numeric := 0; v_ship_back numeric := 0;
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  if p_kind not in ('retur', 'reklamasjon', 'bytte') then raise exception 'BAD_KIND'; end if;
  select * into v_o from online_orders where id = p_order for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  if v_o.status not in ('picked_up', 'shipped') then raise exception 'NOT_COMPLETED'; end if;
  if v_refund < 0 or v_extra < 0 then raise exception 'BAD_AMOUNT'; end if;
  if v_refund > v_o.total_nok - v_o.refunded_nok then raise exception 'REFUND_TOO_HIGH:%', v_o.total_nok - v_o.refunded_nok; end if;
  -- Vipps er IKKE lenger en refusjonsmåte.
  if v_refund > 0 and p_refund_method not in ('Gavekort', 'Kort', 'Kontant') then raise exception 'BAD_METHOD'; end if;
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
    v_ret_value := v_ret_value + v_it.unit_price_nok * v_q;
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

  -- Vern: kassa (ikke admin) kan ikke refundere mer enn verdien av varene som
  -- leveres tilbake (+ frakt når alt er returnert). Større refusjon må admin godkjenne.
  -- (Frakt regnes i egen variabel: PL/pgSQL avslutter IF-uttrykket ved første
  --  THEN, så en CASE WHEN … THEN inne i IF-en gir syntaksfeil.)
  if v_refund > 0 and not is_admin() then
    if not exists (
         select 1 from online_order_items i
          where i.order_id = p_order and i.qty - i.missing_qty - i.returned_qty > 0) then
      v_ship_back := coalesce(v_o.shipping_nok, 0);
    end if;
    if v_refund > v_ret_value + v_ship_back + 0.5 then
      raise exception 'Refusjonen er større enn verdien av varene som returneres – må godkjennes av admin.';
    end if;
  end if;

  -- Refusjon som gavekort: utsted kortet før noe føres, så beløpet aldri
  -- registreres som tilbakebetalt uten at kunden faktisk har fått en kode.
  if v_refund > 0 and p_refund_method = 'Gavekort' then
    for v_try in 1..10 loop
      begin
        insert into gift_cards (code, initial_nok, balance_nok)
        values ('DB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)), v_refund, v_refund)
        returning code into v_gift;
        exit;
      exception when unique_violation then v_gift := null;  -- koden var tatt, prøv igjen
      end;
    end loop;
    if v_gift is null then raise exception 'GIFT_FAILED'; end if;
  end if;

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
            || coalesce(' – gavekort ' || v_gift, '')
            || case when v_extra > 0 then '. Mellomlegg ' || v_extra || ' kr (' || p_extra_method || ')' else '' end
            || case when array_length(v_log, 1) > 0 then case when p_restock then '. Lagt tilbake på lager' else '. Ikke lagt på lager' end else '' end
            || coalesce('. ' || nullif(trim(coalesce(p_note, '')), ''), ''),
          v_total, v_sale);

  return json_build_object(
    'sale_id', v_sale, 'refund', v_refund, 'extra', v_extra,
    'gift_code', v_gift,
    'replaced_with', coalesce(array_to_string(v_repl, ', '), ''));
end $$;
revoke execute on function online_order_return(uuid, text, jsonb, boolean, numeric, text, jsonb, numeric, text, text) from public, anon;
grant  execute on function online_order_return(uuid, text, jsonb, boolean, numeric, text, jsonb, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
