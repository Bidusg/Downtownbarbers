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


-- ---------------------------------------------------------------------
-- 0031 — Tjeneste-katalog: online-bookbar, popularitet, behandlingsunntak
-- (Nummeret var ledig; kjøres uavhengig av 0032/0033.) online_bookable skiller
-- «bookbar på nett» fra «aktiv». staff_service_exclusions = barber utfører ikke
-- en tjeneste. Popularitet + offentlig unntaksliste via security definer.
-- Styres i /admin/tjenester. available_slots er urørt.
-- ---------------------------------------------------------------------
alter table services add column if not exists online_bookable boolean not null default true;

create table if not exists staff_service_exclusions (
  staff_id   uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, service_id)
);
create index if not exists staff_service_exclusions_service_idx
  on staff_service_exclusions (service_id);
alter table staff_service_exclusions enable row level security;
drop policy if exists sse_admin_all on staff_service_exclusions;
create policy sse_admin_all on staff_service_exclusions
  for all using (is_admin()) with check (is_admin());
drop policy if exists sse_shop_read on staff_service_exclusions;
create policy sse_shop_read on staff_service_exclusions
  for select using (is_shop_or_admin());

create or replace function service_popularity(p_days int default 90)
returns table (service_id uuid, completed_count int)
language sql stable security definer set search_path = public as $$
  select b.service_id, count(*)::int
  from bookings b
  where b.status = 'completed'
    and b.service_id is not null
    and b.start_at >= now() - make_interval(days => greatest(coalesce(p_days, 90), 1))
  group by b.service_id;
$$;
grant execute on function service_popularity(int) to anon, authenticated;

create or replace function service_exclusions_public()
returns table (service_name text, barber_name text)
language sql stable security definer set search_path = public as $$
  select s.name, st.full_name
  from staff_service_exclusions x
  join services s on s.id = x.service_id
  join staff st on st.id = x.staff_id
  where st.active;
$$;
grant execute on function service_exclusions_public() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 0034 — Kundeklubb: medlemsnivåer fra forbruk/besøk
-- membership_tiers (konfigurerbar) + customer_membership(uuid) /
-- customer_membership_by_token(token). Vises på kundekort + /min-side.
-- Config: /admin/kundeklubb.
-- ---------------------------------------------------------------------
-- =====================================================================
-- 0034 – KUNDEKLUBB: automatiske medlemsnivåer (Bronse/Sølv/Gull)
--   Nivået UTLEDES av hvor mye/ofte kunden har handlet — ingen poeng,
--   ingen betaling, ingen manuell tildeling. Terskler er konfigurerbare
--   av admin (livstidsforbruk i kr og antall fullførte besøk).
--
--   Grunnlag (gjenbruker eksisterende mønster fra analytics/portalen):
--     • forbruk  = sum(sales.total_nok)         for kundens customer_id
--     • besøk    = antall bookings status='completed'  for kunden
--
--   NIVÅ-REGEL: kunden får det HØYESTE nivået der
--       spend >= min_spend  ELLER  visits >= min_visits.
--   (Bronse har 0/0 og kvalifiserer alltid, så et nivå finnes alltid.)
-- Idempotent.
-- =====================================================================

