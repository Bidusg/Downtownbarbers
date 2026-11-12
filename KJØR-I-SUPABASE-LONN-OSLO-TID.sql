-- =====================================================================
-- LØNN: MÅNEDSGRENSER I OSLO-TID
-- ---------------------------------------------------------------------
-- monthly_gross_by_staff og monthly_revenue_split_by_staff sammenlignet
-- sales.sold_at med make_date(...) i databasens sesjons-tidssone (UTC).
-- Salg mellom 00:00 og 01:00/02:00 norsk tid første dag i måneden havnet
-- dermed i feil måned. Nå brukes midnatt Europe/Oslo som grense.
-- Ellers identiske med forrige definisjon (FRAVAER-LONN / LONN-ANSATT).
-- Trygt å kjøre flere ganger.
-- =====================================================================

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
      and s.sold_at >= (make_date(p_year, p_month, 1)::timestamp at time zone 'Europe/Oslo')
      and s.sold_at <  ((make_date(p_year, p_month, 1) + interval '1 month')::timestamp at time zone 'Europe/Oslo')
    group by s.staff_id;
end $$;
revoke all on function monthly_gross_by_staff(int, int) from public, anon;
grant execute on function monthly_gross_by_staff(int, int) to authenticated;

create or replace function monthly_revenue_split_by_staff(p_year int, p_month int)
returns table (staff_id uuid, service_nok numeric, product_nok numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select role::text from profiles where id = auth.uid())
       not in ('admin', 'eier', 'revisor') then
    raise exception 'Kun admin/eier/revisor har tilgang.';
  end if;
  return query
    select s.staff_id,
           coalesce(sum(i.price_nok) filter (where i.kind <> 'product'), 0)::numeric,
           coalesce(sum(i.price_nok) filter (where i.kind =  'product'), 0)::numeric
      from sale_items i
      join sales s on s.id = i.sale_id
     where s.staff_id is not null
       and s.sold_at >= (make_date(p_year, p_month, 1)::timestamp at time zone 'Europe/Oslo')
       and s.sold_at <  ((make_date(p_year, p_month, 1) + interval '1 month')::timestamp at time zone 'Europe/Oslo')
     group by s.staff_id;
end $$;
revoke all on function monthly_revenue_split_by_staff(int, int) from public, anon;
grant execute on function monthly_revenue_split_by_staff(int, int) to authenticated;

notify pgrst, 'reload schema';
