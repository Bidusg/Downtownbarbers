-- =====================================================================
-- Offentlig rating: en SECURITY DEFINER-funksjon lar en ikke-innlogget
-- kunde vurdere sitt besøk. Funksjonen slår opp bookingens barber/kunde
-- og setter inn ratingen trygt (uten å åpne hele ratings-tabellen).
-- =====================================================================

create or replace function rate_booking(
  p_booking uuid,
  p_stars int,
  p_comment text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid;
  v_customer uuid;
begin
  if p_stars < 1 or p_stars > 5 then
    raise exception 'stars must be 1..5';
  end if;
  select staff_id, customer_id into v_staff, v_customer
  from bookings where id = p_booking;
  insert into ratings (booking_id, staff_id, customer_id, stars, comment)
  values (p_booking, v_staff, v_customer, p_stars, nullif(p_comment, ''));
end $$;

grant execute on function rate_booking(uuid, int, text) to anon, authenticated;
