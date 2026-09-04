-- =====================================================================
-- 0014 – KUNDEKARTOTEK (CRM)
--   1) Slår sammen duplikate kunder (samme e-post) til én kanonisk kunde,
--      slik at historikk/besøk samles per person.
--   2) Hindrer nye duplikater (unik indeks på normalisert e-post).
--   3) create_booking gjenbruker eksisterende kunde i stedet for å lage ny
--      hver gang (matcher på e-post, ellers telefon).
-- Idempotent: trygg å kjøre flere ganger.
-- =====================================================================

-- ---------- 1) Slå sammen eksisterende duplikater på e-post ----------
do $$
declare
  r record;
  v_canon uuid;
begin
  for r in
    select lower(trim(email)) as key
    from customers
    where email is not null and trim(email) <> ''
    group by lower(trim(email))
    having count(*) > 1
  loop
    -- Eldste kunde blir den kanoniske (beholder først-registrert-dato).
    select id into v_canon
    from customers
    where lower(trim(email)) = r.key
    order by created_at asc
    limit 1;

    -- Repek alle referanser fra duplikatene til den kanoniske kunden.
    update bookings       set customer_id  = v_canon
      where customer_id in (select id from customers where lower(trim(email)) = r.key and id <> v_canon);
    update ratings        set customer_id  = v_canon
      where customer_id in (select id from customers where lower(trim(email)) = r.key and id <> v_canon);
    update sales          set customer_id  = v_canon
      where customer_id in (select id from customers where lower(trim(email)) = r.key and id <> v_canon);
    update product_orders set customer_id  = v_canon
      where customer_id in (select id from customers where lower(trim(email)) = r.key and id <> v_canon);
    update gift_cards     set purchased_by = v_canon
      where purchased_by in (select id from customers where lower(trim(email)) = r.key and id <> v_canon);

    -- Fyll evt. manglende felt på den kanoniske fra et duplikat.
    update customers c set
      full_name = coalesce(nullif(trim(c.full_name), ''), d.full_name),
      phone     = coalesce(nullif(trim(c.phone), ''),     d.phone),
      notes     = coalesce(nullif(trim(c.notes), ''),     d.notes)
    from (
      select full_name, phone, notes
      from customers
      where lower(trim(email)) = r.key and id <> v_canon
      order by created_at asc
      limit 1
    ) d
    where c.id = v_canon;

    -- Slett duplikatene.
    delete from customers where lower(trim(email)) = r.key and id <> v_canon;
  end loop;
end $$;

-- ---------- 2) Hindre nye e-post-duplikater ----------
create unique index if not exists uq_customers_email_ci
  on customers (lower(trim(email)))
  where email is not null and trim(email) <> '';

-- ---------- 3) create_booking gjenbruker eksisterende kunde ----------
create or replace function create_booking(
  p_service text,
  p_barber text,
  p_start timestamptz,
  p_name text,
  p_email text,
  p_phone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_service uuid; v_price numeric; v_dur int;
  v_staff uuid; v_customer uuid; v_booking uuid;
begin
  select id, price_nok, duration_min into v_service, v_price, v_dur
    from services where name = p_service limit 1;
  select id into v_staff from staff where full_name = p_barber limit 1;

  -- Finn eksisterende kunde: først på e-post, ellers på telefon (uten mellomrom).
  if p_email is not null and trim(p_email) <> '' then
    select id into v_customer from customers
      where lower(trim(email)) = lower(trim(p_email))
      limit 1;
  end if;
  if v_customer is null and p_phone is not null and trim(p_phone) <> '' then
    select id into v_customer from customers
      where regexp_replace(coalesce(phone, ''), '\s', '', 'g') = regexp_replace(p_phone, '\s', '', 'g')
      limit 1;
  end if;

  if v_customer is null then
    insert into customers (full_name, email, phone)
      values (p_name, p_email, p_phone)
      returning id into v_customer;
  else
    -- Oppdater med ferskeste kontaktinfo (uten å slette eksisterende).
    update customers set
      full_name = coalesce(nullif(trim(p_name), ''),  full_name),
      phone     = coalesce(nullif(trim(p_phone), ''), phone),
      email     = coalesce(nullif(trim(p_email), ''), email)
    where id = v_customer;
  end if;

  insert into bookings (customer_id, staff_id, service_id, start_at, end_at, status, price_nok)
    values (
      v_customer, v_staff, v_service, p_start,
      p_start + make_interval(mins => coalesce(v_dur, 30)),
      'confirmed', coalesce(v_price, 0)
    )
    returning id into v_booking;

  return v_booking;
end $$;

grant execute on function create_booking(text, text, timestamptz, text, text, text)
  to anon, authenticated;
