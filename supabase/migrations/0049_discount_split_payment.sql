-- =====================================================================
-- 0049 – RABATT + SPLITTBETALING I KASSEN
--
--   To ting kassen manglet ved betaling av en time:
--     • Rabatt: gi et avslag i kroner på totalen (kampanje, klipp, kulanse).
--     • Splittbetaling: dele én betaling på flere måter (f.eks. 200 kontant
--       + resten kort).
--
--   Datamodell:
--     • sales.discount_nok  – rabatt i kr trukket fra brutto. total_nok blir
--       NETTO (brutto − rabatt), så alle eksisterende sum-spørringer stemmer.
--     • sale_payments       – én rad per betalingsmåte på et salg. Autoritativ
--       kilde for hva som faktisk kom inn per måte. Enkeltbetaling gir én rad,
--       delt betaling flere. Kasseoppgjøret (0046) avstemmer mot denne.
--
--   record_sale utvides med p_discount + p_payments. Den gamle 3-arg-varianten
--   DROPPES (completeBooking oppdateres i samme slipp). Summen av p_payments må
--   stemme med netto (± 1 kr for øreavrunding), ellers rulles ALT tilbake –
--   samme atomiske garanti som før (jf. 0044).
--
--   reopen_booking trenger ingen endring: sale_payments faller med cascade når
--   salget slettes, og discount_nok ligger på sales-raden.
-- =====================================================================

-- --- Rabattkolonne på salget ------------------------------------------
alter table sales
  add column if not exists discount_nok numeric(10,2) not null default 0;

-- --- Betalingslinjer (splittbetaling) ---------------------------------
create table if not exists sale_payments (
  id         uuid primary key default uuid_generate_v4(),
  sale_id    uuid not null references sales(id) on delete cascade,
  method     text not null,
  amount     numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists sale_payments_sale_idx on sale_payments(sale_id);

alter table sale_payments enable row level security;

-- Lesing: admin alt, shop lese – speiler sales. Skriving skjer kun via
-- SECURITY DEFINER-RPC-en record_sale, så ingen insert-policy trengs.
drop policy if exists sale_payments_admin_all on sale_payments;
create policy sale_payments_admin_all on sale_payments
  for all using (is_admin()) with check (is_admin());

drop policy if exists sale_payments_shop_read on sale_payments;
create policy sale_payments_shop_read on sale_payments
  for select using (is_shop_or_admin());

-- --- record_sale: rabatt + splittbetaling -----------------------------
-- Bytt ut den gamle 3-arg-varianten fullstendig.
drop function if exists record_sale(uuid, text, jsonb);

create or replace function record_sale(
  p_booking        uuid,
  p_payment_method text  default null,
  p_products       jsonb default '[]'::jsonb,
  p_discount       numeric default 0,
  p_payments       jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking  record;
  v_sale     uuid;
  v_gross    numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_net      numeric(10,2) := 0;
  v_item     jsonb;
  v_prod     record;
  v_qty      int;
  v_new      int;
  v_pay      jsonb;
  v_paysum   numeric(10,2) := 0;
  v_paycount int := 0;
  v_method   text;
  v_amount   numeric(10,2);
  v_single   text;
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
    values (p_booking, v_booking.staff_id, v_booking.customer_id, 0, null)
    returning id into v_sale;

  -- Tjenestelinje (prisen ble satt server-side da timen ble booket).
  if v_booking.service_id is not null then
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_booking.service_id, 1,
              coalesce(v_booking.price_nok, 0));
    v_gross := v_gross + coalesce(v_booking.price_nok, 0);
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
    v_gross := v_gross + (v_prod.price_nok * v_qty);

    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id
      returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  -- Rabatt: begrenses til [0, brutto]. Netto = brutto − rabatt.
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_gross);
  v_net := v_gross - v_discount;

  -- ---- Betaling ------------------------------------------------------
  -- Splittbetaling hvis p_payments er gitt: valider hver linje, summér og
  -- krev at summen matcher netto (± 1 kr for avrunding). Skriv én
  -- sale_payments-rad per linje.
  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    for v_pay in select * from jsonb_array_elements(p_payments)
    loop
      v_method := nullif(trim(coalesce(v_pay->>'method', '')), '');
      v_amount := round(coalesce((v_pay->>'amount')::numeric, 0), 2);
      if v_method is null then
        raise exception 'Betalingslinje mangler betalingsmåte';
      end if;
      if v_amount <= 0 then
        continue;  -- hopp over tomme/0-linjer
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

    -- payment_method: enkeltmåte hvis bare én linje, ellers «Delt».
    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = case when v_paycount = 1 then v_single else 'Delt' end
      where id = v_sale;

  else
    -- Enkeltbetaling: hele netto på én måte. Skriv også en sale_payments-rad
    -- (når måte er oppgitt) så kasseoppgjøret har én ensartet kilde.
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

  update bookings set status = 'completed' where id = p_booking;

  return v_sale;
end $$;

grant execute on function record_sale(uuid, text, jsonb, numeric, jsonb) to authenticated;
