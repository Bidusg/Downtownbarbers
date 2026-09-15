-- =====================================================================
-- 0026 — Åpningstider styrer booking
--   Én strukturert kilde (per ukedag) som BÅDE forsiden OG
--   booking-tilgjengeligheten leser fra. Når Dawit endrer åpningstidene i
--   /admin/nettside, endres derfor både visning og hva kunder kan booke.
--   dow: 0=søndag … 6=lørdag. Verdi = {open,close} eller null (stengt).
--   Default = dagens oppførsel (09–21 man–lør, søn stengt) → ingenting
--   endres før Dawit faktisk redigerer.
-- Idempotent.
-- =====================================================================

alter table site_settings
  add column if not exists hours jsonb not null default '{
    "1": {"open": "09:00", "close": "21:00"},
    "2": {"open": "09:00", "close": "21:00"},
    "3": {"open": "09:00", "close": "21:00"},
    "4": {"open": "09:00", "close": "21:00"},
    "5": {"open": "09:00", "close": "21:00"},
    "6": {"open": "09:00", "close": "21:00"},
    "0": null
  }'::jsonb;

-- Salongens åpningstid for en ukedag (ingen rad = stengt).
create or replace function salon_hours(p_dow int)
returns table (open_t time, close_t time)
language sql
stable
security definer
set search_path = public
as $$
  select (h->>'open')::time, (h->>'close')::time
  from site_settings s,
       lateral (select s.hours -> p_dow::text as h) x
  where s.id = 1 and jsonb_typeof(h) = 'object';
$$;
grant execute on function salon_hours(int) to anon, authenticated;

-- Booking-tilgjengelighet: turnus ∩ salongens åpningstid, stengt dag = ingen tider.
create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time; v_close time;
  slot time; slot_start timestamptz; slot_end timestamptz;
  res text[] := '{}';
  r record;
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);

  -- Salongens åpningstid denne dagen (stengt → ingen tider).
  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff) into v_has_turnus;

  if v_has_turnus then
    -- Turnus-styrt, men klippet til salongens åpningstid.
    for r in
      select start_time, end_time from staff_hours
      where staff_id = v_staff
        and weekday = v_dow
        and week_parity in (0, v_parity)
      order by start_time
    loop
      slot := greatest(r.start_time, v_open);
      while slot + make_interval(mins => v_dur) <= least(r.end_time, v_close) loop
        slot_start := (p_date + slot) at time zone 'Europe/Oslo';
        slot_end := slot_start + make_interval(mins => v_dur);
        if slot_start > now() and not exists (
          select 1 from bookings b
          where b.staff_id = v_staff
            and b.status in ('pending','confirmed','completed')
            and b.start_at < slot_end and b.end_at > slot_start
        ) then
          res := res || to_char(slot, 'HH24:MI');
        end if;
        slot := slot + v_step;
      end loop;
    end loop;
    return res;
  end if;

  -- Fallback (ingen turnus satt): hele salongens åpningstid.
  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
    slot_start := (p_date + slot) at time zone 'Europe/Oslo';
    slot_end := slot_start + make_interval(mins => v_dur);
    if slot_start > now() and not exists (
      select 1 from bookings b
      where b.staff_id = v_staff
        and b.status in ('pending','confirmed','completed')
        and b.start_at < slot_end and b.end_at > slot_start
    ) then
      res := res || to_char(slot, 'HH24:MI');
    end if;
    slot := slot + v_step;
  end loop;
  return res;
end $$;
grant execute on function available_slots(text, text, date) to anon, authenticated;
