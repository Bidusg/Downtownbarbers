-- =====================================================================
-- Betalt / ubetalt fri («Fri denne dagen» i Timelister)
--
-- 1) staff_exceptions.paid  (true = betalt fri, false = ubetalt fri)
--    Eksisterende fridager blir betalt, så ingen lønn endres bakover.
-- 2) absence_deduction_by_staff regner nå også ubetalt fri:
--      - ubetalt fri hele dagen  = 1 fraværsdag
--      - ubetalt fri deler av dagen = andel av planlagte timer den dagen
--        (f.eks. fri 12–16 på en 10–18-dag = 0,5 dag)
--    En dag telles aldri mer enn 1, selv om det også ligger et fravær der.
--    absent_days er nå et desimaltall (numeric) i stedet for heltall.
-- Trygt å kjøre flere ganger.
-- =====================================================================

alter table staff_exceptions add column if not exists paid boolean not null default true;

-- Returtypen endres (int -> numeric), så funksjonen må droppes først.
drop function if exists absence_deduction_by_staff(int, int);

create or replace function absence_deduction_by_staff(p_year int, p_month int)
returns table (staff_id uuid, workdays int, absent_days numeric)
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
      -- planlagte minutter fra turnus
      coalesce((
        select sum(extract(epoch from (h.end_time - h.start_time)) / 60)
          from staff_hours h
         where h.staff_id = st.id
           and h.weekday = extract(dow from dd.day)
           and h.week_parity in (0, turnus_week_parity(dd.day))
           and (h.valid_from is null or h.valid_from <= dd.day)
           and (h.valid_to   is null or h.valid_to   >= dd.day)
      ), 0) as turnus_min,
      -- vakt for dagen (erstatter turnus)
      coalesce((
        select sum(extract(epoch from (e.end_time - e.start_time)) / 60)
          from staff_exceptions e
         where e.staff_id = st.id and e.date = dd.day and e.kind = 'extra'
           and e.start_time is not null and e.end_time is not null
      ), 0) as extra_min,
      exists (
        select 1 from staff_exceptions e
         where e.staff_id = st.id and e.date = dd.day and e.kind = 'extra'
      ) as has_extra
    from st cross join days dd
  ),
  td as (
    select t.*,
      (t.has_extra or t.turnus_min > 0) as on_turnus,
      case when t.has_extra then t.extra_min else t.turnus_min end as sched_min
    from turnus_day t
  ),
  has_turnus as (
    select sid, bool_or(on_turnus) as any_turnus from td group by sid
  ),
  work as (
    -- Arbeidsdag: turnusdag, eller man–fre hvis den ansatte ikke har turnus.
    select t.sid, t.day, t.has_extra, t.sched_min,
      case when h.any_turnus then t.on_turnus
           else extract(isodow from t.day) between 1 and 5 end as is_work,
      ((st.start_date is null or t.day >= st.start_date)
        and (st.end_date is null or t.day <= st.end_date)) as employed
    from td t
    join has_turnus h on h.sid = t.sid
    join st on st.id = t.sid
  ),
  per_day as (
    select w.sid, w.day, w.is_work, w.employed,
      -- registrert fravær (ulønnet/ugyldig) hele dagen; vakt den dagen = jobbet
      case when not w.has_extra and exists (
             select 1 from absences a
              where a.staff_id = w.sid
                and a.kind in ('ulonnet', 'ugyldig')
                and w.day between a.from_date and a.to_date
           ) then 1::numeric else 0::numeric end as abs_part,
      -- ubetalt fri fra Timelister
      case
        when exists (
          select 1 from staff_exceptions e
           where e.staff_id = w.sid and e.date = w.day and e.kind = 'off'
             and e.paid = false and e.start_time is null
        ) then 1::numeric
        when w.sched_min > 0 then least(1::numeric, coalesce((
          select sum(extract(epoch from (e.end_time - e.start_time)) / 60)
            from staff_exceptions e
           where e.staff_id = w.sid and e.date = w.day and e.kind = 'off'
             and e.paid = false and e.start_time is not null and e.end_time is not null
        ), 0)::numeric / w.sched_min::numeric)
        else 0::numeric
      end as off_part
    from work w
  )
  select p.sid,
         count(*) filter (where p.is_work)::int,
         round(coalesce(sum(greatest(p.abs_part, p.off_part))
                 filter (where p.is_work and p.employed), 0), 2)
    from per_day p
   group by p.sid;
end $$;
grant execute on function absence_deduction_by_staff(int, int) to authenticated;

notify pgrst, 'reload schema';
