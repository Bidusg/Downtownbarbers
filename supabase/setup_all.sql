-- =====================================================================
-- Downtown Barbers – SAMLET OPPSETT (idempotent)
-- Trygt å kjøre om igjen uansett hva som allerede er kjørt.
-- Lim inn HELE denne fila i Supabase → SQL Editor → Run.
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------- Roller / enum ----------
do $$ begin
  create type user_role as enum ('admin','shop','staff','customer');
exception when duplicate_object then null; end $$;

-- ---------- Tabeller ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text, phone text,
  role user_role not null default 'customer',
  avatar_url text, created_at timestamptz not null default now()
);

create or replace function current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function is_shop_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','shop'));
$$;

create table if not exists staff (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  employee_number text unique, full_name text not null, title text, bio text,
  specialties text[] default '{}', photo_url text, contract_url text,
  phone text, email text, hire_date date,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists staff_hours (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references staff(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null, end_time time not null
);
create table if not exists shifts (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references staff(id) on delete cascade,
  work_date date not null, start_time time, end_time time,
  is_off boolean not null default false
);
create table if not exists absences (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references staff(id) on delete cascade,
  from_date date not null, to_date date not null, reason text
);
create table if not exists service_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null, sort_order int not null default 0
);
create table if not exists services (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references service_categories(id) on delete set null,
  name text not null, description text,
  price_nok numeric(10,2) not null default 0,
  duration_min int not null default 30,
  active boolean not null default true, sort_order int not null default 0
);
create table if not exists staff_services (
  staff_id uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null, phone text, email text, category text,
  notes text, first_visit date, created_at timestamptz not null default now()
);
do $$ begin
  create type booking_status as enum ('pending','confirmed','completed','cancelled','no_show');
exception when duplicate_object then null; end $$;
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  start_at timestamptz not null, end_at timestamptz not null,
  status booking_status not null default 'pending',
  price_nok numeric(10,2) not null default 0,
  deposit_paid boolean not null default false,
  payment_provider text, payment_ref text, notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bookings_start on bookings(start_at);
create index if not exists idx_bookings_staff on bookings(staff_id);
create table if not exists ratings (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references bookings(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  stars smallint not null check (stars between 1 and 5),
  comment text, created_at timestamptz not null default now()
);
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  name text not null, description text,
  price_nok numeric(10,2) not null default 0,
  image_url text, stock int not null default 0,
  active boolean not null default true, is_gift_card boolean not null default false
);
do $$ begin
  create type order_status as enum ('pending','paid','shipped','cancelled');
exception when duplicate_object then null; end $$;
create table if not exists product_orders (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete set null,
  status order_status not null default 'pending',
  total_nok numeric(10,2) not null default 0, created_at timestamptz not null default now()
);
create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references product_orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  quantity int not null default 1, price_nok numeric(10,2) not null default 0
);
create table if not exists gift_cards (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  initial_nok numeric(10,2) not null, balance_nok numeric(10,2) not null,
  purchased_by uuid references customers(id) on delete set null,
  created_at timestamptz not null default now(), expires_at date
);
create table if not exists sales (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references bookings(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  total_nok numeric(10,2) not null default 0, sold_at timestamptz not null default now()
);
create table if not exists sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references sales(id) on delete cascade,
  kind text not null, ref_id uuid, description text,
  quantity int not null default 1, price_nok numeric(10,2) not null default 0
);
create table if not exists cash_settlements (
  id uuid primary key default uuid_generate_v4(),
  settle_date date not null, opened_by uuid references profiles(id) on delete set null,
  total_nok numeric(10,2) not null default 0, note text, created_at timestamptz not null default now()
);
create table if not exists budgets (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid references staff(id) on delete cascade,
  year int not null, month int not null check (month between 1 and 12),
  target_nok numeric(12,2) not null default 0, unique (staff_id, year, month)
);
create table if not exists daily_targets (
  id uuid primary key default uuid_generate_v4(),
  target_date date not null unique,
  metric text not null default 'customer_count',
  target_value numeric(12,2) not null default 0
);
create table if not exists campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null, channel text not null, body text,
  scheduled_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists settings (key text primary key, value jsonb not null);

-- ---------- RLS på ----------
alter table profiles enable row level security;
alter table staff enable row level security;
alter table staff_hours enable row level security;
alter table shifts enable row level security;
alter table absences enable row level security;
alter table service_categories enable row level security;
alter table services enable row level security;
alter table staff_services enable row level security;
alter table customers enable row level security;
alter table bookings enable row level security;
alter table ratings enable row level security;
alter table products enable row level security;
alter table product_orders enable row level security;
alter table order_items enable row level security;
alter table gift_cards enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table cash_settlements enable row level security;
alter table budgets enable row level security;
alter table daily_targets enable row level security;
alter table campaigns enable row level security;
alter table settings enable row level security;

