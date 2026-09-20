-- =====================================================================
-- 0044 – ATOMISK SALGSREGISTRERING I KASSEN (+ angre)
--
--   Bakgrunn: completeBooking gjorde flere separate skriv (status,
--   sales, sale_items) uten å sjekke feil. Feilet én (nett/RLS), kunne
--   bookingen bli markert "completed" UTEN at salget ble registrert –
--   salget så fullført ut, men var borte. Se live-test 19. sept.
--
--   record_sale gjør ALT i én transaksjon:
--     1) låser bookingen (hindrer dobbelt-salg ved dobbelttrykk/retry),
--     2) oppretter ÉN sale,
--     3) legger tjenestelinjen (pris fra bookingen – satt server-side),
--     4) legger evt. produktlinjer (pris hentet fra products – ALDRI
--        fra klienten) og trekker ned lager + logger bevegelsen,
--     5) setter total og markerer bookingen fullført.
--   Feiler noe som helst, rulles ALT tilbake. Kun shop/admin.
--
--   reopen_booking angrer en fullført/ikke-møtt time: sletter salget
--   (cascade tar sale_items), tilbakefører produktlager og logger
--   reverseringen, og setter bookingen tilbake til "confirmed".
--
--   Idempotent (create or replace). Ingen nye tabeller/kolonner.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Registrer salg atomisk. p_products: jsonb-array [{"id": uuid, "qty": n}]
-- Returnerer sale-id.
-- ---------------------------------------------------------------------
create or replace function record_sale(
  p_booking uuid,
  p_payment_method text default null,
  p_products jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_sale    uuid;
  v_total   numeric(10,2) := 0;
  v_item    jsonb;
  v_prod    record;
  v_qty     int;
  v_new     int;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  -- Lås bookingen: samtidige kall serialiseres, så et dobbelttrykk ikke
  -- kan lage to salg for samme time.
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
    values (p_booking, v_booking.staff_id, v_booking.customer_id, 0,
            nullif(trim(coalesce(p_payment_method, '')), ''))
    returning id into v_sale;

  -- Tjenestelinje (prisen ble satt server-side da timen ble booket).
  if v_booking.service_id is not null then
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_booking.service_id, 1,
              coalesce(v_booking.price_nok, 0));
    v_total := v_total + coalesce(v_booking.price_nok, 0);
  end if;

  -- Produktlinjer – pris hentes fra products, aldri fra klienten.
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
    v_total := v_total + (v_prod.price_nok * v_qty);

    -- Trekk ned lager (aldri under 0) + logg bevegelsen.
    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id
      returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  update sales set total_nok = v_total where id = v_sale;
  update bookings set status = 'completed' where id = p_booking;

  return v_sale;
end $$;

grant execute on function record_sale(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Angre en fullført / ikke-møtt time. Sletter salget (sale_items faller
-- med cascade), tilbakefører produktlager, og setter status = confirmed.
-- ---------------------------------------------------------------------
create or replace function reopen_booking(p_booking uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sale record;
  v_agg  record;
  v_new  int;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  for v_sale in select id from sales where booking_id = p_booking loop
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

    delete from sales where id = v_sale.id;
  end loop;

  update bookings set status = 'confirmed' where id = p_booking;
end $$;

grant execute on function reopen_booking(uuid) to authenticated;
