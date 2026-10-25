-- =====================================================================
-- KUNDEKLUBB: NIVÅ ETTER DE SISTE 12 MÅNEDENE + LØNNSOMME FORDELER
--   Krever KJØR-I-SUPABASE-MEDLEMSFORDELER.sql først.
--
--   1) Platinum-kunder i dag (etter gammel regel) BEHOLDER Platinum ut 2026.
--   2) Nye terskler og fordeler (se tabellen under).
--   3) Nivået regnes nå av aktivitet de SISTE 12 MÅNEDENE, ikke livstid:
--        besøk  = fullførte bookinger etter Fixit-skillet (3.10.2026)
--               + Fixit-besøk regnet om til et snitt per år, for den delen
--                 av 12-månedersvinduet som ligger før skillet
--        forbruk = salg etter skillet (Fixit har ikke forbruk per kunde)
--      Om et år (oktober 2027) er alt ekte data, og Fixit-delen faller bort.
--   4) Tjenesterabatt gjelder bare timer mandag–fredag med start før kl. 15
--      (når stolene ellers står ledige). Produktrabatt gjelder alltid.
--
--   Nivåene matches på navn (Platinum, Gull, Sølv, Bronse, Blå).
--   Trygt å kjøre flere ganger (låsen settes bare én gang).
-- =====================================================================

-- ---------- Kolonner ----------
alter table membership_tiers add column if not exists service_offpeak_only boolean not null default true;
alter table customers add column if not exists tier_locked_id smallint;
alter table customers add column if not exists tier_locked_until date;
alter table customers add column if not exists first_visit date;

-- ---------- 1) Behold Platinum ut 2026 (gammel regel: livstid) ----------
-- Kjøres bare så lenge ingen er låst ennå, så nye kjøringer ikke endrer noe.
do $$
declare
  v_top membership_tiers;
begin
  if exists (select 1 from customers where tier_locked_id is not null) then
    return;
  end if;
  select * into v_top from membership_tiers where lower(name) = 'platinum' limit 1;
  if v_top.id is null then return; end if;
  update customers c
     set tier_locked_id = v_top.id,
         tier_locked_until = date '2026-12-31'
    from (
      select cu.id,
             coalesce((select sum(total_nok) from sales s where s.customer_id = cu.id), 0) as spend,
             coalesce((select count(*) from bookings b where b.customer_id = cu.id and b.status = 'completed'), 0)
               + coalesce(cu.legacy_visits, 0) as visits
        from customers cu
    ) x
   where x.id = c.id
     and (x.spend >= v_top.min_spend or x.visits >= v_top.min_visits);
end $$;

-- ---------- 2) Nye terskler og fordeler ----------
update membership_tiers set min_spend = 9000, min_visits = 14,
       service_discount_pct = 10, product_discount_pct = 20, crisis_booking = true, service_offpeak_only = true,
       benefit = '10 % på tjenester hverdager før kl. 15 + 20 % på produkter + krisetime når det er fullt'
 where lower(name) = 'platinum';
update membership_tiers set min_spend = 6500, min_visits = 10,
       service_discount_pct = 5, product_discount_pct = 15, crisis_booking = false, service_offpeak_only = true,
       benefit = '5 % på tjenester hverdager før kl. 15 + 15 % på produkter'
 where lower(name) = 'gull';
update membership_tiers set min_spend = 4000, min_visits = 6,
       service_discount_pct = 0, product_discount_pct = 10, crisis_booking = false,
       benefit = '10 % på produkter'
 where lower(name) in ('sølv', 'solv');
update membership_tiers set min_spend = 1800, min_visits = 3,
       service_discount_pct = 0, product_discount_pct = 0, crisis_booking = false,
       benefit = 'Ta med en venn: vennen får 30 % på første besøk'
 where lower(name) = 'bronse';
update membership_tiers set min_spend = 0, min_visits = 0,
       service_discount_pct = 0, product_discount_pct = 0, crisis_booking = false,
       benefit = 'Velkommen som medlem!'
 where lower(name) in ('blå', 'bla');

