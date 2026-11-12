-- =====================================================================
-- KONTAKTINFO-VERN – kritisk sikkerhetsrettelse (QA november 2026)
--
-- Problem: create_booking (kan kalles anonymt fra nettbookingen) fant en
-- eksisterende kunde på e-post eller telefon og OVERSKREV kundens telefon,
-- e-post og navn med det som ble skrevet i bookingskjemaet. Siden
-- innloggingskoden til Min side også sendes på SMS til telefonen som står
-- på kunden, kunne hvem som helst booke med en annens e-post + sitt eget
-- nummer, og deretter logge inn på den andres Min side.
--
-- Rettelse: ved treff på eksisterende kunde endres telefon og e-post aldri
-- (heller ikke tomme felt), og navn fylles bare inn hvis det mangler.
-- Kunden endrer kontaktinfo selv i Min side (etter innlogging), eller
-- salongen i admin.
--
-- Trygg å kjøre flere ganger (create or replace). Ingen data endres.
-- =====================================================================

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
  v_staff uuid; v_level uuid; v_customer uuid; v_booking uuid;
  v_source text := nullif(trim(p_source), '');
begin
  select id, price_nok, duration_min into v_service, v_price, v_dur
    from services where name = p_service limit 1;
  select id, level_id into v_staff, v_level from staff where full_name = p_barber limit 1;

  -- Nivåpris hvis barber har nivå + nivåpris finnes; ellers basispris.
  if v_service is not null and v_level is not null then
    v_price := effective_service_price(v_service, v_level);
  end if;

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
    -- VERN: e-post og telefon på en eksisterende kunde røres ALDRI av en
    -- anonym booking – heller ikke når feltet er tomt (ellers kunne noen
    -- legge inn sitt eget nummer/e-post og få innloggingskoden). Bare tomt
    -- navn fylles inn.
    update customers set
      full_name = coalesce(nullif(trim(full_name), ''), nullif(trim(p_name), '')),
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

-- Bookingen må fortsatt kunne kalles fra nettsiden (anon) – uendret tilgang.
revoke all on function create_booking(text, text, timestamptz, text, text, text, text) from public;
grant execute on function create_booking(text, text, timestamptz, text, text, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
