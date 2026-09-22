-- =====================================================================
-- 0061 — DRA-FOR-LENGDE: endre en bookings varighet fra kalenderen
--   Forutsetter 0052 (is_shop_or_admin dekker eier).
--
--   Kassa/shop kan dra i nederkanten av en booking for å forlenge/forkorte
--   den. Selve endringen går via denne security-definer-RPC-en (shop kan ikke
--   oppdatere bookings direkte – speiler reschedule_booking): starttiden
--   beholdes, kun end_at endres. Serveren håndhever:
--     • kun aktive timer (ikke fullført / ikke-møtt / kansellert),
--     • minst 5 minutter,
--     • ingen overlapp med en annen aktiv booking/blokk for samme barber.
--
--   Idempotent (create or replace). Ingen nye tabeller/kolonner.
-- =====================================================================

create or replace function set_booking_length(p_booking uuid, p_end timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_b       record;
  v_min_end timestamptz;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  select id, staff_id, start_at, status
    into v_b
    from bookings
    where id = p_booking
    for update;
  if not found then
    raise exception 'Fant ikke timen';
  end if;

  if v_b.status in ('completed', 'no_show', 'cancelled') then
    raise exception 'Kan ikke endre lengde på en fullført eller kansellert time';
  end if;

  if p_end <= v_b.start_at then
    raise exception 'Sluttid må være etter starttid';
  end if;

  -- Minst 5 minutter.
  v_min_end := v_b.start_at + interval '5 minutes';
  if p_end < v_min_end then
    p_end := v_min_end;
  end if;

  -- Ingen overlapp med en annen aktiv booking/blokk for samme barber.
  if v_b.staff_id is not null and exists (
    select 1
      from bookings o
      where o.staff_id = v_b.staff_id
        and o.id <> v_b.id
        and o.status <> 'cancelled'
        and o.start_at < p_end
        and o.end_at   > v_b.start_at
  ) then
    raise exception 'Den nye lengden overlapper en annen booking';
  end if;

  update bookings set end_at = p_end where id = v_b.id;
end $$;

grant execute on function set_booking_length(uuid, timestamptz) to authenticated;
