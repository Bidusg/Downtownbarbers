-- =====================================================================
-- Gavekort som betaling når en TIME fullføres i kassa
--
-- Før: gavekort kunne bare brukes i hurtigsalg. Ved betaling av en time
-- måtte saldoen trekkes manuelt i admin → Gavekort, uten kobling til salget
-- (pengesporet og regnskapet manglet linjen).
-- Nå: record_sale tar imot gavekort-kode + beløp. Trekket skjer i samme
-- transaksjon som salget, logges i gift_card_redemptions og som en
-- betalingslinje «Gavekort» (føres mot 2900 Forskudd fra kunder i Tripletex).
-- Resten betales med kontant/kort/Vipps eller delt betaling.
--
-- Krever KJØR-I-SUPABASE-HURTIGSALG-V2.sql (tabellen gift_card_redemptions).
-- Trygt å kjøre flere ganger.
-- =====================================================================

-- Gammel versjon uten gavekort fjernes, så det bare finnes én record_sale
-- (ellers vet ikke databasen hvilken den skal velge).
drop function if exists record_sale(uuid, text, jsonb, numeric, jsonb, uuid);

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

notify pgrst, 'reload schema';
