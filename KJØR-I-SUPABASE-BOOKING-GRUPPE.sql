-- =====================================================================
-- KJØR-I-SUPABASE-BOOKING-GRUPPE.sql   (Steg 1 av handlekurv-booking)
--
--   ADDITIV og trygg: rører IKKE eksisterende create_booking/available_slots.
--   Legger til grunnmuren for å booke flere tjenester/personer + tillegg:
--     1) bookings.group_id + person_label, og booking_addons-tabell.
--     2) available_slots_dur(...) – ledige starttider for en VILKÅRLIG varighet
--        (kopi av available_slots, men tar minutter i stedet for tjeneste).
--        Brukes til sum-av-varigheter (én person etter hverandre) og tillegg.
--     3) create_booking_line(...) – lager én booking (gjenbruker create_booking)
--        og kobler den til en gruppe + legger på tillegg (tid + pris).
--
--   Idempotent (create or replace / if not exists).
-- =====================================================================

-- 1) ------------------------------------------------- Skjema: gruppe + tillegg
alter table bookings add column if not exists group_id uuid;
alter table bookings add column if not exists person_label text;
create index if not exists bookings_group_idx on bookings(group_id);

create table if not exists booking_addons (
  id         uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references bookings(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  name       text not null,
  price_nok  numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists booking_addons_booking_idx on booking_addons(booking_id);

alter table booking_addons enable row level security;
drop policy if exists booking_addons_admin_all on booking_addons;
create policy booking_addons_admin_all on booking_addons
  for all using (is_admin()) with check (is_admin());
drop policy if exists booking_addons_shop_read on booking_addons;
create policy booking_addons_shop_read on booking_addons
  for select using (is_shop_or_admin());

-- 2) ---------------------------------- Ledige tider for vilkårlig varighet (min)
--    Identisk logikk som available_slots (0055), men duration kommer som param.
create or replace function available_slots_dur(
  p_barber text, p_minutes int, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time; v_close time;
  v_full_off boolean;
  slot time; slot_end_t time;
  slot_start timestamptz; slot_end timestamptz;
  in_work boolean;
  res text[] := '{}';
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;
  v_dur := greatest(5, coalesce(p_minutes, 30));

  v_dow := extract(dow from p_date);

  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

  if exists (
    select 1 from booking_blocks bb
    where bb.block_date = p_date and bb.start_time is null
  ) then
    return res;
  end if;

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

    if not in_work then
      in_work := exists (
        select 1 from staff_exceptions e
        where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
          and e.start_time is not null and e.end_time is not null
          and slot >= e.start_time and slot_end_t <= e.end_time
      );
    end if;

    if in_work and exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date and e.kind = 'off'
        and e.start_time is not null and e.end_time is not null
        and slot < e.end_time and slot_end_t > e.start_time
    ) then
      in_work := false;
    end if;

    if in_work and exists (
      select 1 from booking_blocks bb
      where bb.block_date = p_date
        and bb.start_time is not null and bb.end_time is not null
        and slot < bb.end_time and slot_end_t > bb.start_time
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
grant execute on function available_slots_dur(text, int, date) to anon, authenticated;

-- Intervall-variant (ett kall for flere datoer).
create or replace function available_slots_dur_range(
  p_barber text, p_minutes int, p_from date, p_to date
) returns table(slot_date date, slot_time text)
language plpgsql security definer set search_path = public, extensions as $$
declare d date := p_from;
begin
  if p_to < p_from or p_to - p_from > 60 then return; end if;
  while d <= p_to loop
    return query select d, unnest(available_slots_dur(p_barber, p_minutes, d));
    d := d + 1;
  end loop;
end $$;
grant execute on function available_slots_dur_range(text, int, date, date) to anon, authenticated;

-- 3) ------------------------------- Lag én booking i en gruppe + legg på tillegg
--    Gjenbruker create_booking (kunde-matching, nivåpris, innsetting), og
--    kobler så raden til gruppa + legger på tillegg (tid + pris). Alt skjer i
--    én SECURITY DEFINER-funksjon, så vi eksponerer ingen fri-endrings-RPC.
create or replace function create_booking_line(
  p_service text, p_barber text, p_start timestamptz,
  p_name text, p_email text, p_phone text, p_source text,
  p_group uuid, p_person text, p_addons uuid[], p_extra_min int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking uuid; a uuid; v_name text; v_price numeric; v_sum numeric := 0;
begin
  v_booking := create_booking(p_service, p_barber, p_start, p_name, p_email, p_phone, p_source);
  if v_booking is null then return null; end if;

  update bookings
     set group_id = p_group,
         person_label = nullif(trim(coalesce(p_person, '')), '')
   where id = v_booking;

  if p_addons is not null then
    foreach a in array p_addons loop
      select name, price_nok into v_name, v_price from services where id = a;
      if v_name is not null then
        insert into booking_addons(booking_id, service_id, name, price_nok)
          values (v_booking, a, v_name, coalesce(v_price, 0));
        v_sum := v_sum + coalesce(v_price, 0);
      end if;
    end loop;
  end if;

  if coalesce(p_extra_min, 0) > 0 then
    update bookings set end_at = end_at + make_interval(mins => p_extra_min)
     where id = v_booking;
  end if;
  if v_sum > 0 then
    update bookings set price_nok = coalesce(price_nok, 0) + v_sum
     where id = v_booking;
  end if;

  return v_booking;
end $$;
grant execute on function create_booking_line(text, text, timestamptz, text, text, text, text, uuid, text, uuid[], int) to anon, authenticated;
