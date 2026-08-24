-- =====================================================================
-- Robust booking-oppretting: en SECURITY DEFINER-funksjon som slår opp
-- tjeneste/barber, oppretter kunde + booking atomisk, og returnerer id.
-- Fungerer uten at anon trenger insert-policyer.
-- =====================================================================

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

  insert into customers (full_name, email, phone)
    values (p_name, p_email, p_phone)
    returning id into v_customer;

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
