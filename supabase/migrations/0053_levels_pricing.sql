-- =====================================================================
-- 0053 — NIVÅER & PRISING + TJENESTE-TILKNYTNING PER ANSATT
--   Forutsetter 0052 (is_admin() dekker eier).
--
--   BESLUTTET modell (fast kr-pris per nivå × tjeneste):
--     • staff_levels: junior / barber / senior / master (datadrevet – nye
--       nivåer kan legges til uten kodeendring). staff.level_id peker hit.
--     • service_level_prices: fast pris per (tjeneste × nivå). Mangler en
--       pris for et nivå, faller vi tilbake til services.price_nok (basispris).
--     • create_booking priser nå etter valgt barbers nivå (riktig pris vises
--       automatisk på kundens booking), med basispris som fallback.
--
--   NIVÅ STYRER HVILKE TJENESTER EN ANSATT LEVERER:
--     • Vi går fra det tungvinte «ekskluderingsfilteret»
--       (staff_service_exclusions) til POSITIV tilknytning i staff_services
--       (som allerede fantes, men var ubrukt). Én rad = «denne ansatte
--       leverer denne tjenesten».
--     • Regel: en ansatt leverer tjeneste S hvis de har en staff_services-rad
--       for S, ELLER de ikke har noen rader i det hele tatt (ny ansatt →
--       leverer alt som standard, ingen regresjon).
--     • Migrasjon fyller staff_services for alle aktive ansatte ut fra dagens
--       ekskluderinger (alle aktive tjenester unntatt de ekskluderte), så
--       dagens oppførsel bevares. staff_service_exclusions beholdes urørt
--       (legacy), men brukes ikke lenger av booking/kasse.
--
--   Idempotent.
-- =====================================================================

-- --- Nivåer -----------------------------------------------------------
create table if not exists staff_levels (
  id         uuid primary key default uuid_generate_v4(),
  slug       text unique not null,
  name       text not null,
  sort_order int  not null default 0
);

insert into staff_levels (slug, name, sort_order) values
  ('junior', 'Junior', 1),
  ('barber', 'Barber', 2),
  ('senior', 'Senior', 3),
  ('master', 'Master', 4)
on conflict (slug) do nothing;

alter table staff
  add column if not exists level_id uuid references staff_levels(id) on delete set null;

alter table staff_levels enable row level security;
drop policy if exists staff_levels_admin_all on staff_levels;
create policy staff_levels_admin_all on staff_levels
  for all using (is_admin()) with check (is_admin());
drop policy if exists staff_levels_shop_read on staff_levels;
create policy staff_levels_shop_read on staff_levels
  for select using (is_shop_or_admin());

-- --- Pris per nivå × tjeneste ----------------------------------------
create table if not exists service_level_prices (
  service_id uuid not null references services(id) on delete cascade,
  level_id   uuid not null references staff_levels(id) on delete cascade,
  price_nok  numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (service_id, level_id)
);

alter table service_level_prices enable row level security;
drop policy if exists slp_admin_all on service_level_prices;
create policy slp_admin_all on service_level_prices
  for all using (is_admin()) with check (is_admin());
drop policy if exists slp_shop_read on service_level_prices;
create policy slp_shop_read on service_level_prices
  for select using (is_shop_or_admin());

-- Effektiv pris for en tjeneste på et nivå: nivåpris hvis satt, ellers
-- basispris (services.price_nok). Security definer så create_booking og den
-- offentlige booking-siden kan bruke den.
create or replace function effective_service_price(p_service uuid, p_level uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select price_nok from service_level_prices
       where service_id = p_service and level_id = p_level),
    (select price_nok from services where id = p_service),
    0
  );
$$;
grant execute on function effective_service_price(uuid, uuid) to anon, authenticated;

-- Offentlig prismatrise for booking-visning: tjenestenavn × nivå-slug → pris
-- (kun nivåpriser som faktisk er satt). Booking-veiviseren bruker denne til å
-- vise riktig pris når barber (nivå) er valgt.
create or replace function service_level_prices_public()
returns table (service_name text, level_slug text, price_nok numeric)
language sql stable security definer set search_path = public as $$
  select s.name, l.slug, p.price_nok
  from service_level_prices p
  join services s on s.id = p.service_id
  join staff_levels l on l.id = p.level_id
  where s.active;
$$;
grant execute on function service_level_prices_public() to anon, authenticated;

-- Aktive barberes nivå (navn → nivå-slug) for booking-visning.
create or replace function staff_levels_public()
returns table (barber_name text, level_slug text)
language sql stable security definer set search_path = public as $$
  select st.full_name, l.slug
  from staff st
  join staff_levels l on l.id = st.level_id
  where st.active;
