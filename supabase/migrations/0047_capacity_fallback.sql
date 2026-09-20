-- =====================================================================
-- 0047 – ÉN timeutnyttelses-definisjon (turnus, med åpningstid som fallback)
--
--   Bakgrunn: Nøkkeltall regnet mot flat åpningstid (09–21 × barbere),
--   mens Produktivitet regnet mot turnus (turnus_capacity_minutes, 0042).
--   To ulike tall for samme sak. I tillegg viste Produktivitet «/ 0 t» så
--   lenge turnus (staff_hours) ikke var fylt inn.
--
--   Denne migrasjonen gjør turnus_capacity_minutes til ÉN felles kilde
--   som BEGGE sidene bruker, og legger til en FALLBACK: en aktiv barber
--   UTEN turnus regnes mot salongens åpningstid (salon_hours, 0026) i
--   stedet for 0 — nøyaktig som available_slots faller tilbake. Fravær
--   (absences + heldags-avvik), delvis fri og ekstravakter justeres likt
--   for begge, så tallet er meningsfullt før turnus fylles inn, og blir
--   turnus-presist når den er det.
--
--   Kun redefinering av funksjonen. Idempotent.
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
