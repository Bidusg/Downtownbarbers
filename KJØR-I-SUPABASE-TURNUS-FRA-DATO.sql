-- =====================================================================
-- KJØR-I-SUPABASE-TURNUS-FRA-DATO.sql  (idempotent – kjør etter TURNUS-STRENG)
--
-- 1) Turnus kan starte (og slutte) på en dato: staff_hours.valid_from /
--    valid_to. En vakt gjelder bare dager innenfor [fra, til]. Tom = åpen.
--    Kunder kan da booke fra startdatoen og fremover.
-- 2) Alle funksjonene som leser turnus respekterer datoene: ledige tider,
--    «på vakt» i kalenderen, hvem som kan bookes, Min side (ansatt) og
--    kapasitet/rapporter.
-- 3) Visningsnavn på nettsiden (staff.display_name) – i tilfelle
--    VISNINGSNAVN-fila ikke er kjørt.
-- =====================================================================

alter table staff_hours add column if not exists valid_from date;
alter table staff_hours add column if not exists valid_to   date;
alter table staff add column if not exists display_name text;

create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time; v_close time;
  v_full_off boolean;
  slot time; slot_end_t time;
  slot_start timestamptz; slot_end timestamptz;
  in_work boolean;
  res text[] := '{}';
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);

  -- 1) Salongens åpningstid (0026). Stengt → ingen tider.
  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

  -- 1b) Admin-blokkering hele dagen (0055) → stengt for alle.
  if exists (
    select 1 from booking_blocks bb
    where bb.block_date = p_date and bb.start_time is null
  ) then
    return res;
  end if;

  -- 2) Heldags fravær denne datoen → stengt. Gjelder både et heldags-avvik
  --    (staff_exceptions) OG et registrert fravær i datointervall (absences,
  --    fra /admin/fravaer). Sistnevnte blokkerte tidligere IKKE booking.
  select
    exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date
        and e.kind = 'off' and e.start_time is null
    )
    or exists (
      select 1 from absences a
      where a.staff_id = v_staff
        and p_date between a.from_date and a.to_date
    )
  into v_full_off;
  if v_full_off then return res; end if;

  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff and (valid_from is null or valid_from <= p_date) and (valid_to is null or valid_to >= p_date)) into v_has_turnus;

  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
    slot_end_t := slot + make_interval(mins => v_dur);

    -- a) Innenfor barberens turnus? (uten turnus: hele åpningstiden)
    if v_has_turnus then
      in_work := exists (
        select 1 from staff_hours h
        where h.staff_id = v_staff
          and h.weekday = v_dow
          and h.week_parity in (0, v_parity)
          and (h.valid_from is null or h.valid_from <= p_date) and (h.valid_to is null or h.valid_to >= p_date)
          and slot >= h.start_time and slot_end_t <= h.end_time
      );
    else
      in_work := false; -- ingen turnus = ikke bookbar (kun ekstravakter)
    end if;

    -- b) Ekstravakt kan åpne slots utenfor vanlig turnus (denne datoen).
    if not in_work then
      in_work := exists (
        select 1 from staff_exceptions e
        where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
          and e.start_time is not null and e.end_time is not null
          and slot >= e.start_time and slot_end_t <= e.end_time
      );
    end if;

    -- c) Delvis fravær fjerner slots som overlapper fri-perioden.
    if in_work and exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date and e.kind = 'off'
        and e.start_time is not null and e.end_time is not null
        and slot < e.end_time and slot_end_t > e.start_time
    ) then
      in_work := false;
    end if;

    -- d) Delvis admin-blokkering (0055) fjerner overlappende slots for alle.
    if in_work and exists (
      select 1 from booking_blocks bb
      where bb.block_date = p_date
        and bb.start_time is not null and bb.end_time is not null
        and slot < bb.end_time and slot_end_t > bb.start_time
    ) then
      in_work := false;
    end if;

    if in_work then
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
    end if;

    slot := slot + v_step;
  end loop;

  return res;
end $$;

grant execute on function available_slots(text, text, date) to anon, authenticated;

