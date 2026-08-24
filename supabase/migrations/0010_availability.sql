-- =====================================================================
-- Ekte tilgjengelighet + sikret betalingsbeløp (server-side).
-- available_slots: ledige starttider for barber+tjeneste+dato.
--   - Man–lør 09:00–19:00, søndag stengt
--   - tar hensyn til tjenestens varighet
--   - sperrer fortid
--   - fjerner tider som overlapper eksisterende bookinger for barberen
-- booking_amount_ore: prisen for en booking i øre (for Vipps).
-- =====================================================================

create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_open time := '09:00'; v_close time := '19:00'; v_step interval := '15 minutes';
  v_dow int; slot time; slot_start timestamptz; slot_end timestamptz;
  res text[] := '{}';
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);   -- 0 = søndag
  if v_dow = 0 then return res; end if;

  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
    slot_start := (p_date + slot) at time zone 'Europe/Oslo';
    slot_end := slot_start + make_interval(mins => v_dur);
    if slot_start > now() then
      if not exists (
        select 1 from bookings b
        where b.staff_id = v_staff
          and b.status in ('pending','confirmed','completed')
          and b.start_at < slot_end and b.end_at > slot_start
      ) then
        res := res || to_char(slot, 'HH24:MI');
      end if;
    end if;
    slot := slot + v_step;
  end loop;
  return res;
end $$;
grant execute on function available_slots(text, text, date) to anon, authenticated;

create or replace function booking_amount_ore(p_booking uuid)
returns int
language sql security definer set search_path = public as $$
  select coalesce(round(price_nok * 100)::int, 0) from bookings where id = p_booking;
$$;
grant execute on function booking_amount_ore(uuid) to anon, authenticated;