-- ---------- 3) Aktivitet siste 12 måneder for alle kunder ----------
-- Én kilde til sannhet: brukes av kundekortet, Min side, bookingen, kassa
-- og markedsføring.
create or replace function customer_activity_12m()
returns table(customer_id uuid, spend numeric, visits int)
language sql stable security definer set search_path = public as $$
  with params as (
    select date '2026-10-03' as cutover,
           (now() - interval '12 months')::date as win_start
  ),
  sp as (
    select s.customer_id, sum(s.total_nok) as s
      from sales s, params p
     where s.customer_id is not null
       and s.sold_at > greatest(p.win_start, p.cutover)::timestamptz
     group by s.customer_id
  ),
  vi as (
    select b.customer_id, count(*) as v
      from bookings b, params p
     where b.status = 'completed' and b.customer_id is not null
       and b.start_at > greatest(p.win_start, p.cutover)::timestamptz
     group by b.customer_id
  )
  select c.id,
         coalesce(sp.s, 0),
         (coalesce(vi.v, 0)
          + case
              when coalesce(c.legacy_visits, 0) > 0 and p.win_start < p.cutover then
                round(
                  c.legacy_visits
                  / greatest(1.0, (p.cutover - coalesce(c.first_visit, date '2016-01-01')) / 365.25)
                  * (p.cutover - p.win_start) / 365.25
                )
              else 0
            end)::int
    from customers c
    cross join params p
    left join sp on sp.customer_id = c.id
    left join vi on vi.customer_id = c.id;
$$;

revoke execute on function customer_activity_12m() from public, anon;

-- Nivå for alle kunder (inkl. låst Platinum ut 2026).
create or replace function customer_tiers()
returns table(customer_id uuid, tier_id smallint, spend numeric, visits int)
language sql stable security definer set search_path = public as $$
  with a as (select * from customer_activity_12m()),
  low as (select id from membership_tiers order by sort_order asc, id asc limit 1),
  calc as (
    select a.customer_id, a.spend, a.visits,
           coalesce(
             (select t.id from membership_tiers t
               where a.spend >= t.min_spend or a.visits >= t.min_visits
               order by t.sort_order desc, t.id desc limit 1),
             (select id from low)) as tid
      from a
  )
  select c.customer_id,
         case
           when cu.tier_locked_until >= current_date and lt.id is not null
                and lt.sort_order > (select sort_order from membership_tiers where id = c.tid)
             then lt.id
           else c.tid
         end,
         c.spend, c.visits
    from calc c
    join customers cu on cu.id = c.customer_id
    left join membership_tiers lt on lt.id = cu.tier_locked_id;
$$;

revoke execute on function customer_tiers() from public, anon;

