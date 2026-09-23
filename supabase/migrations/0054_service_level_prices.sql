-- =====================================================================
-- 0054 – PRISER OG VARIGHET PER NIVÅ
--
--   Hver ansatt får et NIVÅ (junior / barber / senior / master). Hver
--   tjeneste kan få en egen PRIS og VARIGHET per nivå. Kunden ser prisen
--   for barberen hen velger; mangler et nivå-oppsett faller vi tilbake til
--   tjenestens grunnpris/-varighet.
--
--   Endrer:
--     * staff.level (nytt felt, default 'barber')
--     * service_level_prices (ny matrise-tabell)
--     * available_slots()  – bruker nivå-varighet (påvirker ledige tider)
--     * create_booking()   – lagrer nivå-pris + nivå-varighet på bookingen
--
--   Idempotent.
-- =====================================================================

-- ---------- 1) Nivå på ansatt ----------
alter table staff
  add column if not exists level text not null default 'barber';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_level_check'
  ) then
    alter table staff
      add constraint staff_level_check
      check (level in ('junior', 'barber', 'senior', 'master'));
  end if;
end $$;

-- ---------- 2) Pris/varighet-matrise ----------
create table if not exists service_level_prices (
  service_id   uuid not null references services(id) on delete cascade,
  level        text not null check (level in ('junior', 'barber', 'senior', 'master')),
  price_nok    numeric(10, 2) not null,
  duration_min int,                       -- null = bruk tjenestens grunnvarighet
  updated_at   timestamptz not null default now(),
  primary key (service_id, level)
);

alter table service_level_prices enable row level security;

-- Offentlig lesing (booking er anonym), admin skriver.
drop policy if exists slp_public_read on service_level_prices;
create policy slp_public_read on service_level_prices
  for select using (true);

drop policy if exists slp_admin_all on service_level_prices;
create policy slp_admin_all on service_level_prices
  for all using (is_admin()) with check (is_admin());

-- ---------- 3) available_slots: bruk nivå-varighet ----------
create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_service uuid; v_dur int; v_level text; v_override int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time; v_close time;
  v_full_off boolean;
  slot time; slot_end_t time;
  slot_start timestamptz; slot_end timestamptz;
  in_work boolean;
  res text[] := '{}';
begin
  select id, level into v_staff, v_level from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;

  select id, duration_min into v_service, v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  -- Nivå-overstyrt varighet (fallback: tjenestens grunnvarighet).
  select duration_min into v_override
    from service_level_prices
   where service_id = v_service and level = v_level;
  if v_override is not null then v_dur := v_override; end if;

  v_dow := extract(dow from p_date);

  -- 1) Salongens åpningstid (0026). Stengt → ingen tider.
  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

  -- 2) Heldags fravær denne datoen → stengt.
  select
    exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date
        and e.kind = 'off' and e.start_time is null
    )
    or exists (
      select 1 from absences a
      where a.staff_id = v_staff
        and p_date between a.from_date and a.to_date
    )
  into v_full_off;
  if v_full_off then return res; end if;

  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff) into v_has_turnus;

  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
    slot_end_t := slot + make_interval(mins => v_dur);

    -- a) Innenfor barberens turnus? (uten turnus: hele åpningstiden)
    if v_has_turnus then
      in_work := exists (
        select 1 from staff_hours h
        where h.staff_id = v_staff
          and h.weekday = v_dow
          and h.week_parity in (0, v_parity)
          and slot >= h.start_time and slot_end_t <= h.end_time
      );
    else
      in_work := true;
    end if;

    -- b) Ekstravakt kan åpne slots utenfor vanlig turnus (denne datoen).
    if not in_work then
      in_work := exists (
        select 1 from staff_exceptions e
        where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
          and e.start_time is not null and e.end_time is not null
          and slot >= e.start_time and slot_end_t <= e.end_time
      );
    end if;

    -- c) Delvis fravær fjerner slots som overlapper fri-perioden.
    if in_work and exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date and e.kind = 'off'
        and e.start_time is not null and e.end_time is not null
        and slot < e.end_time and slot_end_t > e.start_time
    ) then
      in_work := false;
    end if;

    if in_work then
      slot_start := (p_date + slot) at time zone 'Europe/Oslo';
      slot_end := slot_start + make_interval(mins => v_dur);
      if slot_start > now() and not exists (
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

-- ---------- 4) create_booking: lagre nivå-pris + nivå-varighet ----------
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
  v_staff uuid; v_level text;
  v_lvl_price numeric; v_lvl_dur int;
  v_customer uuid; v_booking uuid;
  v_source text := nullif(trim(p_source), '');
begin
  select id, price_nok, duration_min into v_service, v_price, v_dur
    from services where name = p_service limit 1;
  select id, level into v_staff, v_level from staff where full_name = p_barber limit 1;

  -- Nivå-overstyrt pris/varighet (fallback: tjenestens grunnverdier).
  select price_nok, duration_min into v_lvl_price, v_lvl_dur
    from service_level_prices
   where service_id = v_service and level = v_level;
  if found then
    v_price := coalesce(v_lvl_price, v_price);
    v_dur   := coalesce(v_lvl_dur, v_dur);
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
