-- =====================================================================
-- Sikkerhetsgjennomgang 2 (oktober 2026)
--
-- Funn og tiltak:
--  1) ANSATTE: alle kunne lese hele ansatt-tabellen uten innlogging
--     (e-post, telefon, postnummer, lønn, PIN-hash, kontrakt-lenke).
--     → Uten innlogging kan man nå bare lese det nettsiden viser
--       (navn, visningsnavn, tittel, bilde, bio, spesialiteter).
--  2) PIN: hvem som helst kunne sette ny stemple-PIN for en ansatt.
--     → Kun admin/eier.
--  3) KUNDER/BOOKINGER: alle kunne legge inn kunder og bookinger rett i
--     tabellene (utenom bookingsjekkene). Nettsiden bruker de sikre
--     booking-funksjonene, så de åpne innsettings-reglene fjernes.
--  4) KASSE-FUNKSJONER: kundesøk, dagsagenda, booking for kunde, flytting
--     av time og gavekort-oppslag krever nå kasse/admin/eier – ikke bare
--     «innlogget» (en barber-konto kunne f.eks. hente hele kundelisten).
--  5) Interne/kassa-funksjoner som manglet låsing er stengt for anonyme.
--
-- Påvirker ikke nettsiden, bookingen, Min side eller kassa.
-- Trygt å kjøre flere ganger.
-- =====================================================================

-- ---------- 1) Ansatt-kolonner for anonyme ----------
revoke select on staff from anon;
do $$
declare
  c text;
  cols text[] := array['id','full_name','display_name','title','bio','specialties',
                       'photo_url','active','employee_number','level_id','created_at'];
begin
  foreach c in array cols loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'staff' and column_name = c) then
      execute format('grant select (%I) on staff to anon', c);
    end if;
  end loop;
end $$;

-- ---------- 2) PIN kun for admin/eier ----------
create or replace function set_staff_pin(p_staff uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Kun admin kan sette PIN.';
  end if;
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN må være 4 siffer';
  end if;
  update staff set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_staff;
end $$;
revoke execute on function set_staff_pin(uuid, text) from public, anon;
grant execute on function set_staff_pin(uuid, text) to authenticated;

-- ---------- 3) Ingen åpne innsettinger i kunder/bookinger ----------
drop policy if exists customers_public_insert on customers;
drop policy if exists bookings_public_insert on bookings;

-- ---------- 4) Kasse-funksjoner krever kasse/admin/eier ----------
create or replace function shop_customer_search(p_q text)
returns table (
  id         uuid,
  full_name  text,
  phone      text,
  email      text,
  visits     int,
  last_visit timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  return query
  select
    c.id, c.full_name, c.phone, c.email,
    (select count(*)::int from bookings b
       where b.customer_id = c.id and b.status <> 'cancelled') as visits,
    (select max(b.start_at) from bookings b
       where b.customer_id = c.id and b.status <> 'cancelled') as last_visit
  from customers c
  where p_q is not null and length(trim(p_q)) >= 2
    and (
      c.full_name ilike '%' || trim(p_q) || '%'
      or coalesce(c.phone, '') ilike '%' || trim(p_q) || '%'
      or coalesce(c.email, '') ilike '%' || trim(p_q) || '%'
    )
  order by c.full_name
  limit 20;
end $$;

create or replace function day_agenda(p_date date)
returns table (
  id          uuid,
  staff_id    uuid,
  barber      text,
  start_at    timestamptz,
  end_at      timestamptz,
  status      text,
  customer    text,
  service     text,
  phone       text,
  customer_id uuid,
  email       text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  return query
  select
    b.id, b.staff_id, st.full_name,
    b.start_at, b.end_at, b.status::text,
    c.full_name, s.name, c.phone, c.id, c.email
  from bookings b
  left join staff st on st.id = b.staff_id
  left join customers c on c.id = b.customer_id
  left join services s on s.id = b.service_id
  where (b.start_at at time zone 'Europe/Oslo')::date = p_date
  order by b.start_at;
end $$;

create or replace function create_booking_for_customer(
  p_customer uuid,
  p_service text,
  p_barber text,
  p_start timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_service uuid; v_price numeric; v_dur int; v_staff uuid; v_booking uuid;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  select id, price_nok, duration_min into v_service, v_price, v_dur
    from services where name = p_service limit 1;
  select id into v_staff from staff where full_name = p_barber limit 1;

  insert into bookings (customer_id, staff_id, service_id, start_at, end_at, status, price_nok)
    values (
      p_customer, v_staff, v_service, p_start,
      p_start + make_interval(mins => coalesce(v_dur, 30)),
      'confirmed', coalesce(v_price, 0)
    )
    returning id into v_booking;

  return v_booking;
end $$;

create or replace function reschedule_booking(
  p_booking uuid,
  p_start timestamptz,
  p_barber text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dur int; v_staff uuid;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  select coalesce(s.duration_min, 30) into v_dur
    from bookings b left join services s on s.id = b.service_id
    where b.id = p_booking;
  v_dur := coalesce(v_dur, 30);

  if p_barber is not null and trim(p_barber) <> '' then
    select id into v_staff from staff where full_name = p_barber limit 1;
  end if;

  update bookings set
    start_at = p_start,
    end_at   = p_start + make_interval(mins => v_dur),
    staff_id = coalesce(v_staff, staff_id),
    status   = case when status = 'cancelled' then 'confirmed' else status end
  where id = p_booking;
end $$;

create or replace function find_gift_card(p_code text)
returns table (
  id uuid, code text, balance_nok numeric, expires_at date, expired boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  return query
  select g.id, g.code, g.balance_nok, g.expires_at,
         (g.expires_at is not null and g.expires_at < current_date) as expired
  from gift_cards g
  where g.code = trim(p_code)
     or (g.barcode is not null and g.barcode = trim(p_code))
  limit 1;
end $$;

-- Grants for funksjonene over: aldri anonyme, kun innloggede (sjekken
-- i funksjonen slipper bare kasse/admin/eier gjennom).
revoke execute on function shop_customer_search(text) from public, anon;
grant  execute on function shop_customer_search(text) to authenticated;
revoke execute on function day_agenda(date) from public, anon;
grant  execute on function day_agenda(date) to authenticated;
revoke execute on function create_booking_for_customer(uuid, text, text, timestamptz) from public, anon;
grant  execute on function create_booking_for_customer(uuid, text, text, timestamptz) to authenticated;
revoke execute on function reschedule_booking(uuid, timestamptz, text) from public, anon;
grant  execute on function reschedule_booking(uuid, timestamptz, text) to authenticated;
revoke execute on function find_gift_card(text) from public, anon;
grant  execute on function find_gift_card(text) to authenticated;

-- ---------- 5) Interne funksjoner / kassa-oppslag ----------
-- apply_member_campaign kalles bare inne i salgsfunksjonene.
revoke execute on function apply_member_campaign(uuid, uuid, uuid, numeric) from public, anon, authenticated;
-- Kassa/admin-oppslag (Min side bruker egne token-funksjoner, ikke disse).
revoke execute on function customer_membership(uuid) from public, anon;
grant  execute on function customer_membership(uuid) to authenticated;
revoke execute on function member_campaign_offers(uuid) from public, anon;
grant  execute on function member_campaign_offers(uuid) to authenticated;
revoke execute on function find_product_by_barcode(text) from public, anon;
grant  execute on function find_product_by_barcode(text) to authenticated;

notify pgrst, 'reload schema';