create or replace function available_slots_dur(
  p_barber text, p_minutes int, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time; v_close time;
  v_full_off boolean;
  slot time; slot_end_t time;
  slot_start timestamptz; slot_end timestamptz;
  in_work boolean;
  res text[] := '{}';
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;
  v_dur := greatest(5, coalesce(p_minutes, 30));

  v_dow := extract(dow from p_date);

  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

  if exists (
    select 1 from booking_blocks bb
    where bb.block_date = p_date and bb.start_time is null
  ) then
    return res;
  end if;

  select
    exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date
        and e.kind = 'off' and e.start_time is null
    )
    or exists (
      select 1 from absences a
      where a.staff_id = v_staff
        and p_date between a.from_date and a.to_date
    )
  into v_full_off;
  if v_full_off then return res; end if;

  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff and (valid_from is null or valid_from <= p_date) and (valid_to is null or valid_to >= p_date)) into v_has_turnus;

  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
    slot_end_t := slot + make_interval(mins => v_dur);

    if v_has_turnus then
      in_work := exists (
        select 1 from staff_hours h
        where h.staff_id = v_staff
          and h.weekday = v_dow
          and h.week_parity in (0, v_parity)
          and (h.valid_from is null or h.valid_from <= p_date) and (h.valid_to is null or h.valid_to >= p_date)
          and slot >= h.start_time and slot_end_t <= h.end_time
      );
    else
      in_work := false; -- ingen turnus = ikke bookbar (kun ekstravakter)
    end if;

    if not in_work then
      in_work := exists (
        select 1 from staff_exceptions e
        where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
          and e.start_time is not null and e.end_time is not null
          and slot >= e.start_time and slot_end_t <= e.end_time
      );
    end if;

    if in_work and exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date and e.kind = 'off'
        and e.start_time is not null and e.end_time is not null
        and slot < e.end_time and slot_end_t > e.start_time
    ) then
      in_work := false;
    end if;

    if in_work and exists (
      select 1 from booking_blocks bb
      where bb.block_date = p_date
        and bb.start_time is not null and bb.end_time is not null
        and slot < bb.end_time and slot_end_t > bb.start_time
    ) then
      in_work := false;
    end if;

    if in_work then
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
    end if;

    slot := slot + v_step;
  end loop;

  return res;
end $$;
grant execute on function available_slots_dur(text, int, date) to anon, authenticated;

create or replace function bookable_staff_names()
returns setof text
language sql stable security definer set search_path = public as $$
  select s.full_name
    from staff s
   where s.active
     and (
       exists (select 1 from staff_hours h where h.staff_id = s.id and (h.valid_to is null or h.valid_to >= current_date))
       or exists (
         select 1 from staff_exceptions e
          where e.staff_id = s.id and e.kind = 'extra' and e.date >= current_date
       )
     );
$$;
grant execute on function bookable_staff_names() to anon, authenticated;

create or replace function staff_on_duty(p_date date)
returns setof text
language sql stable security definer set search_path = public as $$
  select s.full_name
    from staff s
   where s.active
     and (
       exists (
         select 1 from staff_hours h
          where h.staff_id = s.id
            and h.weekday = extract(dow from p_date)
            and h.week_parity in (0, turnus_week_parity(p_date))
            and (h.valid_from is null or h.valid_from <= p_date) and (h.valid_to is null or h.valid_to >= p_date)
       )
       or exists (
         select 1 from staff_exceptions e
          where e.staff_id = s.id and e.date = p_date and e.kind = 'extra'
       )
     )
     and not exists (
       select 1 from staff_exceptions e
        where e.staff_id = s.id and e.date = p_date and e.kind = 'off' and e.start_time is null
     )
     and not exists (
       select 1 from absences a
        where a.staff_id = s.id and p_date between a.from_date and a.to_date
     );
$$;
grant execute on function staff_on_duty(date) to authenticated;

create or replace function my_turnus()
returns table (weekday smallint, week_parity smallint, start_time time, end_time time)
language sql
stable
security definer
set search_path = public
as $$
  select h.weekday, h.week_parity, h.start_time, h.end_time
  from staff_hours h
  where h.staff_id = current_staff_id()
    and (h.valid_to is null or h.valid_to >= current_date)
  order by h.week_parity, h.weekday, h.start_time;
$$;
grant execute on function my_turnus() to authenticated;

create or replace function my_upcoming_shifts(p_days int default 21)
returns table (work_date date, weekday int, start_time time, end_time time, week_parity int)
language sql
stable
security definer
set search_path = public
as $$
  with sid as (select current_staff_id() as id),
  days as (
    select d::date as work_date
    from generate_series(
      (now() at time zone 'Europe/Oslo')::date,
      (now() at time zone 'Europe/Oslo')::date + (greatest(coalesce(p_days, 21), 1) - 1),
      interval '1 day'
    ) as d
  )
  select
    dd.work_date,
    extract(dow from dd.work_date)::int,
    h.start_time,
    h.end_time,
    turnus_week_parity(dd.work_date)
  from days dd
  cross join sid
  join staff_hours h
    on h.staff_id = sid.id
   and h.weekday = extract(dow from dd.work_date)::int
   and h.week_parity in (0, turnus_week_parity(dd.work_date))
   and (h.valid_from is null or h.valid_from <= dd.work_date) and (h.valid_to is null or h.valid_to >= dd.work_date)
  where sid.id is not null
    and not exists (
      select 1 from staff_exceptions e
      where e.staff_id = sid.id
        and e.date = dd.work_date
        and e.kind = 'off'
        and e.start_time is null
    )
    and not exists (
      select 1 from absences a
      where a.staff_id = sid.id
        and dd.work_date between a.from_date and a.to_date
    )
  order by dd.work_date, h.start_time;