-- ---------- Policyer (idempotent: drop før create) ----------
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update using (id = auth.uid() or is_admin());
drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all using (is_admin()) with check (is_admin());

do $$ declare t text; begin
  foreach t in array array[
    'staff','staff_hours','shifts','absences','service_categories','services',
    'staff_services','customers','bookings','ratings','products','product_orders',
    'order_items','gift_cards','sales','sale_items','cash_settlements',
    'budgets','daily_targets','campaigns','settings'] loop
    execute format('drop policy if exists %I on %I;', t||'_admin_all', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin());', t||'_admin_all', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array[
    'staff','staff_hours','shifts','absences','service_categories','services',
    'staff_services','customers','bookings','ratings','products','gift_cards',
    'sales','sale_items','daily_targets'] loop
    execute format('drop policy if exists %I on %I;', t||'_shop_read', t);
    execute format('create policy %I on %I for select using (is_shop_or_admin());', t||'_shop_read', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['customers','bookings','ratings','sales','sale_items','gift_cards'] loop
    execute format('drop policy if exists %I on %I;', t||'_shop_insert', t);
    execute format('create policy %I on %I for insert with check (is_shop_or_admin());', t||'_shop_insert', t);
    execute format('drop policy if exists %I on %I;', t||'_shop_update', t);
    execute format('create policy %I on %I for update using (is_shop_or_admin());', t||'_shop_update', t);
  end loop;
end $$;

drop policy if exists services_public_read on services;
create policy services_public_read on services for select using (active = true);
drop policy if exists categories_public_read on service_categories;
create policy categories_public_read on service_categories for select using (true);
drop policy if exists staff_public_read on staff;
create policy staff_public_read on staff for select using (active = true);
drop policy if exists products_public_read on products;
create policy products_public_read on products for select using (active = true);
drop policy if exists settings_public_read on settings;
create policy settings_public_read on settings for select using (true);

-- Offentlig innsending (booking + kunder)
drop policy if exists customers_public_insert on customers;
create policy customers_public_insert on customers for insert with check (true);
drop policy if exists bookings_public_insert on bookings;
create policy bookings_public_insert on bookings for insert with check (true);

-- =====================================================================
-- SEED: innstillinger, kategorier, team, tjenester (m/ekte priser)
-- =====================================================================
insert into settings (key, value) values
  ('salon', '{"name":"Downtown Barbers","slogan":"Der presisjon møter stil","established":2018,"address":"Osterhaus'' gate 10, 0183 Oslo","phone":"+47 463 58 764"}'),
  ('opening_hours', '{"mon":["09:00","19:00"],"tue":["09:00","19:00"],"wed":["09:00","19:00"],"thu":["09:00","19:00"],"fri":["09:00","19:00"],"sat":["09:00","19:00"],"sun":null}'),
  ('social', '{"tiktok":"@downtownbarbers","instagram":"@downtownbarbersoslo","facebook":"downtownbarbersOslo"}')
on conflict (key) do nothing;

insert into service_categories (name, sort_order) values
  ('Hår & klipp', 1), ('Skjegg & grooming', 2), ('Ansikt & detalj', 3)
on conflict do nothing;

-- Rydd bort tom demokategori hvis den finnes fra tidligere og ikke har tjenester
delete from service_categories c
where c.name = 'Farge & behandling'
  and not exists (select 1 from services s where s.category_id = c.id);

insert into staff (employee_number, full_name, title, active) values
  ('DB-001','David','Master Barber',true),
  ('DB-002','Vani','Barber',true),
  ('DB-003','Soren','Barber',true),
  ('DB-004','Isak','Barber',true),
  ('DB-005','Stavros','Barber',true),
  ('DB-006','Mehetabel','Lærling',true)
on conflict (employee_number) do nothing;

insert into services (category_id, name, description, price_nok, duration_min, sort_order)
select c.id, v.name, v.descr, v.price, v.dur, v.ord
from (values
  ('Hår & klipp','Herreklipp','Klassisk herreklipp, vask og styling inkludert',350,30,1),
  ('Hår & klipp','Skin Fade','Gradert fade fra huden - vår signatur-tjeneste',450,45,2),
  ('Hår & klipp','Barneklipp','For kunder under 12 år',250,20,3),
  ('Skjegg & grooming','Skjeggtrimming','Forming, trimming og stell av skjegg',200,20,4),
  ('Skjegg & grooming','Hår + Skjegg','Full service: klipp og skjeggpleie i én sesjon',580,60,5),
  ('Skjegg & grooming','Tradisjonell barbering','Varm håndklé, skum og barberblad',350,30,6),
  ('Ansikt & detalj','Øyenbrynsvoksing','Forming og voksing av øyenbryn',150,15,7),
  ('Ansikt & detalj','Ansiktsmaske','Dyprengjørende ansiktsmaske etter barbering',250,20,8)
) as v(cat,name,descr,price,dur,ord)
join service_categories c on c.name = v.cat
where not exists (select 1 from services s where s.name = v.name);

-- =====================================================================
-- Trigger: auto-opprett profil ved ny auth-bruker
-- =====================================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, role) values (new.id, new.email, 'customer')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Fyll inn profiler for brukere som ble opprettet FØR triggeren fantes:
insert into profiles (id, email, role)
select id, email, 'customer' from auth.users
on conflict (id) do nothing;

