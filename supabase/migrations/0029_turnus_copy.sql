-- =====================================================================
-- 0029 — Kopier turnus mellom uke A og uke B
--   Hjelper Dawit å slippe å legge inn samme turnus to ganger: kopier hele
--   uke A over til uke B (eller motsatt) med ett klikk. Erstatter mål-ukens
--   paritets-vakter med en kopi av kilde-ukens. Vakter merket «Hver uke»
--   (paritet 0) røres ikke — de gjelder allerede begge uker.
-- Idempotent (create or replace).
-- =====================================================================

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
  insert into staff_hours (staff_id, weekday, start_time, end_time, week_parity)
    select staff_id, weekday, start_time, end_time, p_to
    from staff_hours
    where week_parity = p_from;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function copy_turnus_week(int, int) to authenticated;
