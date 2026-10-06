-- =====================================================================
-- KJØR-I-SUPABASE-ANSATT-START-SLUTT.sql  (idempotent – kjør etter EKSTRAVAKT-VINNER)
--
-- 1) Start- og sluttdato på ansatte (staff.start_date / end_date).
--    • Kan ikke bookes og vises ikke «på vakt» før start / etter slutt.
--    • Lønn: grunnlønnen avkortes for dager i måneden utenfor ansettelsen
--      (beregnes i appen); fravær utenfor ansettelsen trekkes ikke dobbelt.
-- 2) Ny dokumentkategori «oppsigelse» (last opp under Ansatte).
-- =====================================================================

alter table staff add column if not exists start_date date;
alter table staff add column if not exists end_date   date;
alter table staff drop constraint if exists staff_employment_dates_check;
alter table staff add constraint staff_employment_dates_check
  check (start_date is null or end_date is null or end_date >= start_date);

-- staff_documents.category: legg til 'oppsigelse'
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'staff_documents'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table staff_documents drop constraint %I', c.conname);
  end loop;
end $$;
alter table staff_documents add constraint staff_documents_category_check
  check (category in ('kontrakt', 'lonnslipp', 'annet', 'oppsigelse'));

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

  -- Utenfor ansettelsesperioden (start/slutt) → ingen tider.
  if exists (
    select 1 from staff s
     where s.id = v_staff
       and ((s.start_date is not null and p_date < s.start_date)
         or (s.end_date   is not null and p_date > s.end_date))
  ) then
    return res;
  end if;
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
  -- Ekstravakt denne datoen vinner over fravær/heldags fri: da gjelder KUN
  -- ekstravaktens tidsrom (turnusen ignoreres den dagen).
  if v_full_off then
    if not exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
    ) then
      return res;
    end if;
  end if;

  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff and (valid_from is null or valid_from <= p_date) and (valid_to is null or valid_to >= p_date)) into v_has_turnus;
  -- En vakt satt for denne datoen ERSTATTER turnusen den dagen (og vinner
  -- over fravær): da er kun vaktens tidsrom bookbart.
  if exists (
    select 1 from staff_exceptions e
    where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
  ) then
    v_has_turnus := false;
  end if;

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

  -- Utenfor ansettelsesperioden (start/slutt) → ingen tider.
  if exists (
    select 1 from staff s
     where s.id = v_staff
       and ((s.start_date is not null and p_date < s.start_date)
         or (s.end_date   is not null and p_date > s.end_date))
  ) then
    return res;
  end if;
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
  -- Ekstravakt denne datoen vinner over fravær/heldags fri: da gjelder KUN
  -- ekstravaktens tidsrom (turnusen ignoreres den dagen).
  if v_full_off then
    if not exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
    ) then
      return res;
    end if;
  end if;

  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff and (valid_from is null or valid_from <= p_date) and (valid_to is null or valid_to >= p_date)) into v_has_turnus;
  -- En vakt satt for denne datoen ERSTATTER turnusen den dagen (og vinner
  -- over fravær): da er kun vaktens tidsrom bookbart.
  if exists (
    select 1 from staff_exceptions e
    where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
  ) then
    v_has_turnus := false;
  end if;

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

create or replace function staff_on_duty(p_date date)
returns setof text
language sql stable security definer set search_path = public as $$
  select s.full_name
    from staff s
   where s.active
     and (s.start_date is null or s.start_date <= p_date)
     and (s.end_date   is null or s.end_date   >= p_date)
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
     and (
       -- Ekstravakt denne datoen vinner over fravær / heldags fri.
       exists (
         select 1 from staff_exceptions e
          where e.staff_id = s.id and e.date = p_date and e.kind = 'extra'
       )
       or (
         not exists (
           select 1 from staff_exceptions e
            where e.staff_id = s.id and e.date = p_date and e.kind = 'off' and e.start_time is null
         )
         and not exists (
           select 1 from absences a
            where a.staff_id = s.id and p_date between a.from_date and a.to_date
         )
       )
     );
$$;
grant execute on function staff_on_duty(date) to authenticated;

create or replace function absence_deduction_by_staff(p_year int, p_month int)
returns table (staff_id uuid, workdays int, absent_days int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select role::text from profiles where id = auth.uid()) not in ('admin', 'eier', 'revisor') then
    raise exception 'Kun admin/eier/revisor har tilgang.';
  end if;
  return query
  with days as (
    select d::date as day
    from generate_series(make_date(p_year, p_month, 1),
                         (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date,
                         interval '1 day') d
  ),
  st as (select s.id, s.start_date, s.end_date from staff s where s.active),
  turnus_day as (
    select st.id as sid, dd.day,
      (
        exists (
          select 1 from staff_hours h
           where h.staff_id = st.id
             and h.weekday = extract(dow from dd.day)
             and h.week_parity in (0, turnus_week_parity(dd.day))
             and (h.valid_from is null or h.valid_from <= dd.day)
             and (h.valid_to   is null or h.valid_to   >= dd.day)
        )
        or exists (
          select 1 from staff_exceptions e
           where e.staff_id = st.id and e.date = dd.day and e.kind = 'extra'
        )
      ) as on_turnus
    from st cross join days dd
  ),
  has_turnus as (
    select sid, bool_or(on_turnus) as any_turnus from turnus_day group by sid
  ),
  work as (
    -- Arbeidsdag: turnusdag, eller man–fre hvis den ansatte ikke har turnus.
    select t.sid, t.day,
      case when h.any_turnus then t.on_turnus
           else extract(isodow from t.day) between 1 and 5 end as is_work,
      -- innenfor ansettelsen? (dager utenfor avkortes separat i appen)
      ((st.start_date is null or t.day >= st.start_date)
        and (st.end_date is null or t.day <= st.end_date)) as employed
    from turnus_day t
    join has_turnus h on h.sid = t.sid
    join st on st.id = t.sid
  )
  select w.sid,
         count(*) filter (where w.is_work)::int,
         count(*) filter (
           where w.is_work and w.employed and exists (
             select 1 from absences a
              where a.staff_id = w.sid
                and a.kind in ('ulonnet', 'ugyldig')
                and w.day between a.from_date and a.to_date
           )
           -- ekstravakt den dagen = jobbet, ikke fravær
           and not exists (
             select 1 from staff_exceptions e
              where e.staff_id = w.sid and e.date = w.day and e.kind = 'extra'
           )
         )::int
    from work w
   group by w.sid;
end $$;
grant execute on function absence_deduction_by_staff(int, int) to authenticated;
