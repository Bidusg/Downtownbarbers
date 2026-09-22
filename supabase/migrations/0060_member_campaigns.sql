-- =====================================================================
-- 0060 — KUNDEKLUBB: sesong-kuponger til medlemmer
--   Forutsetter 0034/0059 (membership_tiers + customer_membership med
--   sort_order), 0049 (record_sale m/ p_discount) og 0050 (record_walkin_sale
--   m/ p_discount).
--
--   Dawit kan utstede tidsavgrensede rabattkuponger til klubbmedlemmer —
--   f.eks. «−20% i august» til alle medlemmer, eller «−100 kr» kun til Gull+.
--   Kupongen VELGES i kassa på en kunde, og rabatten beregnes + valideres
--   SERVER-SIDE inne i salgs-RPC-en (aldri fra klienten), atomisk med salget:
--   feiler noe, rulles alt tilbake. Én innløsning per medlem håndheves (kan
--   slås av per kupong).
--
--   Modell:
--     • member_campaigns          – selve kupongen (type, verdi, sesong,
--                                    minste klubbnivå, engangs).
--     • member_campaign_redemptions – logg: hvem brukte hvilken kupong, når,
--                                    på hvilket salg, og hvor mye.
--
--   Sikkerhet: rabatten og gyldigheten avgjøres av apply_member_campaign
--   (security definer, kun kallbar internt fra salgs-RPC-ene). Klienten sender
--   bare hvilken kupong som er valgt (p_campaign) – aldri et kronebeløp.
--
--   Idempotent. Bakoverkompatibel: p_campaign defaulter til null → nøyaktig
--   samme salgsflyt som før.
-- =====================================================================

-- ---------- Kupong-tabell ----------
create table if not exists member_campaigns (
  id                 uuid primary key default uuid_generate_v4(),
  name               text not null,
  description        text,
  discount_type      text not null check (discount_type in ('percent', 'fixed')),
  discount_value     numeric(10,2) not null check (discount_value > 0),
  min_tier_sort_order int not null default 0,   -- medlemmets nivå-rang må være >= denne (0 = alle medlemmer)
  starts_at          date,                       -- null = ingen startgrense
  expires_at         date,                       -- null = ingen utløp
  once_per_member    boolean not null default true,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  constraint member_campaigns_percent_max
    check (discount_type <> 'percent' or discount_value <= 100)
);

-- Sperre mot prosent > 100 også på eksisterende tabell (idempotent).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'member_campaigns_percent_max'
  ) then
    alter table member_campaigns
      add constraint member_campaigns_percent_max
      check (discount_type <> 'percent' or discount_value <= 100);
  end if;
end $$;

alter table member_campaigns enable row level security;
drop policy if exists member_campaigns_admin_all on member_campaigns;
create policy member_campaigns_admin_all on member_campaigns
  for all using (is_admin()) with check (is_admin());
drop policy if exists member_campaigns_shop_read on member_campaigns;
create policy member_campaigns_shop_read on member_campaigns
  for select using (is_shop_or_admin());

