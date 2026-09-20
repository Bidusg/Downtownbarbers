-- =====================================================================
-- 0048 – HURTIGSALG / DROP-IN I KASSEN (uten booking)
--
--   Lar kassen ta betalt for en walk-in UTEN å opprette booking først:
--   en behandling (tjeneste) og/eller varer over disk. Kundeinfo
--   (navn/e-post/telefon) kan fylles inn og lagres i kundekartoteket, og
--   kunden kan valgfritt legges til som «medlem» (samtykke til
--   klubb/markedsføring → goder).
--
--   Alt i én transaksjon (som record_sale, 0044): oppretter/oppdaterer
--   kunde, oppretter salg (uten booking), legger tjeneste- + produktlinjer,
--   trekker ned lager og logger. Priser hentes ALLTID server-side
--   (services/products), aldri fra klienten. Kun shop/admin.
--
--   Idempotent (create or replace). Ingen nye tabeller/kolonner.
-- =====================================================================
create or replace function record_walkin_sale(
  p_staff uuid,
  p_payment_method text,
  p_service text default null,           -- behandling (tjenestenavn), valgfri
  p_products jsonb default '[]'::jsonb,   -- [{"id": uuid, "qty": n}]
  p_customer jsonb default null,          -- {"name":..,"email":..,"phone":..}
  p_make_member boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_name text; v_email text; v_phone text;
  v_sale uuid;
  v_total numeric(10,2) := 0;
  v_service_id uuid; v_service_price numeric;
  v_item jsonb; v_prod record; v_qty int; v_new int;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  -- Det må faktisk selges noe.
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

    -- «Medlem» = samtykke til klubb/markedsføring (goder). Klubbnivå utledes
    -- automatisk av forbruk/besøk (0034).
    if p_make_member and v_customer is not null then
      update customers set marketing_consent = true, marketing_consent_at = now()
        where id = v_customer;
    end if;
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (null, p_staff, v_customer, 0,
            nullif(trim(coalesce(p_payment_method, '')), ''))
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
    v_total := v_total + coalesce(v_service_price, 0);
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
    v_total := v_total + (v_prod.price_nok * v_qty);
    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  update sales set total_nok = v_total where id = v_sale;
  return v_sale;
end $$;

grant execute on function record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean) to authenticated;
