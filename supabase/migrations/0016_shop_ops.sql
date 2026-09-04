-- =====================================================================
-- 0016 – SKRANKE / KASSE-OPERASJONER (front desk)
--   create_booking_for_customer: book en eksisterende kunde direkte
--                                 (drop-in, telefon, rebooking på stedet).
--   reschedule_booking:          flytt tid og/eller barber på en booking.
--   shop_customer_search:        søk opp kunde i skranken (+ besøkstall).
--   day_agenda:                  alle timer en dato, per barber (uten pris).
--   sales.payment_method:        betalingsmåte ved kasseoppgjør.
-- Idempotent. SECURITY DEFINER der skranken trenger å skrive/lese trygt.
-- =====================================================================

-- Betalingsmåte på salg (kontant/kort/vipps).
alter table sales add column if not exists payment_method text;

-- --- Book en eksisterende kunde direkte (skranke / rebooking) ---
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
grant execute on function create_booking_for_customer(uuid, text, text, timestamptz)
  to anon, authenticated;

-- --- Flytt en booking (ny tid, evt. ny barber) ---
create or replace function reschedule_booking(
  p_booking uuid,
  p_start timestamptz,
  p_barber text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dur int; v_staff uuid;
begin
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
grant execute on function reschedule_booking(uuid, timestamptz, text)
  to anon, authenticated;

-- --- Kundesøk i skranken (navn / telefon / e-post) ---
create or replace function shop_customer_search(p_q text)
returns table (
  id         uuid,
  full_name  text,
  phone      text,
  email      text,
  visits     int,
  last_visit timestamptz
)
language sql security definer set search_path = public as $$
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
$$;
grant execute on function shop_customer_search(text) to anon, authenticated;

-- --- Dagsoversikt per barber (uten pris – shop ser aldri omsetning) ---
create or replace function day_agenda(p_date date)
returns table (
  id        uuid,
  staff_id  uuid,
  barber    text,
  start_at  timestamptz,
  end_at    timestamptz,
  status    text,
  customer  text,
  service   text,
  phone     text
)
language sql security definer set search_path = public as $$
  select
    b.id, b.staff_id, st.full_name,
    b.start_at, b.end_at, b.status::text,
    c.full_name, s.name, c.phone
  from bookings b
  left join staff st on st.id = b.staff_id
  left join customers c on c.id = b.customer_id
  left join services s on s.id = b.service_id
  where (b.start_at at time zone 'Europe/Oslo')::date = p_date
  order by b.start_at;
$$;
grant execute on function day_agenda(date) to anon, authenticated;
