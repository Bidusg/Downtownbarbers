-- =====================================================================
-- 0025 — Turnus (uke A/B) satt i gang
--   1) Manglende kolonne week_parity på staff_hours — DETTE er grunnen til
--      at turnus aldri virket (all lesing/skriving av kolonnen feilet stille).
--   2) Konfigurerbart A/B-anker (hvilken paritet en partalls ISO-uke er).
--   3) turnus_week_parity(dato): 1 = uke A, 2 = uke B, styrt av ankeret.
--   4) available_slots følger nå turnusen — men FALLER TILBAKE til 09–21
--      for barbere som ikke har satt turnus, så ingenting brekker.
-- Idempotent.
-- =====================================================================

-- 1) Manglende kolonne (0 = hver uke, 1 = uke A, 2 = uke B)
alter table staff_hours
  add column if not exists week_parity smallint not null default 0;

-- 2) Anker: default partall ISO-uke = Uke A (samme som frontenden antok før).
insert into settings (key, value)
values ('turnus_anchor', '{"a_is_even": true}'::jsonb)
on conflict (key) do nothing;

-- 3) Uke-paritet (1=A, 2=B) for en dato, styrt av ankeret.
create or replace function turnus_week_parity(p_date date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((value->>'a_is_even')::boolean, true) as a_is_even
    from settings where key = 'turnus_anchor'
  )
  select case
    when extract(week from p_date)::int % 2 = 0
      then case when (select a_is_even from cfg) then 1 else 2 end
      else case when (select a_is_even from cfg) then 2 else 1 end
  end;
$$;
grant execute on function turnus_week_parity(date) to anon, authenticated;

-- 4) Booking-tilgjengelighet som følger turnusen (med trygg fallback).
create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time := '09:00'; v_close time := '21:00';
  slot time; slot_start timestamptz; slot_end timestamptz;
  res text[] := '{}';
  r record;
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);            -- 0 = søndag
  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff) into v_has_turnus;

  if v_has_turnus then
    -- Turnus-styrt: kun innenfor barberens vakter for ukedagen + pariteten.
    for r in
      select start_time, end_time from staff_hours
      where staff_id = v_staff
        and weekday = v_dow
        and week_parity in (0, v_parity)
      order by start_time
    loop
      slot := r.start_time;
      while slot + make_interval(mins => v_dur) <= r.end_time loop
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

  -- Fallback (ingen turnus satt for barberen): som før – 09–21, man–lør.
  if v_dow = 0 then return res; end if;
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