$$;
grant execute on function my_upcoming_shifts(int) to authenticated;

create or replace function turnus_capacity_minutes(p_from date, p_to date)
returns table (staff_id uuid, minutes numeric)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select
      d::date                            as work_date,
      turnus_week_parity(d::date)        as parity,
      extract(dow from d::date)::int     as dow
    from generate_series(p_from, p_to, interval '1 day') as d
  ),
  active as (
    select
      s.id,
      exists (select 1 from staff_hours h where h.staff_id = s.id) as has_turnus
    from staff s
    where s.active = true
  ),
  -- Kapasitet-minutter per aktiv ansatt per dag:
  --   har turnus  → turnus for ukedag + paritet (0 = hver uke)
  --   uten turnus → salongens åpningstid den ukedagen (fallback)
  base as (
    select
      a.id       as staff_id,
      dd.work_date,
      case when a.has_turnus then
        coalesce((
          select sum(extract(epoch from (h.end_time - h.start_time)) / 60.0)
          from staff_hours h
          where h.staff_id = a.id
            and h.weekday = dd.dow
            and h.week_parity in (0, dd.parity)
            and (h.valid_from is null or h.valid_from <= dd.work_date) and (h.valid_to is null or h.valid_to >= dd.work_date)
        ), 0)
      else
        coalesce((
          select extract(epoch from (sh.close_t - sh.open_t)) / 60.0
          from salon_hours(dd.dow) sh
        ), 0)
      end        as base_min
    from active a
    cross join days dd
  ),
  adj as (
    select
      b.staff_id,
      b.base_min,
      (
        exists (
          select 1 from absences ab
          where ab.staff_id = b.staff_id
            and b.work_date between ab.from_date and ab.to_date
        )
        or exists (
          select 1 from staff_exceptions e
          where e.staff_id = b.staff_id
            and e.date = b.work_date
            and e.kind = 'off'
            and e.start_time is null
        )
      ) as full_off,
      coalesce((
        select sum(extract(epoch from (e.end_time - e.start_time)) / 60.0)
        from staff_exceptions e
        where e.staff_id = b.staff_id
          and e.date = b.work_date
          and e.kind = 'off'
          and e.start_time is not null
          and e.end_time is not null
      ), 0) as partial_off_min,
      coalesce((
        select sum(extract(epoch from (e.end_time - e.start_time)) / 60.0)
        from staff_exceptions e
        where e.staff_id = b.staff_id
          and e.date = b.work_date
          and e.kind = 'extra'
          and e.start_time is not null
          and e.end_time is not null
      ), 0) as extra_min
    from base b
  )
  select
    staff_id,
    sum(
      case
        when full_off then 0
        else greatest(0, base_min - partial_off_min) + extra_min
      end
    )::numeric as minutes
  from adj
  group by staff_id;
$$;
grant execute on function turnus_capacity_minutes(date, date) to authenticated;

create or replace function copy_turnus_week(p_from int, p_to int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not is_admin() then
    raise exception 'Kun admin kan kopiere turnus';
  end if;
  if p_from not in (1, 2) or p_to not in (1, 2) or p_from = p_to then
    return 0;
  end if;

  -- Erstatt mål-ukens vakter med en kopi av kilde-ukens.
  delete from staff_hours where week_parity = p_to;
  insert into staff_hours (staff_id, weekday, start_time, end_time, week_parity, valid_from, valid_to)
    select staff_id, weekday, start_time, end_time, p_to, valid_from, valid_to
    from staff_hours
    where week_parity = p_from;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function copy_turnus_week(int, int) to authenticated;


-- Kontroll: turnus som starter frem i tid
select s.full_name, h.weekday, h.start_time, h.end_time, h.valid_from, h.valid_to
  from staff_hours h join staff s on s.id = h.staff_id
 where h.valid_from > current_date or h.valid_to is not null
 order by s.full_name, h.valid_from;