-- Én kunde (kundekort, Min side, booking, kassa).
create or replace function customer_membership(p_customer uuid)
returns table(
  tier_id        smallint,
  tier_name      text,
  benefit        text,
  color          text,
  spend          numeric,
  visits         int,
  next_tier_name text,
  next_min_spend numeric,
  next_min_visits int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_spend  numeric;
  v_visits int;
  v_tier   membership_tiers;
  v_lock   membership_tiers;
  v_next   membership_tiers;
  v_cust   customers;
begin
  select a.spend, a.visits into v_spend, v_visits
    from customer_activity_12m() a where a.customer_id = p_customer;
  v_spend := coalesce(v_spend, 0);
  v_visits := coalesce(v_visits, 0);

  select * into v_tier
    from membership_tiers
   where v_spend >= min_spend or v_visits >= min_visits
   order by sort_order desc, id desc
   limit 1;
  if v_tier.id is null then
    select * into v_tier from membership_tiers order by sort_order asc, id asc limit 1;
  end if;

  -- Låst nivå (f.eks. Platinum ut 2026) vinner hvis det er høyere.
  select * into v_cust from customers where id = p_customer;
  if v_cust.tier_locked_until >= current_date then
    select * into v_lock from membership_tiers where id = v_cust.tier_locked_id;
    if v_lock.id is not null and v_lock.sort_order > v_tier.sort_order then
      v_tier := v_lock;
    end if;
  end if;

  select * into v_next
    from membership_tiers
   where sort_order > v_tier.sort_order
   order by sort_order asc, id asc
   limit 1;

  return query select
    v_tier.id, v_tier.name, v_tier.benefit, v_tier.color,
    v_spend, v_visits,
    v_next.name, v_next.min_spend, v_next.min_visits;
end $$;

revoke execute on function customer_membership(uuid) from public, anon;
grant  execute on function customer_membership(uuid) to authenticated;

-- Antall kunder per nivå (admin → Kundeklubb).
create or replace function membership_counts()
returns table(tier_id smallint, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Ikke tilgang'; end if;
  return query select t.tier_id, count(*)::bigint from customer_tiers() t group by t.tier_id;
end $$;

revoke execute on function membership_counts() from public, anon;
grant  execute on function membership_counts() to authenticated;

-- Markedsføring: kunder på ett nivå.
create or replace function customers_in_tier(p_tier smallint)
returns setof uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Ikke tilgang'; end if;
  return query select t.customer_id from customer_tiers() t where t.tier_id = p_tier;
end $$;

revoke execute on function customers_in_tier(smallint) from public, anon;
grant  execute on function customers_in_tier(smallint) to authenticated;

-- ---------- 4) Innlogget kunde + merking av nye bookinger ----------
create or replace function member_profile(p_token uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_c customers;
  v_m record;
  v_t membership_tiers;
begin
  select * into v_c from customers where portal_token = p_token limit 1;
  if v_c.id is null then return null; end if;
  select * into v_m from customer_membership(v_c.id) limit 1;
  select * into v_t from membership_tiers where id = v_m.tier_id;
  return json_build_object(
    'full_name', v_c.full_name,
    'email', v_c.email,
    'phone', v_c.phone,
    'tier_id', v_t.id,
    'tier_name', v_t.name,
    'service_pct', coalesce(v_t.service_discount_pct, 0),
    'product_pct', coalesce(v_t.product_discount_pct, 0),
    'service_offpeak', coalesce(v_t.service_offpeak_only, true),
    'crisis', coalesce(v_t.crisis_booking, false)
  );
end $$;

revoke execute on function member_profile(uuid) from public;
grant  execute on function member_profile(uuid) to anon, authenticated;

-- Tjenesterabatten settes bare på timer man–fre som starter før kl. 15
-- (norsk tid) når nivået har «bare ledige tider». Produktrabatt alltid.
create or replace function mark_member_booking(p_token uuid, p_bookings uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_c   uuid;
  v_m   record;
  v_t   membership_tiers;
  v_n   int;
begin
  select id into v_c from customers where portal_token = p_token limit 1;
  if v_c is null then return 0; end if;
  select * into v_m from customer_membership(v_c) limit 1;
  select * into v_t from membership_tiers where id = v_m.tier_id;
  if v_t.id is null
     or (coalesce(v_t.service_discount_pct, 0) = 0 and coalesce(v_t.product_discount_pct, 0) = 0) then
    return 0;
  end if;
  update bookings b
     set member_tier = v_t.name,
         member_service_pct = case
           when not coalesce(v_t.service_offpeak_only, true) then v_t.service_discount_pct
           when extract(isodow from b.start_at at time zone 'Europe/Oslo') between 1 and 5
                and (b.start_at at time zone 'Europe/Oslo')::time < time '15:00'
             then v_t.service_discount_pct
           else 0
         end,
         member_product_pct = v_t.product_discount_pct
   where b.id = any(p_bookings)
     and b.customer_id = v_c
     and b.member_tier is null
     and b.created_at > now() - interval '15 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function mark_member_booking(uuid, uuid[]) from public;
grant  execute on function mark_member_booking(uuid, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------- Oppsummering: kunder per nivå med de nye reglene ----------
-- kunder_naa      = med Platinum-låsen ut 2026
-- kunder_fra_2027 = når låsen er gått ut (bare siste 12 måneder teller)
with raw as (
  select a.customer_id,
         coalesce(
           (select t.id from membership_tiers t
             where a.spend >= t.min_spend or a.visits >= t.min_visits
             order by t.sort_order desc, t.id desc limit 1),
           (select id from membership_tiers order by sort_order asc, id asc limit 1)) as tid
    from customer_activity_12m() a
),
naa as (select tier_id, count(*) as n from customer_tiers() group by tier_id),
senere as (select tid, count(*) as n from raw group by tid)
select t.name          as nivaa,
       t.min_visits    as besok_siste_12_mnd,
       t.min_spend     as eller_forbruk_kr,
       coalesce(naa.n, 0)    as kunder_naa,
       coalesce(senere.n, 0) as kunder_fra_2027
  from membership_tiers t
  left join naa on naa.tier_id = t.id
  left join senere on senere.tid = t.id
 order by t.sort_order desc;