-- ---------- Tabell: konfigurerbare nivåer ----------
create table if not exists membership_tiers (
  id         smallint primary key,           -- 1=Bronse, 2=Sølv, 3=Gull (høyere = bedre)
  name       text not null,
  min_spend  numeric not null default 0,      -- livstidsforbruk i kr for å nå nivået
  min_visits int not null default 0,          -- antall fullførte besøk for å nå nivået
  benefit    text,                            -- fritekst medlemsgode for nivået
  color      text                             -- valgfri hex til merket (f.eks. #CD7F32)
);

-- Seed tre standardnivåer. on conflict do nothing => trygg reseed / beholder
-- admin sine justerte terskler ved ny kjøring.
insert into membership_tiers (id, name, min_spend, min_visits, benefit, color) values
  (1, 'Bronse', 0,    0,  'Medlem i kundeklubben — samler forbruk og besøk automatisk.',      '#CD7F32'),
  (2, 'Sølv',   3000, 5,  '10% på produkter i butikken.',                                     '#C0C0C0'),
  (3, 'Gull',   8000, 12, '15% på produkter + prioritert booking i høysesong.',               '#E6B325')
on conflict (id) do nothing;

-- ---------- RLS: terskler/navn/goder er ikke sensitivt, men kun admin skriver ----------
alter table membership_tiers enable row level security;

drop policy if exists membership_tiers_admin_all on membership_tiers;
create policy membership_tiers_admin_all on membership_tiers
  for all using (is_admin()) with check (is_admin());

-- Lesing greit for innloggede (admin/shop/ansatt). Anonyme «min side»-besøkende
-- trenger ikke direkte lesetilgang — de går via security-definer-funksjonen under.
drop policy if exists membership_tiers_read on membership_tiers;
create policy membership_tiers_read on membership_tiers
  for select to authenticated using (true);

-- ---------- Nivå-utledning for ÉN kunde (security definer) ----------
-- Returnerer kundens oppnådde nivå + grunnlaget (forbruk/besøk) og hva som
-- kreves for neste nivå. Tar én kunde-id og returnerer KUN aggregat for den
-- kunden (ingen PII, ingen andre kunders data), så den kan grantes til anon
-- for den token-baserte «min side».
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
  -- Grunnlag: livstidsforbruk (inkl. mva) og antall fullførte besøk.
  select coalesce(sum(total_nok), 0) into v_spend
    from sales where customer_id = p_customer;
  select count(*) into v_visits
    from bookings where customer_id = p_customer and status = 'completed';

  -- HØYESTE nivå der spend >= min_spend ELLER visits >= min_visits.
  select * into v_tier
    from membership_tiers
   where v_spend >= min_spend or v_visits >= min_visits
   order by id desc
   limit 1;

  -- Sikkerhetsnett: hvis ingen terskel matcher (bør ikke skje pga Bronse 0/0),
  -- fall tilbake til laveste definerte nivå.
  if v_tier.id is null then
    select * into v_tier from membership_tiers order by id asc limit 1;
  end if;

  -- Neste nivå = laveste nivå med høyere id enn det oppnådde (null om toppnivå).
  select * into v_next
    from membership_tiers
   where id > v_tier.id
   order by id asc
   limit 1;

  return query select
    v_tier.id, v_tier.name, v_tier.benefit, v_tier.color,
    v_spend, coalesce(v_visits, 0),
    v_next.name, v_next.min_spend, v_next.min_visits;
end $$;

-- Kun authenticated: eneste direkte kaller er kundekortet (innlogget admin).
-- Anonyme «min side»-besøkende går utelukkende via _by_token-wrapperen under,
-- så vi unngår at hvem som helst kan slå opp aggregat på en vilkårlig kunde-id.
grant execute on function customer_membership(uuid) to authenticated;

-- ---------- Token-basert oppslag for «min side» ----------
-- «Min side» kjenner bare portal_token (ikke kunde-id). Denne wrapperen slår
-- opp kundens egen id fra tokenet og returnerer samme aggregat, slik at siden
-- aldri trenger å håndtere en rå kunde-id på klienten.
create or replace function customer_membership_by_token(p_token uuid)
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
declare v_id uuid;
begin
  select id into v_id from customers where portal_token = p_token limit 1;
  if v_id is null then
    return;
  end if;
  return query select * from customer_membership(v_id);
end $$;

grant execute on function customer_membership_by_token(uuid) to anon, authenticated;


-- =====================================================================
-- 0035 – Selvbetjening i ansatt-panelet (/ansatt)
--   Barberen skal kunne se sin egen turnus, sine egne fravær/avvik og
--   sine egne stemplede timer UTEN å gå via admin – og kunne «søke fri».
--
--   Datamodellen fra før eksponerer disse tabellene KUN til admin/shop
--   (0001, 0028) eller kun via RPC (shift_events, 0012). Ansatte (role
--   'staff') har derfor ingen trygg lesetilgang til sine egne rader.
--
--   Løsning: en SECURITY DEFINER-nøkkel current_staff_id() som kobler
--   innlogget bruker → deres staff-rad (via profile_id ELLER e-post,
--   samme kobling som getMyAgenda bruker), og et sett tynne, egen-
--   filtrerte RPC-er som KUN returnerer den innloggede ansattes rader.
--   Ingen eksisterende RLS-policy endres eller løsnes.
--
--   Ny tabell leave_requests (fravaerssøknad) med RLS: ansatt kan se +
--   sende egne (status alltid 'pending'); admin ser/endrer alle.
-- Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Kobling innlogget bruker -> egen staff-rad.
--    Matcher primært på profile_id = auth.uid(), sekundært på e-post
--    (mange staff-rader har ennå ikke profile_id satt). SECURITY DEFINER
--    slik at staff kan slå opp sin egen id selv om staff-RLS ellers er
--    begrenset til aktive rader for offentlig lesing.
-- ---------------------------------------------------------------------
create or replace function current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from staff s
  where s.active
    and (
      s.profile_id = auth.uid()
      or (
        s.email is not null
        and nullif(lower(s.email), '') = nullif(lower(auth.jwt() ->> 'email'), '')
      )
    )
  order by (s.profile_id = auth.uid()) desc nulls last
  limit 1;
$$;
grant execute on function current_staff_id() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Egen turnus (uke A/B-mal). Kun lesing, kun egne rader.
-- ---------------------------------------------------------------------
create or replace function my_turnus()
returns table (weekday smallint, week_parity smallint, start_time time, end_time time)
language sql
stable
security definer
set search_path = public
as $$
  select h.weekday, h.week_parity, h.start_time, h.end_time
  from staff_hours h
  where h.staff_id = current_staff_id()
  order by h.week_parity, h.weekday, h.start_time;
$$;
grant execute on function my_turnus() to authenticated;

-- ---------------------------------------------------------------------
-- 3) Kommende konkrete vakter utledet av turnusen + A/B-ankeret,
--    med heldags-fravær (staff_exceptions 'off') og ferie/fravær
--    (absences) trukket fra. Ekstravakter er ikke med (kun turnus-malen).
-- ---------------------------------------------------------------------
create or replace function my_upcoming_shifts(p_days int default 21)
returns table (work_date date, weekday int, start_time time, end_time time, week_parity int)
language sql
stable
security definer
set search_path = public
as $$
  with sid as (select current_staff_id() as id),
  days as (
    select d::date as work_date
    from generate_series(
      (now() at time zone 'Europe/Oslo')::date,
      (now() at time zone 'Europe/Oslo')::date + (greatest(coalesce(p_days, 21), 1) - 1),
      interval '1 day'
    ) as d
  )
  select
    dd.work_date,
    extract(dow from dd.work_date)::int,
    h.start_time,
    h.end_time,
    turnus_week_parity(dd.work_date)
  from days dd
  cross join sid
  join staff_hours h
    on h.staff_id = sid.id
   and h.weekday = extract(dow from dd.work_date)::int
   and h.week_parity in (0, turnus_week_parity(dd.work_date))
  where sid.id is not null
    and not exists (
      select 1 from staff_exceptions e
      where e.staff_id = sid.id
        and e.date = dd.work_date
        and e.kind = 'off'
        and e.start_time is null
    )
    and not exists (
      select 1 from absences a
      where a.staff_id = sid.id
        and dd.work_date between a.from_date and a.to_date
    )
  order by dd.work_date, h.start_time;
