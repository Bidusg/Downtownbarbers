-- =====================================================================
-- 0017 – Åpningstid til 21:00 + utvidet dagsagenda
--   available_slots: stenger nå 21:00 (åpent 09–21, man–lør).
--   day_agenda:      tar med customer_id + email (for popup/kasse i kalender).
-- Idempotent (create or replace).
-- =====================================================================

create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_open time := '09:00'; v_close time := '21:00'; v_step interval := '15 minutes';
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

-- Dagsagenda med kunde-id + e-post (uten pris – shop ser aldri omsetning).
-- day_agenda hadde færre kolonner i 0016; create or replace kan ikke endre
-- retur-typen, så vi dropper den først.
drop function if exists day_agenda(date);
create or replace function day_agenda(p_date date)
returns table (
  id          uuid,
  staff_id    uuid,
  barber      text,
  start_at    timestamptz,
  end_at      timestamptz,
  status      text,
  customer    text,
  service     text,
  phone       text,
  customer_id uuid,
  email       text
)
language sql security definer set search_path = public as $$
  select
    b.id, b.staff_id, st.full_name,
    b.start_at, b.end_at, b.status::text,
    c.full_name, s.name, c.phone, c.id, c.email
  from bookings b
  left join staff st on st.id = b.staff_id
  left join customers c on c.id = b.customer_id
  left join services s on s.id = b.service_id
  where (b.start_at at time zone 'Europe/Oslo')::date = p_date
  order by b.start_at;
$$;
grant execute on function day_agenda(date) to anon, authenticated;
