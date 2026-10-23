-- =====================================================================
-- Ting som henger sammen på tvers av rollene (admin / kasse / ansatt / revisor)
--
--  1) Kasseoppgjør: revisor kan lese dagsoppgjørene (talt kontant/kort/
--     Vipps) og salgene/betalingene de avstemmes mot. Siden
--     /revisor/kasseoppgjor viser forventet, talt og avvik per dag.
--     Kun lesing – revisor kan ikke endre noe.
--  2) Meldinger: admin kan sende interne meldinger til revisor
--     (målgruppe «Revisor»), f.eks. «Bilag for september er lastet opp».
--  3) Arbeidstid: timene de ansatte stempler i kassa var bare synlige for
--     den ansatte selv. Nå ser admin og revisor stemplet arbeidstid per
--     ansatt og dag (/admin/arbeidstid og /revisor/arbeidstid).
--
-- Trygt å kjøre flere ganger.
-- =====================================================================

drop policy if exists cash_settlements_revisor_read on cash_settlements;
create policy cash_settlements_revisor_read on cash_settlements
  for select using (current_role_name()::text = 'revisor');

drop policy if exists sales_revisor_read on sales;
create policy sales_revisor_read on sales
  for select using (current_role_name()::text = 'revisor');

drop policy if exists sale_payments_revisor_read on sale_payments;
create policy sale_payments_revisor_read on sale_payments
  for select using (current_role_name()::text = 'revisor');

drop policy if exists notices_role_read on notices;
create policy notices_role_read on notices
  for select using (
    is_admin()
    or (current_role_name()::text = 'shop'    and audience in ('all', 'shop'))
    or (current_role_name()::text = 'staff'   and audience in ('all', 'ansatt'))
    or (current_role_name()::text = 'revisor' and audience in ('all', 'revisor'))
  );

-- 3) Stemplet arbeidstid for alle ansatte (admin/eier/revisor).
create or replace function staff_shift_days(p_from date, p_to date)
returns table (staff_id uuid, full_name text, day date, worked_minutes int, events int, open_shift boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (is_admin() or current_role_name()::text = 'revisor') then
    raise exception 'Ikke tilgang';
  end if;
  return query
  with ev as (
    select
      e.staff_id,
      e.created_at,
      (e.created_at at time zone 'Europe/Oslo')::date as d,
      e.event_type,
      lead(e.created_at) over (partition by e.staff_id order by e.created_at) as next_at
    from shift_events e
    where (e.created_at at time zone 'Europe/Oslo')::date between p_from and p_to
  ),
  worked as (
    select
      ev.staff_id,
      ev.d,
      sum(
        greatest(0, extract(epoch from (
          least(
            -- Mangler utstempling: telles til nå bare i dag (pågår). En
            -- tidligere dag uten utstempling telles ikke (ellers ble det
            -- urealistisk mange timer) – den vises som «ikke stemplet ut».
            coalesce(ev.next_at,
              case when ev.d = (now() at time zone 'Europe/Oslo')::date then now() else ev.created_at end),
            ((ev.d + 1)::timestamp at time zone 'Europe/Oslo')
          ) - ev.created_at
        )) / 60)
      ) filter (where ev.event_type in ('start', 'resume')) as mins,
      count(*) as ev_count,
      bool_or(ev.next_at is null and ev.event_type in ('start', 'resume')) as is_open
    from ev
    group by ev.staff_id, ev.d
  )
  select w.staff_id, s.full_name, w.d, coalesce(round(w.mins)::int, 0), w.ev_count::int, coalesce(w.is_open, false)
  from worked w
  join staff s on s.id = w.staff_id
  order by s.full_name, w.d desc;
end $$;
revoke execute on function staff_shift_days(date, date) from public, anon;
grant execute on function staff_shift_days(date, date) to authenticated;

notify pgrst, 'reload schema';
