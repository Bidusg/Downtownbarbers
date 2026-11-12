-- =====================================================================
-- KJØR-I-SUPABASE-ANSATT-MAAL.sql  (idempotent)
--   «Ditt månedsmål» på /ansatt var tomt for rollen staff fordi RLS
--   stenger ansatte ute fra sales/budgets. Denne security definer-
--   funksjonen gir innlogget ansatt KUN sitt eget mål og egen omsetning
--   for en måned (Oslo-tid), aldri kolleger.
--
--   my_goal_progress(p_year, p_month) -> (target_nok, achieved_nok)
--     target_nok   = budgets.target_nok for current_staff_id() (0 hvis ingen)
--     achieved_nok = sum sales.total_nok i måneden (inkl. mva) + evt.
--                    importert historikk (historical_staff_revenue), samme
--                    logikk som getGoalProgress().
--
-- Krever at 0035_ansatt_self_service.sql (current_staff_id) er kjørt.
-- Appen faller tilbake til gammel logikk hvis denne ikke er kjørt.
-- =====================================================================

create or replace function my_goal_progress(p_year int, p_month int)
returns table (target_nok numeric, achieved_nok numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff uuid := current_staff_id();
  v_start timestamptz;
  v_end   timestamptz;
  v_target numeric := 0;
  v_sales numeric := 0;
  v_hist numeric := 0;
begin
  if v_staff is null or p_year is null or p_month is null
     or p_month < 1 or p_month > 12 then
    return query select 0::numeric, 0::numeric;
    return;
  end if;

  -- Månedsgrenser i Oslo-tid (lagret er UTC).
  v_start := make_date(p_year, p_month, 1)::timestamp at time zone 'Europe/Oslo';
  v_end   := (make_date(p_year, p_month, 1) + interval '1 month')::timestamp at time zone 'Europe/Oslo';

  select coalesce(sum(b.target_nok), 0) into v_target
    from budgets b
   where b.staff_id = v_staff and b.year = p_year and b.month = p_month;

  select coalesce(sum(s.total_nok), 0) into v_sales
    from sales s
   where s.staff_id = v_staff and s.sold_at >= v_start and s.sold_at < v_end;

  -- Importert historikk (kun hvis tabellen finnes).
  if to_regclass('public.historical_staff_revenue') is not null then
    execute 'select coalesce(sum(total_nok), 0) from historical_staff_revenue
              where staff_id = $1 and month = make_date($2, $3, 1)'
      into v_hist using v_staff, p_year, p_month;
  end if;

  return query select v_target, v_sales + v_hist;
end;
$$;

revoke all on function my_goal_progress(int, int) from public, anon;
grant execute on function my_goal_progress(int, int) to authenticated;

notify pgrst, 'reload schema';
