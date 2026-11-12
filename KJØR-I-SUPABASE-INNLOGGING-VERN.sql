-- =====================================================================
-- INNLOGGING-VERN
--  1) consume_login_attempt: atomisk teller for feil kode (ingen
--     les-så-skriv-race som lot en angriper gjette mer enn 5 ganger).
--  2) rate_booking: en vurdering kan bare gis for en gjennomført
--     (completed) booking, maks én vurdering per booking (ny innsending
--     oppdaterer den gamle) og kommentaren kuttes til 1000 tegn.
--
-- Idempotent. Koden faller tilbake til gammel logikk hvis denne ikke er kjørt.
-- =====================================================================

-- 1) Atomisk forsøksteller. Returnerer nytt antall forsøk, eller NULL hvis
--    koden allerede er brukt opp (attempts >= 5) / ikke finnes.
create or replace function consume_login_attempt(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
begin
  update customer_login_codes
     set attempts = attempts + 1
   where id = p_id and attempts < 5
  returning attempts into v_attempts;
  return v_attempts;
end $$;

revoke execute on function consume_login_attempt(uuid) from public, anon, authenticated;
grant execute on function consume_login_attempt(uuid) to service_role;

-- 2) rate_booking med kontroller.
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
  v_status text;
  v_found boolean;
  v_comment text;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'stars must be 1..5';
  end if;
  select staff_id, customer_id, status::text, true
    into v_staff, v_customer, v_status, v_found
  from bookings where id = p_booking;
  if v_found is not true then
    raise exception 'booking_not_found';
  end if;
  if v_status <> 'completed' then
    raise exception 'booking_not_completed';
  end if;
  v_comment := nullif(left(coalesce(p_comment, ''), 1000), '');

  -- Én vurdering per booking: finnes den, oppdater den.
  update ratings
     set stars = p_stars, comment = v_comment
   where id = (
     select id from ratings where booking_id = p_booking
     order by created_at desc limit 1
   );
  if not found then
    insert into ratings (booking_id, staff_id, customer_id, stars, comment)
    values (p_booking, v_staff, v_customer, p_stars, v_comment);
  end if;
end $$;

grant execute on function rate_booking(uuid, int, text) to anon, authenticated;

notify pgrst, 'reload schema';
