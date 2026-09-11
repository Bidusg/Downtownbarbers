-- =====================================================================
-- 0020 – KUNDEKILDE ("Hvordan hørte du om oss?")
--   Grunnlag for anbefaling-/kilde-KPI: hvor nye kunder kommer fra
--   (munn-til-munn, Google, Instagram, annet). Settes ved booking og
--   holdes som første-berøring (overskrives ikke på senere besøk).
-- Idempotent.
-- =====================================================================

alter table customers add column if not exists source text;

-- create_booking utvides med p_source (bakoverkompatibel: default null).
drop function if exists create_booking(text, text, timestamptz, text, text, text);
create or replace function create_booking(
  p_service text,
  p_barber text,
  p_start timestamptz,
  p_name text,
  p_email text,
  p_phone text,
  p_source text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_service uuid; v_price numeric; v_dur int;
  v_staff uuid; v_customer uuid; v_booking uuid;
  v_source text := nullif(trim(p_source), '');
begin
  select id, price_nok, duration_min into v_service, v_price, v_dur
    from services where name = p_service limit 1;
  select id into v_staff from staff where full_name = p_barber limit 1;

  -- Finn eksisterende kunde: først e-post, ellers telefon (uten mellomrom).
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
    insert into customers (full_name, email, phone, source)
      values (p_name, p_email, p_phone, v_source)
      returning id into v_customer;
  else
    -- Oppdater kontaktinfo; kilde settes kun hvis den mangler (første berøring).
    update customers set
      full_name = coalesce(nullif(trim(p_name), ''),  full_name),
      phone     = coalesce(nullif(trim(p_phone), ''), phone),
      email     = coalesce(nullif(trim(p_email), ''), email),
      source    = coalesce(source, v_source)
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

grant execute on function create_booking(text, text, timestamptz, text, text, text, text)
  to anon, authenticated;