-- ---------- Innløsnings-logg ----------
create table if not exists member_campaign_redemptions (
  id          uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references member_campaigns(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  sale_id     uuid references sales(id) on delete set null,
  amount_nok  numeric(10,2) not null default 0,
  redeemed_at timestamptz not null default now()
);
create index if not exists mcr_campaign_customer_idx
  on member_campaign_redemptions (campaign_id, customer_id);

alter table member_campaign_redemptions enable row level security;
-- Skriving skjer kun via SECURITY DEFINER (apply_member_campaign), så ingen
-- insert-policy. Lesing: admin alt, shop lese (rapport/oversikt).
drop policy if exists mcr_admin_all on member_campaign_redemptions;
create policy mcr_admin_all on member_campaign_redemptions
  for all using (is_admin()) with check (is_admin());
drop policy if exists mcr_shop_read on member_campaign_redemptions;
create policy mcr_shop_read on member_campaign_redemptions
  for select using (is_shop_or_admin());

-- ---------- Validér + beregn + logg kupong (intern) ----------
-- Kalles KUN fra record_sale / record_walkin_sale (begge security definer).
-- Validerer sesong, klubbnivå og engangsbruk, beregner rabatten mot brutto,
-- logger innløsningen og returnerer rabatten i kr. Feiler noe, kastes en
-- feil som ruller hele salget tilbake. Ikke grantet til klienter.
create or replace function apply_member_campaign(
  p_sale     uuid,
  p_customer uuid,
  p_campaign uuid,
  p_gross    numeric
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_c    member_campaigns;
  v_sort int;
  v_disc numeric(10,2);
begin
  select * into v_c from member_campaigns where id = p_campaign for update;
  if not found or not v_c.active then
    raise exception 'Fant ikke kupongen';
  end if;
  if v_c.starts_at is not null and v_c.starts_at > current_date then
    raise exception 'Kupongen har ikke startet enda';
  end if;
  if v_c.expires_at is not null and v_c.expires_at < current_date then
    raise exception 'Kupongen er utløpt';
  end if;
  if p_customer is null then
    raise exception 'Kupongen krever en registrert kunde';
  end if;

  -- Klubbnivå: medlemmets nivå-rang må være minst kupongens terskel.
  select mt.sort_order into v_sort
    from customer_membership(p_customer) cm
    join membership_tiers mt on mt.id = cm.tier_id;
  if coalesce(v_sort, -1) < v_c.min_tier_sort_order then
    raise exception 'Kupongen gjelder et høyere klubbnivå';
  end if;

  -- Engangsbruk per medlem (kan slås av på kupongen).
  if v_c.once_per_member and exists (
    select 1 from member_campaign_redemptions r
    where r.campaign_id = v_c.id and r.customer_id = p_customer
  ) then
    raise exception 'Kupongen er allerede brukt';
  end if;

  -- Rabatt: prosent av brutto, eller fast kronebeløp. Begrenses til [0, brutto].
  if v_c.discount_type = 'percent' then
    v_disc := round(p_gross * v_c.discount_value / 100.0, 2);
  else
    v_disc := v_c.discount_value;
  end if;
  v_disc := least(greatest(coalesce(v_disc, 0), 0), p_gross);

  -- Ikke «brenn» en engangskupong når det ikke er noe å trekke fra (brutto 0).
  if v_disc <= 0 then
    return 0;
  end if;

  insert into member_campaign_redemptions (campaign_id, customer_id, sale_id, amount_nok)
    values (v_c.id, p_customer, p_sale, v_disc);

  return v_disc;
end $$;

revoke all on function apply_member_campaign(uuid, uuid, uuid, numeric) from public;

-- ---------- Kupong-tilbud for en kunde (til kassa-UI) ----------
-- Returnerer aktive, gyldige kuponger kunden kan bruke nå: innenfor sesong,
-- riktig klubbnivå, og ikke allerede brukt (om engangs). Kun ikke-sensitiv
-- kupong-info for én kunde-id. Kassa bruker denne til å vise valgbare kuponger.
create or replace function member_campaign_offers(p_customer uuid)
returns table (
  id             uuid,
  name           text,
  description    text,
  discount_type  text,
  discount_value numeric,
  expires_at     date
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.description, c.discount_type, c.discount_value, c.expires_at
  from member_campaigns c
  where c.active
    and (c.starts_at is null or c.starts_at <= current_date)
    and (c.expires_at is null or c.expires_at >= current_date)
    and c.min_tier_sort_order <= coalesce((
      select mt.sort_order
        from customer_membership(p_customer) cm
        join membership_tiers mt on mt.id = cm.tier_id
    ), -1)
    and (
      not c.once_per_member
      or not exists (
        select 1 from member_campaign_redemptions r
        where r.campaign_id = c.id and r.customer_id = p_customer
      )
    )
  order by c.discount_value desc, c.name;
$$;
grant execute on function member_campaign_offers(uuid) to authenticated;

-- ---------- record_sale: valgfri medlems-kupong (p_campaign) ----------
-- Identisk med 0049, men med p_campaign: er den satt, beregnes kupong-rabatten
-- server-side og legges til p_discount før klemmingen til [0, brutto].
drop function if exists record_sale(uuid, text, jsonb, numeric, jsonb);
drop function if exists record_sale(uuid, text, jsonb, numeric, jsonb, uuid);

create or replace function record_sale(
  p_booking        uuid,
  p_payment_method text    default null,
  p_products       jsonb   default '[]'::jsonb,
  p_discount       numeric default 0,
  p_payments       jsonb   default null,
  p_campaign       uuid    default null
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

  update bookings set status = 'completed' where id = p_booking;

  return v_sale;
end $$;

grant execute on function record_sale(uuid, text, jsonb, numeric, jsonb, uuid) to authenticated;

-- ---------- record_walkin_sale: valgfri medlems-kupong (p_campaign) ----------
drop function if exists record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean, numeric, jsonb);
drop function if exists record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean, numeric, jsonb, uuid);

create or replace function record_walkin_sale(
  p_staff          uuid,
  p_payment_method text,
  p_service        text    default null,
  p_products       jsonb   default '[]'::jsonb,
  p_customer       jsonb   default null,
  p_make_member    boolean default false,
  p_discount       numeric default 0,
  p_payments       jsonb   default null,
  p_campaign       uuid    default null
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

  -- Medlems-kupong (valgfri): beregnes + valideres + logges server-side.
  if p_campaign is not null then
    v_campaign_disc := apply_member_campaign(v_sale, v_customer, p_campaign, v_gross);
  end if;

  -- Rabatt: manuell + kupong, begrenset til [0, brutto]. Netto = brutto − rabatt.
  v_discount := least(greatest(coalesce(p_discount, 0), 0) + v_campaign_disc, v_gross);
  v_net := v_gross - v_discount;

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

grant execute on function record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean, numeric, jsonb, uuid) to authenticated;