$$;
grant execute on function staff_levels_public() to anon, authenticated;

-- --- Positiv tjeneste-tilknytning (erstatter ekskluderingsfilteret) ---
-- Fyll staff_services for alle aktive ansatte ut fra dagens ekskluderinger,
-- slik at dagens oppførsel bevares. Kun der ansatt ikke allerede har rader
-- (idempotent – trygt å kjøre flere ganger).
insert into staff_services (staff_id, service_id)
select st.id, s.id
from staff st
cross join services s
where st.active
  and s.active
  and not exists (
    select 1 from staff_service_exclusions x
    where x.staff_id = st.id and x.service_id = s.id
  )
  and not exists (
    select 1 from staff_services ss where ss.staff_id = st.id
  )
on conflict (staff_id, service_id) do nothing;

-- Shop kan lese staff_services (booking-filter/kasse). Admin har full tilgang.
alter table staff_services enable row level security;
drop policy if exists staff_services_admin_all on staff_services;
create policy staff_services_admin_all on staff_services
  for all using (is_admin()) with check (is_admin());
drop policy if exists staff_services_shop_read on staff_services;
create policy staff_services_shop_read on staff_services
  for select using (is_shop_or_admin());

-- Offentlig liste over barbere som IKKE leverer en tjeneste (for
-- booking-veiviseren, som filtrerer barber-lista). Regel: en ansatt uten
-- noen rader leverer ALT (ny ansatt), ellers kun tjenestene de har rad for.
-- Denne returnerer «ikke-leverandørene» slik at booking-filteret er uendret.
create or replace function service_non_providers_public()
returns table (service_name text, barber_name text)
language sql stable security definer set search_path = public as $$
  select s.name, st.full_name
  from services s
  join staff st on st.active
  where s.active
    and exists (select 1 from staff_services ss where ss.staff_id = st.id)
    and not exists (
      select 1 from staff_services ss2
      where ss2.staff_id = st.id and ss2.service_id = s.id
    );
$$;
grant execute on function service_non_providers_public() to anon, authenticated;

-- --- create_booking: pris etter valgt barbers nivå -------------------
-- Identisk med 0020 bortsett fra at prisen nå slås opp via
-- effective_service_price(tjeneste, barbers nivå), med basispris som fallback.
create or replace function create_booking(
  p_service text,
  p_barber text,
  p_start timestamptz,
  p_name text,
  p_email text,
  p_phone text,
  p_source text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_service uuid; v_price numeric; v_dur int;
  v_staff uuid; v_level uuid; v_customer uuid; v_booking uuid;
  v_source text := nullif(trim(p_source), '');
begin
  select id, price_nok, duration_min into v_service, v_price, v_dur
    from services where name = p_service limit 1;
  select id, level_id into v_staff, v_level from staff where full_name = p_barber limit 1;

  -- Nivåpris hvis barber har nivå + nivåpris finnes; ellers basispris.
  if v_service is not null and v_level is not null then
    v_price := effective_service_price(v_service, v_level);
  end if;

  -- Finn eksisterende kunde: først e-post, ellers telefon (uten mellomrom).
  if p_email is not null and trim(p_email) <> '' then
    select id into v_customer from customers
      where lower(trim(email)) = lower(trim(p_email))
      limit 1;
  end if;
  if v_customer is null and p_phone is not null and trim(p_phone) <> '' then
    select id into v_customer from customers
      where regexp_replace(coalesce(phone, ''), '\s', '', 'g') = regexp_replace(p_phone, '\s', '', 'g')
      limit 1;
  end if;

  if v_customer is null then
    insert into customers (full_name, email, phone, source)
      values (p_name, p_email, p_phone, v_source)
      returning id into v_customer;
  else
    update customers set
      full_name = coalesce(nullif(trim(p_name), ''),  full_name),
      phone     = coalesce(nullif(trim(p_phone), ''), phone),
      email     = coalesce(nullif(trim(p_email), ''), email),
      source    = coalesce(source, v_source)
    where id = v_customer;
  end if;

  insert into bookings (customer_id, staff_id, service_id, start_at, end_at, status, price_nok)
    values (
      v_customer, v_staff, v_service, p_start,
      p_start + make_interval(mins => coalesce(v_dur, 30)),
      'confirmed', coalesce(v_price, 0)
    )
    returning id into v_booking;

  return v_booking;
end $$;

grant execute on function create_booking(text, text, timestamptz, text, text, text, text)
  to anon, authenticated;
