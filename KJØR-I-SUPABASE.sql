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


-- ---------------------------------------------------------------------
-- 0027 — Innkommende SMS: STOPP/START (A2P-samtykke)
-- Lar kunder reservere seg ved å svare STOPP (og melde seg på med START/
-- JA) på SMS, slik A2P-leverandører krever. Gjenbruker samtykke-flagget
-- (customers.marketing_consent) — markedsføring sender kun til de med
-- samtykke, så en STOPP fjerner kunden fra alle framtidige markedsførings-
-- SMS med én gang. Booking-påminnelser (transaksjonelle) påvirkes ikke.
-- Webhook: POST/GET /api/sms/inbound  (valgfri sikring: SMS_INBOUND_SECRET)
-- ---------------------------------------------------------------------
create table if not exists sms_inbound (
  id          uuid primary key default gen_random_uuid(),
  from_phone  text not null,
  body        text,
  action      text not null default 'other',
  matched     int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists sms_inbound_created_idx on sms_inbound (created_at desc);

alter table sms_inbound enable row level security;
drop policy if exists sms_inbound_admin_all on sms_inbound;
create policy sms_inbound_admin_all on sms_inbound
  for all using (is_admin()) with check (is_admin());

create or replace function sms_set_consent_by_phone(
  p_phone text, p_consent boolean
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_count int;
begin
  v_key := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
  if length(v_key) < 8 then
    return 0;
  end if;

  update customers
     set marketing_consent = p_consent,
         marketing_consent_at = now()
   where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = v_key;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function sms_set_consent_by_phone(text, boolean) to anon, authenticated;

create or replace function sms_inbound_handle(
  p_from text, p_body text, p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(coalesce(p_action, 'other'));
  v_matched int := 0;
begin
  if v_action = 'stop' then
    v_matched := sms_set_consent_by_phone(p_from, false);
  elsif v_action = 'start' then
    v_matched := sms_set_consent_by_phone(p_from, true);
  else
    v_action := 'other';
  end if;

  insert into sms_inbound (from_phone, body, action, matched)
  values (coalesce(p_from, ''), p_body, v_action, v_matched);

  return jsonb_build_object('action', v_action, 'matched', v_matched);
end $$;
grant execute on function sms_inbound_handle(text, text, text) to anon, authenticated;

create or replace function sms_inbound_recent(p_limit int default 20)
returns setof sms_inbound
language sql
stable
security definer
set search_path = public
as $$
  select * from sms_inbound
  where is_admin()
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 200));
$$;
grant execute on function sms_inbound_recent(int) to authenticated;


-- ---------------------------------------------------------------------
-- 0028 — Avvik/fravær per dato (overstyrer turnusen)
-- Turnusen er en fast ukemal; denne tabellen holder unntak per barber per
-- dato: fri hele dagen, fri deler av dagen, eller ekstravakt. available_slots
-- tar hensyn til dem (klippet mot åpningstidene fra 0026). Settes i
-- /admin/timelister under «Avvik & fravær».
-- ---------------------------------------------------------------------
create table if not exists staff_exceptions (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  date        date not null,
  kind        text not null default 'off',   -- 'off' | 'extra'
  start_time  time,                            -- NULL (for 'off') = hele dagen
  end_time    time,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists staff_exceptions_lookup_idx
  on staff_exceptions (staff_id, date);

alter table staff_exceptions enable row level security;
drop policy if exists staff_exceptions_admin_all on staff_exceptions;
create policy staff_exceptions_admin_all on staff_exceptions
  for all using (is_admin()) with check (is_admin());
drop policy if exists staff_exceptions_shop_read on staff_exceptions;
create policy staff_exceptions_shop_read on staff_exceptions
  for select using (is_shop_or_admin());

create or replace function available_slots(
  p_barber text, p_service text, p_date date
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
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);

  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

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


-- ---------------------------------------------------------------------
-- 0029 — Kopier turnus mellom uke A og uke B (ett klikk i Timelister)
-- ---------------------------------------------------------------------
create or replace function copy_turnus_week(p_from int, p_to int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not is_admin() then
    raise exception 'Kun admin kan kopiere turnus';
  end if;
  if p_from not in (1, 2) or p_to not in (1, 2) or p_from = p_to then
    return 0;
  end if;

  delete from staff_hours where week_parity = p_to;
  insert into staff_hours (staff_id, weekday, start_time, end_time, week_parity)
    select staff_id, weekday, start_time, end_time, p_to
    from staff_hours
    where week_parity = p_from;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function copy_turnus_week(int, int) to authenticated;


-- ---------------------------------------------------------------------
-- 0030 — Omdømme-kilder konfigurerbart fra admin (Google + TripAdvisor)
-- API-nøkler settes nå i /admin/rating i stedet for env. Kun admin (RLS);
-- server-koden leser via service-role. Mangler en verdi → env-fallback.
-- ---------------------------------------------------------------------
create table if not exists review_config (
  id                       int primary key default 1,
  google_api_key           text,
  google_place_id          text,
  google_enabled           boolean not null default true,
  tripadvisor_api_key      text,
  tripadvisor_location_id  text,
  tripadvisor_enabled      boolean not null default true,
  updated_at               timestamptz not null default now(),
  constraint review_config_singleton check (id = 1)
);
insert into review_config (id) values (1) on conflict (id) do nothing;

alter table review_config enable row level security;
drop policy if exists review_config_admin_all on review_config;
create policy review_config_admin_all on review_config
  for all using (is_admin()) with check (is_admin());


-- ---------------------------------------------------------------------
-- 0032 — Driftsmeldinger / interne varsler
-- Banner i admin/kasse/ansatt-panelene. Admin oppretter; lesing per rolle
-- (admin ser alt, shop ser 'all'+'shop', staff ser 'all'+'ansatt'). Side:
-- /admin/meldinger.
-- ---------------------------------------------------------------------
create table if not exists notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  level       text not null default 'info',
  audience    text not null default 'all',
  active      boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists notices_active_audience_idx on notices (active, audience);
alter table notices enable row level security;
drop policy if exists notices_admin_all on notices;
create policy notices_admin_all on notices
  for all using (is_admin()) with check (is_admin());
drop policy if exists notices_shop_read on notices;
drop policy if exists notices_role_read on notices;
create policy notices_role_read on notices
  for select using (
    is_admin()
    or (current_role_name() = 'shop'  and audience in ('all', 'shop'))
    or (current_role_name() = 'staff' and audience in ('all', 'ansatt'))
  );


-- ---------------------------------------------------------------------
-- 0033 — Dokumentsenter (DocCenter)
-- Privat Storage-bøtte 'documents' + metadata-tabell. Kun admin. Nedlasting
-- via signerte URL-er. Side: /admin/dokumenter.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_admin_insert" on storage.objects;
create policy "documents_admin_insert" on storage.objects
  for insert with check (bucket_id = 'documents' and public.is_admin());
drop policy if exists "documents_admin_select" on storage.objects;
create policy "documents_admin_select" on storage.objects
  for select using (bucket_id = 'documents' and public.is_admin());
drop policy if exists "documents_admin_update" on storage.objects;
create policy "documents_admin_update" on storage.objects
  for update using (bucket_id = 'documents' and public.is_admin());
drop policy if exists "documents_admin_delete" on storage.objects;
create policy "documents_admin_delete" on storage.objects
  for delete using (bucket_id = 'documents' and public.is_admin());

create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  path         text not null,
  category     text,
  size_bytes   bigint,
  mime         text,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists documents_category_created_idx
  on documents (category, created_at desc);
alter table documents enable row level security;
drop policy if exists documents_admin_all on documents;
create policy documents_admin_all on documents
  for all using (is_admin()) with check (is_admin());