$$;
grant execute on function my_upcoming_shifts(int) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Egne avvik per dato (staff_exceptions, 0028). Kun lesing, egne rader.
-- ---------------------------------------------------------------------
create or replace function my_exceptions(p_from date default null, p_to date default null)
returns table (id uuid, date date, kind text, start_time time, end_time time, note text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.date, e.kind, e.start_time, e.end_time, e.note
  from staff_exceptions e
  where e.staff_id = current_staff_id()
    and (p_from is null or e.date >= p_from)
    and (p_to is null or e.date <= p_to)
  order by e.date desc;
$$;
grant execute on function my_exceptions(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Egne fravær over datointervall (absences). Kun lesing, egne rader.
-- ---------------------------------------------------------------------
create or replace function my_absences(p_from date default null, p_to date default null)
returns table (id uuid, from_date date, to_date date, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.from_date, a.to_date, a.reason
  from absences a
  where a.staff_id = current_staff_id()
    and (p_to is null or a.from_date <= p_to)
    and (p_from is null or a.to_date >= p_from)
  order by a.from_date desc;
$$;
grant execute on function my_absences(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Egen stemplingshistorikk (shift_events, 0012). shift_events har
--    ingen direkte tilgang – kun via SECURITY DEFINER. Disse to RPC-ene
--    filtrerer strengt til den innloggede ansattes egen id.
-- ---------------------------------------------------------------------

-- 6a) Timer summert per dag (Oslo-tid). Åpen (ikke avsluttet) økt telles
--     fram til nå, men klippes ved døgnskillet slik at en glemt utstempling
--     ikke blåser opp tidligere dager.
create or replace function my_shift_days(p_from date, p_to date)
returns table (day date, worked_minutes int, events int)
language sql
stable
security definer
set search_path = public
as $$
  with sid as (select current_staff_id() as id),
  ev as (
    select
      e.created_at,
      (e.created_at at time zone 'Europe/Oslo')::date as d,
      e.event_type,
      lead(e.created_at) over (order by e.created_at) as next_at
    from shift_events e
    cross join sid
    where sid.id is not null
      and e.staff_id = sid.id
      and (e.created_at at time zone 'Europe/Oslo')::date between p_from and p_to
  ),
  worked as (
    select
      d,
      sum(
        greatest(0, extract(epoch from (
          least(
            coalesce(next_at, now()),
            ((d + 1)::timestamp at time zone 'Europe/Oslo')
          ) - created_at
        )) / 60)
      ) filter (where event_type in ('start', 'resume')) as mins,
      count(*) as ev_count
    from ev
    group by d
  )
  select w.d, coalesce(round(w.mins)::int, 0), w.ev_count::int
  from worked w
  order by w.d desc;
$$;
grant execute on function my_shift_days(date, date) to authenticated;

-- 6b) Rå stemplingshendelser (for detaljlisten).
create or replace function my_shift_events(p_from date, p_to date)
returns table (id uuid, event_type text, created_at timestamptz, note text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.event_type, e.created_at, e.note
  from shift_events e
  where e.staff_id = current_staff_id()
    and (e.created_at at time zone 'Europe/Oslo')::date between p_from and p_to
  order by e.created_at desc;
$$;
grant execute on function my_shift_events(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 7) Fravaerssøknad ("søk fri"). Ansatt sender inn; admin behandler.
-- ---------------------------------------------------------------------
create table if not exists leave_requests (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  from_date   date not null,
  to_date     date not null,
  kind        text not null default 'ferie',   -- ferie | avspasering | annet
  note        text,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'declined')),
  decided_by  uuid references profiles(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists leave_requests_staff_idx
  on leave_requests (staff_id, created_at desc);
create index if not exists leave_requests_status_idx
  on leave_requests (status, from_date);

alter table leave_requests enable row level security;

-- Admin: full tilgang (ser/behandler alle).
drop policy if exists leave_requests_admin_all on leave_requests;
create policy leave_requests_admin_all on leave_requests
  for all using (is_admin()) with check (is_admin());

-- Ansatt: kun sine egne rader kan leses.
drop policy if exists leave_requests_self_read on leave_requests;
create policy leave_requests_self_read on leave_requests
  for select using (staff_id = current_staff_id());

-- Ansatt: kan kun sende inn for seg selv, og kun som 'pending'
--   (kan ikke selv-godkjenne eller sende på vegne av andre).
drop policy if exists leave_requests_self_insert on leave_requests;
create policy leave_requests_self_insert on leave_requests
  for insert with check (
    staff_id = current_staff_id()
    and status = 'pending'
  );

-- Trygg innsending: utleder staff_id server-side, tvinger status 'pending'.
-- Klienten kan ikke overstyre hvem søknaden gjelder eller statusen.
create or replace function submit_leave_request(
  p_from date,
  p_to date,
  p_kind text default 'ferie',
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_kind  text;
  v_id    uuid;
begin
  v_staff := current_staff_id();
  if v_staff is null then
    raise exception 'Ingen ansattprofil er koblet til kontoen din.';
  end if;
  if p_from is null or p_to is null then
    raise exception 'Fra- og til-dato må fylles ut.';
  end if;
  if p_to < p_from then
    raise exception 'Til-dato kan ikke være før fra-dato.';
  end if;

  v_kind := coalesce(nullif(trim(p_kind), ''), 'ferie');
  if v_kind not in ('ferie', 'avspasering', 'annet') then
    v_kind := 'annet';
  end if;

  insert into leave_requests (staff_id, from_date, to_date, kind, note, status)
  values (v_staff, p_from, p_to, v_kind, nullif(trim(p_note), ''), 'pending')
  returning id into v_id;

  return v_id;
end $$;
grant execute on function submit_leave_request(date, date, text, text) to authenticated;
