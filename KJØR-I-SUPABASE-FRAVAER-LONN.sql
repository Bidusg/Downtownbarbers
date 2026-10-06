-- =====================================================================
-- KJØR-I-SUPABASE-FRAVAER-LONN.sql  (idempotent)
--   1) Fraværstype på absences.kind:
--        ulonnet  = ulønnet permisjon / fri      → TREKKES i grunnlønn
--        ugyldig  = ugyldig fravær (uteblitt)    → TREKKES i grunnlønn
--        syk      = sykefravær                   → ikke trekk
--        ferie    = ferie                        → ikke trekk
--        annet    = annet / ikke angitt          → ikke trekk
--      Eksisterende fravær blir «annet» – sett riktig type under Fravær.
--   2) absence_deduction_by_staff(år, mnd): turnusdager i måneden og hvor
--      mange av dem den ansatte hadde trekk-fravær. Trekk =
--      grunnlønn × fraværsdager ÷ turnusdager. Uten turnus: man–fre.
--   3) monthly_gross_by_staff slipper nå også inn rollen «eier» (Dawit) –
--      før fikk eier feil/0 kr i lønnsoversikten.
-- =====================================================================

alter table absences add column if not exists kind text not null default 'annet';
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('ulonnet', 'ugyldig', 'syk', 'ferie', 'annet'));

-- Turnus fra dato (i tilfelle TURNUS-FRA-DATO ikke er kjørt ennå).
alter table staff_hours add column if not exists valid_from date;
alter table staff_hours add column if not exists valid_to   date;

create or replace function monthly_gross_by_staff(p_year int, p_month int)
returns table (staff_id uuid, gross_nok numeric)
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
    select s.staff_id, coalesce(sum(s.total_nok), 0)::numeric
    from sales s
    where s.staff_id is not null
      and s.sold_at >= make_date(p_year, p_month, 1)
      and s.sold_at <  (make_date(p_year, p_month, 1) + interval '1 month')
    group by s.staff_id;
end $$;
grant execute on function monthly_gross_by_staff(int, int) to authenticated;

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
  st as (select s.id from staff s where s.active),
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
           else extract(isodow from t.day) between 1 and 5 end as is_work
    from turnus_day t join has_turnus h on h.sid = t.sid
  )
  select w.sid,
         count(*) filter (where w.is_work)::int,
         count(*) filter (
           where w.is_work and exists (
             select 1 from absences a
              where a.staff_id = w.sid
                and a.kind in ('ulonnet', 'ugyldig')
                and w.day between a.from_date and a.to_date
           )
         )::int
    from work w
   group by w.sid;
end $$;
grant execute on function absence_deduction_by_staff(int, int) to authenticated;
