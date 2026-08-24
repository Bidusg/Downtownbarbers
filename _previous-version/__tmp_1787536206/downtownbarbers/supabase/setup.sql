-- Downtown Barbers – samlet oppsett (migrasjon + seed)

-- =====================================================================
-- Downtown Barbers – Databaseskjema (init)
-- Postgres / Supabase
-- Fase 1: roller, ansatte, tjenester, booking, kunder, økonomi
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =====================================================================
-- ROLLER OG PROFILER
-- =====================================================================

-- Systemroller. Vi starter med admin + shop; staff/customer er forberedt.
do $$ begin
  create type user_role as enum ('admin', 'shop', 'staff', 'customer');
exception when duplicate_object then null; end $$;

-- Profil per innlogget bruker (kobles til auth.users i Supabase)
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  role        user_role not null default 'customer',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Hjelpefunksjon: hent rollen til innlogget bruker (brukes i RLS)
create or replace function current_role_name()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- shop ELLER admin (operativ tilgang)
create or replace function is_shop_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','shop'));
$$;

-- =====================================================================
-- ANSATTE (registrerte ansatte med ansattnr og kontrakt)
-- =====================================================================

create table if not exists staff (
  id              uuid primary key default uuid_generate_v4(),
  profile_id      uuid references profiles(id) on delete set null, -- settes når ansatt får innlogging (senere)
  employee_number text unique,                 -- ansattnr (påkrevd ved opprettelse i UI)
  full_name       text not null,
  title           text,                        -- barber / master barber / lærling
  bio             text,
  specialties     text[] default '{}',
  photo_url       text,                        -- bilde (Supabase Storage)
  contract_url    text,                        -- kontrakt-fil (Supabase Storage)
  phone           text,
  email           text,
  hire_date       date,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Ukentlig arbeidstid-mal (turnus-grunnlag) – styrer booking-tilgjengelighet
create table if not exists staff_hours (
  id         uuid primary key default uuid_generate_v4(),
  staff_id   uuid not null references staff(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6), -- 0 = søndag
  start_time time not null,
  end_time   time not null
);

-- Konkrete vakter/avvik (overstyrer malen for en dato)
create table if not exists shifts (
  id         uuid primary key default uuid_generate_v4(),
  staff_id   uuid not null references staff(id) on delete cascade,
  work_date  date not null,
  start_time time,
  end_time   time,
  is_off     boolean not null default false
);

-- Fravær
create table if not exists absences (
  id         uuid primary key default uuid_generate_v4(),
  staff_id   uuid not null references staff(id) on delete cascade,
  from_date  date not null,
  to_date    date not null,
  reason     text
);

-- =====================================================================
-- TJENESTER / BEHANDLINGER
-- =====================================================================

create table if not exists service_categories (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  sort_order int not null default 0
);

create table if not exists services (
  id           uuid primary key default uuid_generate_v4(),
  category_id  uuid references service_categories(id) on delete set null,
  name         text not null,
  description  text,
  price_nok    numeric(10,2) not null default 0,
  duration_min int not null default 30,
  active       boolean not null default true,
  sort_order   int not null default 0
);

-- Hvilke ansatte utfører hvilke tjenester
create table if not exists staff_services (
  staff_id   uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);

-- =====================================================================
-- KUNDER (kundekartotek / CRM)
-- =====================================================================

create table if not exists customers (
  id            uuid primary key default uuid_generate_v4(),
  profile_id    uuid references profiles(id) on delete set null, -- hvis kunden har egen konto
  full_name     text not null,
  phone         text,
  email         text,
  category      text,           -- kundekategori
  notes         text,
  first_visit   date,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- BOOKING
-- =====================================================================

do $$ begin
  create type booking_status as enum ('pending','confirmed','completed','cancelled','no_show');
exception when duplicate_object then null; end $$;

create table if not exists bookings (
  id                uuid primary key default uuid_generate_v4(),
  customer_id       uuid references customers(id) on delete set null,
  staff_id          uuid references staff(id) on delete set null,
  service_id        uuid references services(id) on delete set null,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  status            booking_status not null default 'pending',
  price_nok         numeric(10,2) not null default 0,
  deposit_paid      boolean not null default false,
  payment_provider  text,        -- 'stripe' | 'vipps' | null
  payment_ref       text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_bookings_start on bookings(start_at);
create index if not exists idx_bookings_staff on bookings(staff_id);

-- =====================================================================
-- RATING / ANMELDELSER
-- =====================================================================

create table if not exists ratings (
  id          uuid primary key default uuid_generate_v4(),
  booking_id  uuid references bookings(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  staff_id    uuid references staff(id) on delete set null,
  stars       smallint not null check (stars between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- PRODUKTER / NETTBUTIKK / GAVEKORT
-- =====================================================================

create table if not exists products (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  description  text,
  price_nok    numeric(10,2) not null default 0,
  image_url    text,
  stock        int not null default 0,
  active       boolean not null default true,
  is_gift_card boolean not null default false
);

do $$ begin
  create type order_status as enum ('pending','paid','shipped','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists product_orders (
  id           uuid primary key default uuid_generate_v4(),
  customer_id  uuid references customers(id) on delete set null,
  status       order_status not null default 'pending',
  total_nok    numeric(10,2) not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists order_items (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references product_orders(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  quantity    int not null default 1,
  price_nok   numeric(10,2) not null default 0
);

create table if not exists gift_cards (
  id             uuid primary key default uuid_generate_v4(),
  code           text unique not null,
  initial_nok    numeric(10,2) not null,
  balance_nok    numeric(10,2) not null,
  purchased_by   uuid references customers(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     date
);

-- =====================================================================
-- SALG / KASSEOPPGJØR
-- =====================================================================

create table if not exists sales (
  id          uuid primary key default uuid_generate_v4(),
  booking_id  uuid references bookings(id) on delete set null,
  staff_id    uuid references staff(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  total_nok   numeric(10,2) not null default 0,
  sold_at     timestamptz not null default now()
);

create table if not exists sale_items (
  id          uuid primary key default uuid_generate_v4(),
  sale_id     uuid not null references sales(id) on delete cascade,
  kind        text not null,        -- 'service' | 'product' | 'giftcard'
  ref_id      uuid,
  description text,
  quantity    int not null default 1,
  price_nok   numeric(10,2) not null default 0
);

create table if not exists cash_settlements (
  id            uuid primary key default uuid_generate_v4(),
  settle_date   date not null,
  opened_by     uuid references profiles(id) on delete set null,
  total_nok     numeric(10,2) not null default 0,
  note          text,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- BUDSJETT / MÅL / DAGSMÅL (grunnlag for fremdriftsbarer)
-- =====================================================================

-- Budsjett/mål per ansatt per måned (SENSITIVT – admin only)
create table if not exists budgets (
  id          uuid primary key default uuid_generate_v4(),
  staff_id    uuid references staff(id) on delete cascade,
  year        int not null,
  month       int not null check (month between 1 and 12),
  target_nok  numeric(12,2) not null default 0,
  unique (staff_id, year, month)
);

-- Shop sitt daglige mål (fremdriftsbar for skranke-kontoen)
--   metric = 'customer_count' (fase 1) eller 'revenue' (senere)
create table if not exists daily_targets (
  id           uuid primary key default uuid_generate_v4(),
  target_date  date not null unique,
  metric       text not null default 'customer_count',
  target_value numeric(12,2) not null default 0
);

-- =====================================================================
-- MARKEDSFØRING
-- =====================================================================

create table if not exists campaigns (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  channel     text not null,        -- 'sms' | 'email'
  body        text,
  scheduled_at timestamptz,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- INNSTILLINGER
-- =====================================================================

create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- Prinsipp:
--   admin  -> alt
--   shop   -> operative tabeller (booking, kunder, tjenester(les), salg, gavekort)
--   shop/staff -> IKKE budsjett, mål, kasseoppgjør-aggregater (SENSITIVT)
-- =====================================================================

alter table profiles          enable row level security;
alter table staff             enable row level security;
alter table staff_hours       enable row level security;
alter table shifts            enable row level security;
alter table absences          enable row level security;
alter table service_categories enable row level security;
alter table services          enable row level security;
alter table staff_services    enable row level security;
alter table customers         enable row level security;
alter table bookings          enable row level security;
alter table ratings           enable row level security;
alter table products          enable row level security;
alter table product_orders    enable row level security;
alter table order_items       enable row level security;
alter table gift_cards        enable row level security;
alter table sales             enable row level security;
alter table sale_items        enable row level security;
alter table cash_settlements  enable row level security;
alter table budgets           enable row level security;
alter table daily_targets     enable row level security;
alter table campaigns         enable row level security;
alter table settings          enable row level security;

-- Egen profil: kan lese/oppdatere seg selv; admin ser alle
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid() or is_admin());
create policy profiles_admin_all on profiles for all using (is_admin()) with check (is_admin());

-- Admin har full tilgang på alt (én policy per tabell)
do $$
declare t text;
begin
  foreach t in array array[
    'staff','staff_hours','shifts','absences','service_categories','services',
    'staff_services','customers','bookings','ratings','products','product_orders',
    'order_items','gift_cards','sales','sale_items','cash_settlements',
    'budgets','daily_targets','campaigns','settings'
  ]
  loop
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin());', t||'_admin_all', t);
  end loop;
end $$;

-- SHOP: operativ lese/skrive-tilgang (uten sensitive økonomitabeller)
do $$
declare t text;
begin
  foreach t in array array[
    'staff','staff_hours','shifts','absences','service_categories','services',
    'staff_services','customers','bookings','ratings','products','gift_cards',
    'sales','sale_items','daily_targets'
  ]
  loop
    execute format('create policy %I on %I for select using (is_shop_or_admin());', t||'_shop_read', t);
  end loop;
end $$;

-- SHOP kan skrive på de operative tabellene som trengs ved skranken
do $$
declare t text;
begin
  foreach t in array array['customers','bookings','ratings','sales','sale_items','gift_cards']
  loop
    execute format('create policy %I on %I for insert with check (is_shop_or_admin());', t||'_shop_insert', t);
    execute format('create policy %I on %I for update using (is_shop_or_admin());', t||'_shop_update', t);
  end loop;
end $$;

-- MERK: budgets, cash_settlements, product_orders, order_items, campaigns
--        har KUN admin-policy -> shop/staff får ingen tilgang (sensitivt).

-- Offentlig lesetilgang til det kundesiden trenger (anon):
create policy services_public_read      on services            for select using (active = true);
create policy categories_public_read    on service_categories  for select using (true);
create policy staff_public_read         on staff               for select using (active = true);
create policy products_public_read      on products            for select using (active = true);
create policy settings_public_read      on settings            for select using (true);

-- ===== SEED =====
-- =====================================================================
-- Seed – Downtown Barbers grunndata
-- (Kjøres etter 0001_init.sql. Priser/varighet er PLASSHOLDERE til ekte prisliste er klar.)
-- =====================================================================

-- Innstillinger
insert into settings (key, value) values
  ('salon', '{"name":"Downtown Barbers","slogan":"Der presisjon møter stil","established":2018,"address":"Osterhaus'' gate 10, 0183 Oslo","phone":"+47 463 58 764"}'),
  ('opening_hours', '{"mon":["09:00","19:00"],"tue":["09:00","19:00"],"wed":["09:00","19:00"],"thu":["09:00","19:00"],"fri":["09:00","19:00"],"sat":["09:00","19:00"],"sun":null}'),
  ('social', '{"tiktok":"@downtownbarbers","instagram":"@downtownbarbersoslo","facebook":"downtownbarbersOslo"}')
on conflict (key) do nothing;

-- Tjenestekategorier (fra dagens Fixit/nettside)
insert into service_categories (name, sort_order) values
  ('Hår & klipp', 1),
  ('Skjegg & grooming', 2),
  ('Ansikt & detalj', 3),
  ('Farge & behandling', 4)
on conflict do nothing;

-- Team (ansattnr og kontrakt fylles inn via admin senere; priser er plassholdere)
insert into staff (employee_number, full_name, title, active) values
  ('DB-001', 'David',      'Master Barber', true),
  ('DB-002', 'Vani',       'Barber',        true),
  ('DB-003', 'Soren',      'Barber',        true),
  ('DB-004', 'Isak',       'Barber',        true),
  ('DB-005', 'Stavros',    'Barber',        true),
  ('DB-006', 'Mehetabel',  'Lærling',       true)
on conflict (employee_number) do nothing;
