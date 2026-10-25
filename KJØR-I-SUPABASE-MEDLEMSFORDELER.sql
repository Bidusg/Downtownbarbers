-- =====================================================================
-- KUNDEKLUBB-FORDELER SOM VIRKER AUTOMATISK + KRISETIME
--
--   1) Rabatt per nivå (f.eks. Platinum: 15 % på tjenester, 20 % på
--      produkter). Settes i admin → Kundeklubb.
--   2) Når en INNLOGGET kunde booker, merkes timen med nivået og rabatten.
--      I kassa trekkes rabatten automatisk – de ansatte trykker bare «Ta
--      betalt» som vanlig. (Bare innloggede: da vet vi at det er kunden selv.)
--   3) Krisetime: nivåer med «krisetime» (f.eks. Platinum) kan sende en
--      hasteforespørsel når det er fullt. Den vises øverst i kassa og
--      salongen får e-post.
--   4) Markedsføring kan sendes til ett kundeklubb-nivå.
--
--   Tar også med Fixit-besøk i nivået (customers.legacy_visits), slik at
--   rekkefølgen på SQL-filene ikke spiller noen rolle.
--
--   Trygt å kjøre flere ganger.
-- =====================================================================

-- ---------- Kolonner ----------
alter table membership_tiers add column if not exists service_discount_pct numeric(5,2) not null default 0;
alter table membership_tiers add column if not exists product_discount_pct numeric(5,2) not null default 0;
alter table membership_tiers add column if not exists crisis_booking boolean not null default false;

do $$ begin
  alter table membership_tiers add constraint membership_tiers_pct_check
    check (service_discount_pct between 0 and 100 and product_discount_pct between 0 and 100);
exception when duplicate_object then null; end $$;

alter table customers add column if not exists legacy_visits int not null default 0;

alter table bookings add column if not exists member_tier text;
alter table bookings add column if not exists member_service_pct numeric(5,2);
alter table bookings add column if not exists member_product_pct numeric(5,2);

alter table sales add column if not exists member_tier text;
alter table sales add column if not exists member_discount_nok numeric(12,2);

-- ---------- Kundens nivå (fullførte bookinger + Fixit-besøk) ----------
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
  v_next   membership_tiers;
begin
  select coalesce(sum(total_nok), 0) into v_spend
    from sales where customer_id = p_customer;
  select count(*) into v_visits
    from bookings where customer_id = p_customer and status = 'completed';
  v_visits := coalesce(v_visits, 0)
            + coalesce((select legacy_visits from customers where id = p_customer), 0);

  select * into v_tier
    from membership_tiers
   where v_spend >= min_spend or v_visits >= min_visits
   order by sort_order desc, id desc
   limit 1;

  if v_tier.id is null then
    select * into v_tier from membership_tiers order by sort_order asc, id asc limit 1;
  end if;

  select * into v_next
    from membership_tiers
   where sort_order > v_tier.sort_order
   order by sort_order asc, id asc
   limit 1;

  return query select
    v_tier.id, v_tier.name, v_tier.benefit, v_tier.color,
    v_spend, coalesce(v_visits, 0),
    v_next.name, v_next.min_spend, v_next.min_visits;
end $$;

revoke execute on function customer_membership(uuid) from public, anon;
grant  execute on function customer_membership(uuid) to authenticated;

-- ---------- Innlogget kunde: kontaktinfo + nivå (til bookingen) ----------
-- Nøkkelen er kundens egen portal-token (fra innloggings-informasjonskapselen).
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
    'crisis', coalesce(v_t.crisis_booking, false)
  );
end $$;

revoke execute on function member_profile(uuid) from public;
grant  execute on function member_profile(uuid) to anon, authenticated;

-- ---------- Merk nye bookinger med nivå-rabatt ----------
-- Bare timer som tilhører kunden med denne tokenen, er laget de siste
-- 15 minuttene og ikke er merket fra før. Returnerer antall merkede timer.
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
  update bookings
     set member_tier = v_t.name,
         member_service_pct = v_t.service_discount_pct,
         member_product_pct = v_t.product_discount_pct
   where id = any(p_bookings)
     and customer_id = v_c
     and member_tier is null
     and created_at > now() - interval '15 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function mark_member_booking(uuid, uuid[]) from public;