-- =====================================================================
-- Storage-bøtte for ansatt-/produktfiler
-- =====================================================================
insert into storage.buckets (id, name, public) values ('staff-files','staff-files',true)
on conflict (id) do nothing;
drop policy if exists "staff_files_admin_insert" on storage.objects;
create policy "staff_files_admin_insert" on storage.objects
  for insert with check (bucket_id = 'staff-files' and public.is_admin());
drop policy if exists "staff_files_admin_update" on storage.objects;
create policy "staff_files_admin_update" on storage.objects
  for update using (bucket_id = 'staff-files' and public.is_admin());
drop policy if exists "staff_files_public_read" on storage.objects;
create policy "staff_files_public_read" on storage.objects
  for select using (bucket_id = 'staff-files');

-- =====================================================================
-- RPC: offentlig rating + Vipps "marker betalt" (security definer)
-- =====================================================================
create or replace function rate_booking(p_booking uuid, p_stars int, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare v_staff uuid; v_customer uuid;
begin
  if p_stars < 1 or p_stars > 5 then raise exception 'stars must be 1..5'; end if;
  select staff_id, customer_id into v_staff, v_customer from bookings where id = p_booking;
  insert into ratings (booking_id, staff_id, customer_id, stars, comment)
  values (p_booking, v_staff, v_customer, p_stars, nullif(p_comment,''));
end $$;
grant execute on function rate_booking(uuid,int,text) to anon, authenticated;

create or replace function mark_booking_paid(p_reference text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := replace(p_reference,'booking-','')::uuid;
  update bookings set deposit_paid = true, payment_provider = 'vipps', payment_ref = p_reference
   where id = v_id;
end $$;
grant execute on function mark_booking_paid(text) to anon, authenticated;

-- Robust booking-oppretting (uavhengig av insert-policyer)
create or replace function create_booking(
  p_service text, p_barber text, p_start timestamptz,
  p_name text, p_email text, p_phone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_service uuid; v_price numeric; v_dur int; v_staff uuid; v_customer uuid; v_booking uuid;
begin
  select id, price_nok, duration_min into v_service, v_price, v_dur from services where name = p_service limit 1;
  select id into v_staff from staff where full_name = p_barber limit 1;
  insert into customers (full_name, email, phone) values (p_name, p_email, p_phone) returning id into v_customer;
  insert into bookings (customer_id, staff_id, service_id, start_at, end_at, status, price_nok)
  values (v_customer, v_staff, v_service, p_start, p_start + make_interval(mins => coalesce(v_dur,30)), 'confirmed', coalesce(v_price,0))
  returning id into v_booking;
  return v_booking;
end $$;
grant execute on function create_booking(text,text,timestamptz,text,text,text) to anon, authenticated;

-- =====================================================================
-- SEED: eksempelprodukter (kun hvis butikken er tom)
-- =====================================================================
insert into products (name, description, price_nok, stock, active, is_gift_card)
select v.name, v.descr, v.price, v.stock, true, v.gc
from (values
  ('Matt Pomade','Sterkt hold, matt finish. 100 ml.',249,40,false),
  ('Skjeggolje','Pleiende olje for mykt, velduftende skjegg. 30 ml.',199,30,false),
  ('Rensende Shampoo','Daglig shampoo for hår og skjegg. 250 ml.',179,25,false),
  ('Styling Clay','Fleksibelt hold med naturlig finish. 100 ml.',229,20,false),
  ('Gavekort 500 kr','Digitalt gavekort til bruk på tjenester og produkter.',500,999,true)
) as v(name,descr,price,stock,gc)
where not exists (select 1 from products);

-- =====================================================================
-- EKTE TILGJENGELIGHET + SIKRET BETALINGSBELØP (0010)
--   available_slots: ledige starttider (Man–lør 09–19, søndag stengt),
--     tar hensyn til varighet, sperrer fortid, unngår overlapp.
--   booking_amount_ore: pris for booking i øre (Vipps henter server-side).
-- =====================================================================
create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_open time := '09:00'; v_close time := '19:00'; v_step interval := '15 minutes';
  v_dow int; slot time; slot_start timestamptz; slot_end timestamptz;
  res text[] := '{}';
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);   -- 0 = søndag
  if v_dow = 0 then return res; end if;

  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
    slot_start := (p_date + slot) at time zone 'Europe/Oslo';
    slot_end := slot_start + make_interval(mins => v_dur);
    if slot_start > now() then
      if not exists (
        select 1 from bookings b
        where b.staff_id = v_staff
          and b.status in ('pending','confirmed','completed')
          and b.start_at < slot_end and b.end_at > slot_start
      ) then
        res := res || to_char(slot, 'HH24:MI');
      end if;
    end if;
    slot := slot + v_step;
  end loop;
  return res;
end $$;
grant execute on function available_slots(text, text, date) to anon, authenticated;

create or replace function booking_amount_ore(p_booking uuid)
returns int
language sql security definer set search_path = public as $$
  select coalesce(round(price_nok * 100)::int, 0) from bookings where id = p_booking;
$$;
grant execute on function booking_amount_ore(uuid) to anon, authenticated;

-- =====================================================================
-- TIMEPÅMINNELSER (0011) – e-post + SMS ~24t før timen
-- =====================================================================
alter table bookings add column if not exists reminder_sent_at timestamptz;

create or replace function due_reminders()
returns table (
  id uuid,
  start_at timestamptz,
  customer_name text,
  email text,
  phone text,
  service_name text,
  barber_name text
)
language sql security definer set search_path = public as $$
  select
    b.id, b.start_at, c.full_name, c.email, c.phone, s.name, st.full_name
  from bookings b
  join customers c on c.id = b.customer_id
  left join services s on s.id = b.service_id
  left join staff st on st.id = b.staff_id
  where b.reminder_sent_at is null
    and b.status in ('pending','confirmed')
    and b.start_at > now()
    and b.start_at <= now() + interval '24 hours';
$$;
grant execute on function due_reminders() to anon, authenticated;

create or replace function mark_reminder_sent(p_booking uuid)
returns void
language sql security definer set search_path = public as $$
  update bookings set reminder_sent_at = now() where id = p_booking;
$$;
grant execute on function mark_reminder_sent(uuid) to anon, authenticated;

-- =====================================================================
-- STEMPLINGSSYSTEM (0012) – vakt/pause via 4-sifret PIN på shop
-- =====================================================================
create extension if not exists pgcrypto;
alter table staff add column if not exists pin_hash text;

create table if not exists shift_events (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references staff(id) on delete cascade,
  event_type text not null check (event_type in ('start','pause','resume','end')),
  created_at timestamptz not null default now(),
  note text
);
create index if not exists idx_shift_events_staff on shift_events(staff_id, created_at);
alter table shift_events enable row level security;

create or replace function active_staff_for_clock()
returns table (id uuid, full_name text, photo_url text, has_pin boolean)
language sql security definer set search_path = public as $$
  select id, full_name, photo_url, (pin_hash is not null)
  from staff where active order by full_name;
$$;
grant execute on function active_staff_for_clock() to anon, authenticated;

create or replace function set_staff_pin(p_staff uuid, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin !~ '^\d{4}$' then raise exception 'PIN må være 4 siffer'; end if;
  update staff set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_staff;
end $$;
grant execute on function set_staff_pin(uuid, text) to authenticated;

create or replace function current_shift_status(p_staff uuid)
returns text language sql security definer set search_path = public as $$
  select case
    when e.event_type in ('start','resume') then 'on'
    when e.event_type = 'pause' then 'paused'
    else 'off' end
  from shift_events e
  where e.staff_id = p_staff
    and e.created_at >= (now() at time zone 'Europe/Oslo')::date
  order by e.created_at desc limit 1;
$$;
grant execute on function current_shift_status(uuid) to anon, authenticated;

create or replace function verify_pin_status(p_staff uuid, p_pin text)
returns text language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  select pin_hash into v_hash from staff where id = p_staff and active;
  if v_hash is null then return 'ERR:no_pin'; end if;
  if crypt(p_pin, v_hash) <> v_hash then return 'ERR:wrong_pin'; end if;
  return coalesce(current_shift_status(p_staff), 'off');
end $$;
grant execute on function verify_pin_status(uuid, text) to anon, authenticated;

create or replace function record_shift_event(p_staff uuid, p_pin text, p_type text)
returns text language plpgsql security definer set search_path = public as $$
declare v_hash text; v_status text;
begin
  select pin_hash into v_hash from staff where id = p_staff and active;
  if v_hash is null then return 'ERR:no_pin'; end if;
  if crypt(p_pin, v_hash) <> v_hash then return 'ERR:wrong_pin'; end if;
  v_status := coalesce(current_shift_status(p_staff), 'off');
  if p_type = 'start'  and v_status <> 'off'    then return 'ERR:already_on'; end if;
  if p_type = 'pause'  and v_status <> 'on'     then return 'ERR:not_on'; end if;
  if p_type = 'resume' and v_status <> 'paused' then return 'ERR:not_paused'; end if;
  if p_type = 'end'    and v_status  = 'off'    then return 'ERR:not_on'; end if;
  if p_type not in ('start','pause','resume','end') then return 'ERR:bad_type'; end if;
  insert into shift_events (staff_id, event_type) values (p_staff, p_type);
  return coalesce(current_shift_status(p_staff), 'off');
end $$;
grant execute on function record_shift_event(uuid, text, text) to anon, authenticated;

create or replace function shift_summary_today()
returns table (staff_id uuid, full_name text, status text, worked_minutes int)
language sql security definer set search_path = public as $$
  with ev as (
    select e.staff_id, e.event_type, e.created_at,
           lead(e.created_at) over (partition by e.staff_id order by e.created_at) as next_at
    from shift_events e
    where e.created_at >= (now() at time zone 'Europe/Oslo')::date
  ),
  worked as (
    select staff_id,
      sum(extract(epoch from (coalesce(next_at, now()) - created_at))/60)
        filter (where event_type in ('start','resume')) as mins
    from ev group by staff_id
  )
  select s.id, s.full_name, coalesce(current_shift_status(s.id),'off'),
         coalesce(round(w.mins)::int, 0)
  from staff s left join worked w on w.staff_id = s.id
  where s.active order by s.full_name;
$$;
grant execute on function shift_summary_today() to anon, authenticated;

-- =====================================================================
-- NETTSIDE-INNSTILLINGER (0013) – admin styrer forsidens innhold
-- =====================================================================
create table if not exists site_settings (
  id int primary key default 1,
  name text not null default 'Downtown Barbers',
  slogan text not null default 'Der presisjon møter stil',
  established text not null default '2018',
  hero_title text not null default 'Klipp skarpt.',
  hero_italic text not null default 'Se enda skarpere ut.',
  intro text not null default 'Freshe klipper, skarpe fades og ekspert grooming – midt i hjertet av Oslo.',
  about_text text not null default 'Premium håndverk midt i Oslo sentrum. Presis, erfaren, rolig – vi tar hånd om detaljene før du rekker å spørre, i stolen som i speilet.',
  cta_title text not null default 'Klar for en skarpere fade?',
  cta_text text not null default 'Velg tjeneste, barber og tid på sekunder.',
  phone text not null default '+47 463 58 764',
  address text not null default 'Osterhaus'' gate 10, 0183 Oslo',
  email text,
  opening_hours jsonb not null default '[
    {"day":"Mandag–Fredag","hours":"09:00 – 19:00"},
    {"day":"Lørdag","hours":"09:00 – 18:00"},
    {"day":"Søndag","hours":"Stengt"}
  ]'::jsonb,
  accent_hex text not null default '#F47721',
  show_rating boolean not null default true,
  rating_value numeric(2,1) not null default 4.5,
  rating_count int not null default 6,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);
insert into site_settings (id) values (1) on conflict (id) do nothing;
alter table site_settings enable row level security;
drop policy if exists site_settings_read on site_settings;
create policy site_settings_read on site_settings for select using (true);
drop policy if exists site_settings_admin_update on site_settings;
create policy site_settings_admin_update on site_settings for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- =====================================================================
-- VERIFISERING – kjør gjerne dette for å bekrefte at alt finnes
-- =====================================================================
select
  (select count(*) from information_schema.tables where table_schema='public') as tabeller,
  (select count(*) from pg_policies where schemaname='public') as policyer,
  (select count(*) from information_schema.routines where routine_schema='public') as funksjoner,
  (select count(*) from services) as tjenester,
  (select count(*) from staff) as ansatte,
  (select count(*) from products) as produkter;
