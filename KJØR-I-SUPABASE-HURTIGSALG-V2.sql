-- =====================================================================
-- KJØR-I-SUPABASE-HURTIGSALG-V2.sql
--   Hurtigsalg v2: FLERE behandlingslinjer (behandling + tillegg) i ett salg,
--   og GAVEKORT som betalingsmåte direkte i hurtigsalget.
--
--   ADDITIV og trygg:
--   • Ny funksjon record_walkin_sale_v2 – den gamle record_walkin_sale
--     beholdes urørt (bakoverkompatibel).
--   • Samme regler som før for kunde, rabatt, kupong, splitt og lager.
--   • Gavekort trekkes atomisk i samme transaksjon som salget (ingen
--     halvveis-innløsning): finnes ikke kortet / utløpt / tomt → hele
--     salget rulles tilbake med en lesbar feilmelding.
--   • Gavekort-trekket logges som sale_payments-rad med method = 'Gavekort',
--     så kasseoppgjør/«per betalingsmåte» viser det riktig, og som en rad i
--     ny tabell gift_card_redemptions (hvilket kort, hvilket salg, beløp).
--
--   Idempotent (create or replace / if not exists).
-- =====================================================================

-- Logg over innløsninger (sporbarhet per kort). Ny tabell, rører ingenting.
create table if not exists gift_card_redemptions (
  id           uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references gift_cards(id) on delete cascade,
  sale_id      uuid references sales(id) on delete set null,
  amount_nok   numeric(10,2) not null,
  created_at   timestamptz not null default now()
);
create index if not exists gift_card_redemptions_card_idx on gift_card_redemptions(gift_card_id);
alter table gift_card_redemptions enable row level security;
drop policy if exists gift_card_redemptions_admin_all on gift_card_redemptions;
create policy gift_card_redemptions_admin_all on gift_card_redemptions
  for all using (is_admin()) with check (is_admin());

-- Ekstra sikring mot dobbel-trekk: saldo kan aldri bli negativ.
alter table gift_cards drop constraint if exists gift_cards_balance_nonneg;
alter table gift_cards add constraint gift_cards_balance_nonneg check (balance_nok >= 0);

create or replace function record_walkin_sale_v2(
  p_staff          uuid,
  p_payment_method text,
  p_services       jsonb   default '[]'::jsonb,   -- ["Herreklipp 30'", "Hårvask", …]
  p_products       jsonb   default '[]'::jsonb,   -- [{id, qty}]
  p_customer       jsonb   default null,          -- {name, email, phone}
  p_make_member    boolean default false,
  p_discount       numeric default 0,
  p_payments       jsonb   default null,          -- [{method, amount}] (splitt, UTEN gavekort)
  p_campaign       uuid    default null,
  p_gift_code      text    default null,          -- gavekort-kode/strekkode
  p_gift_amount    numeric default null           -- ønsket trekk; null = så mye som mulig
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_name text; v_email text; v_phone text;
  v_sale uuid;
  v_gross    numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_campaign_disc numeric(10,2) := 0;
  v_net      numeric(10,2) := 0;
  v_svc text; v_service_id uuid; v_service_price numeric; v_svc_count int := 0;
  v_item jsonb; v_prod record; v_qty int; v_new int;
  v_pay jsonb; v_paysum numeric(10,2) := 0; v_paycount int := 0;
  v_method text; v_amount numeric(10,2); v_single text;
  v_gift_id uuid; v_gift_balance numeric(10,2); v_gift_expired boolean;
  v_gift_take numeric(10,2) := 0;
  v_rest numeric(10,2);
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  if coalesce(jsonb_array_length(p_services), 0) = 0
     and coalesce(jsonb_array_length(p_products), 0) = 0 then
    raise exception 'Ingenting å selge – velg behandling eller vare.';
  end if;

  -- ---------- Kunde (samme logikk som v1) ----------
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

  -- ---------- Behandlingslinjer (én eller flere) ----------
  for v_svc in
    select trim(value #>> '{}') from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    if v_svc is null or v_svc = '' then
      continue;
    end if;
    select id, price_nok into v_service_id, v_service_price
      from services where name = v_svc and active = true limit 1;
    if v_service_id is null then
      raise exception 'Fant ikke behandlingen «%»', v_svc;
    end if;
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'service', v_service_id, v_svc, 1, coalesce(v_service_price, 0));
    v_gross := v_gross + coalesce(v_service_price, 0);
    v_svc_count := v_svc_count + 1;
  end loop;

  -- ---------- Varer (som v1) ----------
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

  if v_svc_count = 0 and coalesce(jsonb_array_length(p_products), 0) = 0 then
    raise exception 'Ingenting å selge – velg behandling eller vare.';
  end if;

  -- ---------- Rabatt / kupong (som v1) ----------
  if p_campaign is not null then
    v_campaign_disc := apply_member_campaign(v_sale, v_customer, p_campaign, v_gross);
  end if;
  v_discount := least(greatest(coalesce(p_discount, 0), 0) + v_campaign_disc, v_gross);
  v_net := v_gross - v_discount;

  -- ---------- Gavekort (valgfritt) ----------
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

    -- Trekk = minste av (ønsket beløp | hele resten), saldo og det som skal betales.
    v_gift_take := least(
      coalesce(round(p_gift_amount, 2), v_net),
      v_gift_balance,
      v_net
    );
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

  v_rest := v_net - v_gift_take;   -- det som gjenstår etter gavekortet

  -- ---------- Øvrig betaling (splitt eller enkel) ----------
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

    if v_paycount = 0 then
      raise exception 'Ingen gyldige betalingslinjer';
    end if;
    if abs(v_paysum - v_net) > 1 then
      raise exception 'Betaling (% kr) stemmer ikke med totalen (% kr)',
        round(v_paysum), round(v_net);
    end if;
  else
    if v_rest > 0 then
      v_method := nullif(trim(coalesce(p_payment_method, '')), '');
      if v_method is null then
        raise exception 'Velg betalingsmåte for resten (% kr)', round(v_rest);
      end if;
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_method, v_rest);
      v_paysum := v_paysum + v_rest;
      v_paycount := v_paycount + 1;
      v_single := v_method;
    end if;
  end if;

  update sales
    set total_nok = v_net,
        discount_nok = v_discount,
        payment_method = case
          when v_paycount <= 1 then v_single
          else 'Delt'
        end
    where id = v_sale;

  return v_sale;
end $$;

grant execute on function record_walkin_sale_v2(
  uuid, text, jsonb, jsonb, jsonb, boolean, numeric, jsonb, uuid, text, numeric
) to authenticated;

-- Kontroll (valgfri):
-- select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname like 'record_walkin_sale%';