grant  execute on function mark_member_booking(uuid, uuid[]) to anon, authenticated;

-- ---------- Krisetime-forespørsler ----------
create table if not exists crisis_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  customer_id uuid references customers(id) on delete set null,
  name        text,
  phone       text,
  email       text,
  tier        text,
  service     text,
  wish_day    text,          -- 'i_dag' | 'i_morgen'
  wish_time   text,          -- 'nar_som_helst' | 'formiddag' | 'ettermiddag' | 'kveld'
  note        text,
  status      text not null default 'ny',   -- ny | ringt | booket | avvist
  handled_at  timestamptz,
  handled_by  uuid
);

do $$ begin
  alter table crisis_requests add constraint crisis_requests_status_check
    check (status in ('ny', 'ringt', 'booket', 'avvist'));
exception when duplicate_object then null; end $$;

create index if not exists crisis_requests_created_idx on crisis_requests (created_at desc);

alter table crisis_requests enable row level security;
drop policy if exists crisis_requests_shop on crisis_requests;
create policy crisis_requests_shop on crisis_requests
  for all to authenticated
  using (is_shop_or_admin()) with check (is_shop_or_admin());
revoke all on crisis_requests from anon;

-- Kunden sender forespørselen (bare nivåer med krisetime; maks 2 per døgn).
create or replace function request_crisis_time(
  p_token uuid, p_service text, p_day text, p_time text, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_c  customers;
  v_m  record;
  v_t  membership_tiers;
  v_id uuid;
begin
  select * into v_c from customers where portal_token = p_token limit 1;
  if v_c.id is null then raise exception 'NOT_LOGGED_IN'; end if;
  select * into v_m from customer_membership(v_c.id) limit 1;
  select * into v_t from membership_tiers where id = v_m.tier_id;
  if v_t.id is null or not coalesce(v_t.crisis_booking, false) then
    raise exception 'NOT_ALLOWED';
  end if;
  if (select count(*) from crisis_requests
       where customer_id = v_c.id and created_at > now() - interval '24 hours') >= 2 then
    raise exception 'TOO_MANY';
  end if;
  insert into crisis_requests (customer_id, name, phone, email, tier, service, wish_day, wish_time, note)
  values (v_c.id, v_c.full_name, v_c.phone, v_c.email, v_t.name,
          left(coalesce(p_service, ''), 200),
          case when p_day in ('i_dag', 'i_morgen') then p_day else 'i_dag' end,
          case when p_time in ('nar_som_helst', 'formiddag', 'ettermiddag', 'kveld') then p_time else 'nar_som_helst' end,
          nullif(left(coalesce(p_note, ''), 500), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function request_crisis_time(uuid, text, text, text, text) from public;
grant  execute on function request_crisis_time(uuid, text, text, text, text) to anon, authenticated;

-- ---------- Markedsføring: kunder på ett nivå ----------
create or replace function customers_in_tier(p_tier smallint)
returns setof uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_low smallint;
begin
  if not is_admin() then raise exception 'Ikke tilgang'; end if;
  select id into v_low from membership_tiers order by sort_order asc, id asc limit 1;
  return query
  with sp as (
    select customer_id, sum(total_nok) as s from sales
     where customer_id is not null group by customer_id
  ), vi as (
    select customer_id, count(*) as v from bookings
     where status = 'completed' and customer_id is not null group by customer_id
  ), base as (
    select c.id,
           coalesce(sp.s, 0) as s,
           coalesce(vi.v, 0) + coalesce(c.legacy_visits, 0) as v
      from customers c
      left join sp on sp.customer_id = c.id
      left join vi on vi.customer_id = c.id
  )
  select b.id
    from base b
   where coalesce(
           (select t.id from membership_tiers t
             where b.s >= t.min_spend or b.v >= t.min_visits
             order by t.sort_order desc, t.id desc limit 1),
           v_low) = p_tier;
end $$;

revoke execute on function customers_in_tier(smallint) from public, anon;
grant  execute on function customers_in_tier(smallint) to authenticated;

notify pgrst, 'reload schema';
