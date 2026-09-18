-- =====================================================================
-- 0042 – Turnus-presis kapasitet (minutter per ansatt over en periode)
--
--   Timeutnyttelse v1 (kpi-queries) brukte flat åpningstid (09–21, man–lør)
--   × antall aktive barberere. Denne RPC-en gir PRESIS planlagt kapasitet
--   ut fra faktisk turnus (staff_hours uke A/B via turnus_week_parity),
--   med fulle fridager (absences + heldags-fravær) trukket fra, delvis
--   fravær subtrahert og ekstravakter lagt til – samme logikk som
--   available_slots (0025/0026/0028), så tallene er konsistente med
--   selve booking-motoren.
--
--   Returnerer minutter per staff_id i [p_from, p_to] (begge inklusive).
--   Kun lesing, authenticated (admin/revisor bruker den server-side).
--   Idempotent.
-- =====================================================================
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
    select id from staff where active = true
  ),
  -- Turnus-minutter per aktiv ansatt per dag (parity 0 = hver uke).
  base as (
    select
      a.id       as staff_id,
      dd.work_date,
      coalesce(
        sum(extract(epoch from (h.end_time - h.start_time)) / 60.0),
        0
      )          as base_min
    from active a
    cross join days dd
    left join staff_hours h
      on h.staff_id   = a.id
     and h.weekday    = dd.dow
     and h.week_parity in (0, dd.parity)
    group by a.id, dd.work_date
  ),
  adj as (
    select
      b.staff_id,
      b.base_min,
      -- Heldags fri: ferie (absences) eller heldags-avvik (off uten tid).
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
      -- Delvis fravær (off med tider) trekkes fra.
      coalesce((
        select sum(extract(epoch from (e.end_time - e.start_time)) / 60.0)
        from staff_exceptions e
        where e.staff_id = b.staff_id
          and e.date = b.work_date
          and e.kind = 'off'
          and e.start_time is not null
          and e.end_time is not null
      ), 0) as partial_off_min,
      -- Ekstravakter (extra med tider) legges til.
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
