-- =====================================================================
-- KJØR I SUPABASE (SQL Editor) — samlet migrasjon fra denne økta
-- Downtown Barbers · sept 2026
--
-- Slik gjør du: Supabase → prosjekt kekdspamodouqqeptxwa → SQL Editor →
-- lim inn ALT under → Run. Trygt å kjøre flere ganger (create or replace).
--
-- Merk: migrasjonene 0020–0023 skal allerede være kjørt (verifisert i
-- live-test: /min-side og /avmeld svarte uten feil). Trenger du å kjøre
-- dem på nytt, ligger de i supabase/migrations/. Denne fila inneholder
-- kun det NYE fra denne økta.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0024 — Offentlig omdømme (valgfri)
-- Gir forsiden lov til å telle EGNE kunders vurderinger med i det
-- samlede omdømme-snittet, som et aggregat (kun snitt + antall — ingen
-- enkeltvurderinger eller persondata eksponeres). Uten denne: forsiden
-- blander bare Google + TripAdvisor. Med denne: egne kunder blir med.
-- ---------------------------------------------------------------------
create or replace function public_rating_summary()
returns table (avg numeric, cnt bigint)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(round(avg(stars)::numeric, 2), 0)::numeric,
         count(*)::bigint
  from ratings;
$$;

grant execute on function public_rating_summary() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 0025 — Turnus (uke A/B) satt i gang (se kommentarer i filen under)
-- ---------------------------------------------------------------------
-- =====================================================================
-- 0025 — Turnus (uke A/B) satt i gang
--   1) Manglende kolonne week_parity på staff_hours — DETTE er grunnen til
--      at turnus aldri virket (all lesing/skriving av kolonnen feilet stille).
--   2) Konfigurerbart A/B-anker (hvilken paritet en partalls ISO-uke er).
--   3) turnus_week_parity(dato): 1 = uke A, 2 = uke B, styrt av ankeret.
--   4) available_slots følger nå turnusen — men FALLER TILBAKE til 09–21
--      for barbere som ikke har satt turnus, så ingenting brekker.
-- Idempotent.
-- =====================================================================

-- 1) Manglende kolonne (0 = hver uke, 1 = uke A, 2 = uke B)
alter table staff_hours
  add column if not exists week_parity smallint not null default 0;

-- 2) Anker: default partall ISO-uke = Uke A (samme som frontenden antok før).
insert into settings (key, value)
values ('turnus_anchor', '{"a_is_even": true}'::jsonb)
on conflict (key) do nothing;

-- 3) Uke-paritet (1=A, 2=B) for en dato, styrt av ankeret.
create or replace function turnus_week_parity(p_date date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((value->>'a_is_even')::boolean, true) as a_is_even
    from settings where key = 'turnus_anchor'
  )
  select case
    when extract(week from p_date)::int % 2 = 0
      then case when (select a_is_even from cfg) then 1 else 2 end
      else case when (select a_is_even from cfg) then 2 else 1 end
  end;
$$;
grant execute on function turnus_week_parity(date) to anon, authenticated;

-- 4) Booking-tilgjengelighet som følger turnusen (med trygg fallback).
create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time := '09:00'; v_close time := '21:00';
  slot time; slot_start timestamptz; slot_end timestamptz;
  res text[] := '{}';
  r record;
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);            -- 0 = søndag
  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff) into v_has_turnus;

  if v_has_turnus then
    -- Turnus-styrt: kun innenfor barberens vakter for ukedagen + pariteten.
    for r in
      select start_time, end_time from staff_hours
      where staff_id = v_staff
        and weekday = v_dow
        and week_parity in (0, v_parity)
      order by start_time
    loop
      slot := r.start_time;
      while slot + make_interval(mins => v_dur) <= r.end_time loop
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
        slot := slot + v_step;
      end loop;
    end loop;
    return res;
  end if;

  -- Fallback (ingen turnus satt for barberen): som før – 09–21, man–lør.
  if v_dow = 0 then return res; end if;
  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
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
    slot := slot + v_step;
  end loop;
  return res;
end $$;
grant execute on function available_slots(text, text, date) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 0026 — Åpningstider styrer booking (se kommentarer under)
-- ---------------------------------------------------------------------
-- =====================================================================
-- 0026 — Åpningstider styrer booking
--   Én strukturert kilde (per ukedag) som BÅDE forsiden OG
--   booking-tilgjengeligheten leser fra. Når Dawit endrer åpningstidene i
--   /admin/nettside, endres derfor både visning og hva kunder kan booke.
--   dow: 0=søndag … 6=lørdag. Verdi = {open,close} eller null (stengt).
--   Default = dagens oppførsel (09–21 man–lør, søn stengt) → ingenting
--   endres før Dawit faktisk redigerer.
-- Idempotent.
-- =====================================================================

alter table site_settings
  add column if not exists hours jsonb not null default '{
    "1": {"open": "09:00", "close": "21:00"},
    "2": {"open": "09:00", "close": "21:00"},
    "3": {"open": "09:00", "close": "21:00"},
    "4": {"open": "09:00", "close": "21:00"},
    "5": {"open": "09:00", "close": "21:00"},
    "6": {"open": "09:00", "close": "21:00"},
    "0": null
  }'::jsonb;

-- Salongens åpningstid for en ukedag (ingen rad = stengt).
create or replace function salon_hours(p_dow int)
returns table (open_t time, close_t time)
language sql
stable
security definer
set search_path = public
as $$
  select (h->>'open')::time, (h->>'close')::time
  from site_settings s,
       lateral (select s.hours -> p_dow::text as h) x
  where s.id = 1 and jsonb_typeof(h) = 'object';
$$;
grant execute on function salon_hours(int) to anon, authenticated;

-- Booking-tilgjengelighet: turnus ∩ salongens åpningstid, stengt dag = ingen tider.
create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time; v_close time;
  slot time; slot_start timestamptz; slot_end timestamptz;
  res text[] := '{}';
  r record;
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);

  -- Salongens åpningstid denne dagen (stengt → ingen tider).
  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff) into v_has_turnus;

  if v_has_turnus then
    -- Turnus-styrt, men klippet til salongens åpningstid.
    for r in
      select start_time, end_time from staff_hours
      where staff_id = v_staff
        and weekday = v_dow
        and week_parity in (0, v_parity)
      order by start_time
    loop
      slot := greatest(r.start_time, v_open);
      while slot + make_interval(mins => v_dur) <= least(r.end_time, v_close) loop
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
        slot := slot + v_step;
      end loop;
    end loop;
    return res;
  end if;

  -- Fallback (ingen turnus satt): hele salongens åpningstid.
  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
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
    slot := slot + v_step;
  end loop;
  return res;
end $$;
grant execute on function available_slots(text, text, date) to anon, authenticated;
