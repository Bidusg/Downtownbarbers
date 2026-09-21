-- =====================================================================
-- 0050 – RABATT + SPLITTBETALING I HURTIGSALG (drop-in)
--
--   Speiler 0049 (record_sale) for hurtigsalg uten booking: rabatt i kr og
--   splittbetaling over flere måter. Samme datamodell – rabatt trekkes fra
--   brutto (total_nok = netto), og hver betaling skrives som en rad i
--   sale_payments (også ved enkeltbetaling), så kasseoppgjøret avstemmer
--   likt uansett hvor salget kom fra.
--
--   Den gamle 6-arg-varianten DROPPES; recordWalkinSale oppdateres i samme
--   slipp. Sum av p_payments må matche netto (± 1 kr), ellers rulles ALT
--   tilbake.
--
--   Forutsetter 0049 (sale_payments + sales.discount_nok finnes).
-- =====================================================================
drop function if exists record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean);

create or replace function record_walkin_sale(
  p_staff          uuid,
  p_payment_method text,
  p_service        text default null,
  p_products       jsonb default '[]'::jsonb,
  p_customer       jsonb default null,
  p_make_member    boolean default false,
  p_discount       numeric default 0,
  p_payments       jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_name text; v_email text; v_phone text;
  v_sale uuid;
  v_gross    numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_net      numeric(10,2) := 0;
  v_service_id uuid; v_service_price numeric;
  v_item jsonb; v_prod record; v_qty int; v_new int;
  v_pay jsonb; v_paysum numeric(10,2) := 0; v_paycount int := 0;
  v_method text; v_amount numeric(10,2); v_single text;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  if (p_service is null or trim(p_service) = '')
     and coalesce(jsonb_array_length(p_products), 0) = 0 then
    raise exception 'Ingenting å selge – velg behandling eller vare.';
  end if;

  -- Kunde (valgfri): match e-post, ellers telefon, ellers opprett ny.
  if p_customer is not null then
    v_name  := nullif(trim(p_customer->>'name'), '');
    v_email := nullif(trim(p_customer->>'email'), '');
    v_phone := nullif(trim(p_customer->>'phone'), '');

    if v_email is not null then
      select id into v_customer from customers
        where lower(trim(email)) = lower(v_email) limit 1;
    end if;
    if v_customer is null and v_phone is not null then
      select id into v_customer from customers
        where regexp_replace(coalesce(phone, ''), '\s', '', 'g')
            = regexp_replace(v_phone, '\s', '', 'g') limit 1;
    end if;

    if v_customer is null and (v_name is not null or v_email is not null or v_phone is not null) then
      insert into customers (full_name, email, phone, source)
        values (coalesce(v_name, 'Drop-in'), v_email, v_phone, 'Drop-in kasse')
        returning id into v_customer;
    elsif v_customer is not null then
      update customers set
        full_name = coalesce(v_name, full_name),
        email     = coalesce(v_email, email),
        phone     = coalesce(v_phone, phone)
      where id = v_customer;
    end if;

    if p_make_member and v_customer is not null then
      update customers set marketing_consent = true, marketing_consent_at = now()
        where id = v_customer;
    end if;
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (null, p_staff, v_customer, 0, null)
    returning id into v_sale;

  -- Behandling (tjeneste) – pris server-side.
  if p_service is not null and trim(p_service) <> '' then
    select id, price_nok into v_service_id, v_service_price
      from services where name = p_service and active = true limit 1;
    if v_service_id is null then
      raise exception 'Fant ikke behandlingen';
    end if;
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_service_id, 1, coalesce(v_service_price, 0));
    v_gross := v_gross + coalesce(v_service_price, 0);
  end if;

  -- Varer – pris fra products, lager ned + logg.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select id, name, price_nok into v_prod
      from products where id = (v_item->>'id')::uuid and active = true
      for update;
    if not found then
      raise exception 'Fant ikke produktet';
    end if;
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'product', v_prod.id, v_prod.name, v_qty, v_prod.price_nok);
    v_gross := v_gross + (v_prod.price_nok * v_qty);
    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  -- Rabatt: begrenses til [0, brutto]. Netto = brutto − rabatt.
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_gross);
  v_net := v_gross - v_discount;

  -- Betaling: splittbetaling hvis p_payments er gitt, ellers enkeltbetaling.
  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    for v_pay in select * from jsonb_array_elements(p_payments)
    loop
      v_method := nullif(trim(coalesce(v_pay->>'method', '')), '');
      v_amount := round(coalesce((v_pay->>'amount')::numeric, 0), 2);
      if v_method is null then
        raise exception 'Betalingslinje mangler betalingsmåte';
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

    if v_paycount = 0 then
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
    v_single := nullif(trim(coalesce(p_payment_method, '')), '');
    if v_single is not null and v_net > 0 then
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_single, v_net);
    end if;
    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = v_single
      where id = v_sale;
  end if;

  return v_sale;
end $$;

grant execute on function record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean, numeric, jsonb) to authenticated;
