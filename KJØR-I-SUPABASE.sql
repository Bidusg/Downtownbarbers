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


-- =====================================================================
-- 0036 – Admin behandler fravaerssøknader (leave_requests, 0035)
--   Én SECURITY DEFINER-RPC som lar admin godkjenne/avslå en søknad.
--   Ved godkjenning opprettes et faktisk fravær (absences) for perioden,
--   slik at det slår inn i turnus/booking. Alt idempotent.
--   Ingen RLS løsnes: RPC-en er is_admin()-gatet.
-- =====================================================================

create or replace function decide_leave_request(
  p_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r leave_requests;
begin
  if not is_admin() then
    raise exception 'Kun admin kan behandle søknader.';
  end if;

  select * into r from leave_requests where id = p_id for update;
  if not found then
    raise exception 'Søknaden finnes ikke.';
  end if;
  if r.status <> 'pending' then
    raise exception 'Søknaden er allerede behandlet.';
  end if;

  update leave_requests
     set status      = case when p_approve then 'approved' else 'declined' end,
         decided_by  = auth.uid(),
         decided_at  = now()
   where id = p_id;

  -- Godkjent søknad blir et registrert fravær (slår inn i turnus/booking).
  if p_approve then
    insert into absences (staff_id, from_date, to_date, reason)
    values (
      r.staff_id,
      r.from_date,
      r.to_date,
      coalesce(nullif(trim(r.note), ''), initcap(r.kind))
    );
  end if;
end $$;
grant execute on function decide_leave_request(uuid, boolean) to authenticated;


-- =====================================================================
-- 0037 – Ansatt trekker tilbake egen ventende fravaerssøknad (0035).
--   SECURITY DEFINER-RPC: sletter KUN en 'pending'-søknad som tilhører
--   innlogget ansatt (via current_staff_id() fra 0035). Ingen RLS løsnes.
-- Idempotent.
-- =====================================================================

create or replace function withdraw_leave_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
begin
  v_staff := current_staff_id();
  if v_staff is null then
    raise exception 'Ingen ansattprofil er koblet til kontoen din.';
  end if;

  delete from leave_requests
   where id = p_id
     and staff_id = v_staff
     and status = 'pending';

  if not found then
    raise exception 'Fant ingen ventende søknad å trekke tilbake.';
  end if;
end $$;
grant execute on function withdraw_leave_request(uuid) to authenticated;


-- =====================================================================
-- 0038 – Ansattdokumenter (kontrakt, lønnslipp, andre) i privat storage.
--   Privat bøtte 'staff-docs' med mappe per ansatt: '{staff_id}/...'.
--   staff_documents holder metadata. Nedlasting skjer via signerte URL-er
--   server-side (ingen public read).
--
--   Tilgang:
--     admin   – alt
--     revisor – lese alt + skrive KUN lønnslipp (for generering/utsending)
--     ansatt  – lese/laste ned sine egne; laste opp/slette KUN egne 'annet'
--   current_staff_id() (0035) kobler auth-bruker → staff-rad.
-- Idempotent.
-- =====================================================================

-- 1) Privat bøtte.
insert into storage.buckets (id, name, public)
values ('staff-docs', 'staff-docs', false)
on conflict (id) do nothing;

-- 2) Metadata-tabell.
create table if not exists staff_documents (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references staff(id) on delete cascade,
  category     text not null default 'annet'
               check (category in ('kontrakt', 'lonnslipp', 'annet')),
  name         text not null,          -- visningsnavn
  path         text not null,          -- sti i bøtta 'staff-docs' ('{staff_id}/...')
  period       text,                   -- 'YYYY-MM' for lønnslipp
  size_bytes   bigint,
  mime         text,
  uploaded_by  uuid references profiles(id) on delete set null,
  by_staff     boolean not null default false,  -- true = lastet opp av ansatt selv
  created_at   timestamptz not null default now()
);
create index if not exists staff_documents_lookup_idx
  on staff_documents (staff_id, category, created_at desc);
-- Én lønnslipp per ansatt per måned (idempotent regenerering: slett+sett inn).
create unique index if not exists staff_documents_lonnslipp_uidx
  on staff_documents (staff_id, period)
  where category = 'lonnslipp';

alter table staff_documents enable row level security;

drop policy if exists staff_documents_admin_all on staff_documents;
create policy staff_documents_admin_all on staff_documents
  for all using (is_admin()) with check (is_admin());

-- Revisor: lese alt.
drop policy if exists staff_documents_revisor_read on staff_documents;
create policy staff_documents_revisor_read on staff_documents
  for select using (
    (select role from profiles where id = auth.uid()) = 'revisor'
  );

-- Revisor: skrive KUN lønnslipp (insert/update/delete).
drop policy if exists staff_documents_revisor_lonn on staff_documents;
create policy staff_documents_revisor_lonn on staff_documents
  for all
  using (
    (select role from profiles where id = auth.uid()) = 'revisor'
    and category = 'lonnslipp'
  )
  with check (
    (select role from profiles where id = auth.uid()) = 'revisor'
    and category = 'lonnslipp'
  );

-- Ansatt: lese sine egne.
drop policy if exists staff_documents_self_read on staff_documents;
create policy staff_documents_self_read on staff_documents
  for select using (staff_id = current_staff_id());

-- Ansatt: laste opp KUN egne 'annet'.
drop policy if exists staff_documents_self_insert on staff_documents;
create policy staff_documents_self_insert on staff_documents
  for insert with check (
    staff_id = current_staff_id()
    and by_staff = true
    and category = 'annet'
  );

-- Ansatt: slette KUN egne selv-opplastede.
drop policy if exists staff_documents_self_delete on staff_documents;
create policy staff_documents_self_delete on staff_documents
  for delete using (
    staff_id = current_staff_id()
    and by_staff = true
  );

-- 3) storage.objects-policies for bøtta 'staff-docs'.
--    Mappe = staff_id (første segment av objektnavnet).
drop policy if exists "staff_docs_admin_all" on storage.objects;
create policy "staff_docs_admin_all" on storage.objects
  for all
  using (bucket_id = 'staff-docs' and public.is_admin())
  with check (bucket_id = 'staff-docs' and public.is_admin());

drop policy if exists "staff_docs_revisor" on storage.objects;
create policy "staff_docs_revisor" on storage.objects
  for all
  using (
    bucket_id = 'staff-docs'
    and (select role from public.profiles where id = auth.uid()) = 'revisor'
  )
  with check (
    bucket_id = 'staff-docs'
    and (select role from public.profiles where id = auth.uid()) = 'revisor'
  );

drop policy if exists "staff_docs_self_read" on storage.objects;
create policy "staff_docs_self_read" on storage.objects
  for select using (
    bucket_id = 'staff-docs'
    and (storage.foldername(name))[1] = public.current_staff_id()::text
  );

drop policy if exists "staff_docs_self_insert" on storage.objects;
create policy "staff_docs_self_insert" on storage.objects
  for insert with check (
    bucket_id = 'staff-docs'
    and (storage.foldername(name))[1] = public.current_staff_id()::text
  );

drop policy if exists "staff_docs_self_delete" on storage.objects;
create policy "staff_docs_self_delete" on storage.objects
  for delete using (
    bucket_id = 'staff-docs'
    and (storage.foldername(name))[1] = public.current_staff_id()::text
  );

-- 4) Rollegatet lønnstall-kilde for revisor-generering (bruttosum per ansatt
--    for en måned). Revisor har ikke direkte RLS-lesetilgang på sales;
--    denne SECURITY DEFINER-funksjonen gir kun aggregatet, og kun til
--    admin/revisor.
create or replace function monthly_gross_by_staff(p_year int, p_month int)
returns table (staff_id uuid, gross_nok numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select role from profiles where id = auth.uid()) not in ('admin', 'revisor') then
    raise exception 'Kun admin/revisor har tilgang.';
  end if;
  return query
    select s.staff_id, coalesce(sum(s.total_nok), 0)::numeric
    from sales s
    where s.staff_id is not null
      and s.sold_at >= make_date(p_year, p_month, 1)
      and s.sold_at <  (make_date(p_year, p_month, 1) + interval '1 month')
    group by s.staff_id;
end $$;
grant execute on function monthly_gross_by_staff(int, int) to authenticated;


-- =====================================================================
-- 0039 – Postnummer på ansatt.
--   Brukes som passord til den passordbeskyttede ZIP-en som lønnslippen
--   sendes i på e-post. Redigeres av admin i ansatt-panelet.
--   Leses server-side via `staff_public_read` (aktive ansatte).
-- Idempotent.
-- =====================================================================

alter table staff add column if not exists postnummer text;


-- =====================================================================
-- 0040 – Egne bookinger på «Min side» (/ansatt)
--   «Min timeplan» leste tidligere bookings/customers/services DIREKTE.
--   Rollen 'staff' har ingen RLS-lesetilgang på disse tabellene (kun
--   admin/shop, jf. 0001), så lista ble tom for en ren staff-bruker.
--
--   Løsning (samme mønster som 0035): en tynn SECURITY DEFINER-RPC som
--   KUN returnerer den innloggede ansattes egne bookinger, strengt
--   filtrert på staff_id = current_staff_id(). Ingen RLS-policy på de
--   delte tabellene endres eller løsnes.
-- Kun lesing. Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Innlogget ansatts egne bookinger, framover i tid.
--   Felt: id, start_at, status, customer (full_name), service (name).
--   Filtrert på staff_id = current_staff_id() (fra 0035) og – når
--   p_future_only er true (standard) – start_at >= dagens start (Oslo).
--   Sortert stigende på start_at. status castes til text (enum -> text).
-- ---------------------------------------------------------------------
create or replace function my_bookings(p_future_only boolean default true)
returns table (
  id       uuid,
  start_at timestamptz,
  status   text,
  customer text,
  service  text
)
language sql
stable
security definer
set search_path = public
as $$
  with sid as (select current_staff_id() as id)
  select
    b.id,
    b.start_at,
    b.status::text,
    c.full_name,
    s.name
  from bookings b
  cross join sid
  left join customers c on c.id = b.customer_id
  left join services  s on s.id = b.service_id
  where sid.id is not null
    and b.staff_id = sid.id
    and (
      not coalesce(p_future_only, true)
      or b.start_at >= ((now() at time zone 'Europe/Oslo')::date)::timestamp at time zone 'Europe/Oslo'
    )
  order by b.start_at asc;
$$;
grant execute on function my_bookings(boolean) to authenticated;


-- =====================================================================
-- 0041 – Lås ned SECURITY DEFINER-funksjoner (fjern PUBLIC/anon-tilgang)
--
--   BAKGRUNN: I Postgres får hver funksjon EXECUTE til PUBLIC som standard
--   ved opprettelse. Ingen tidligere migrasjon har gjort `revoke ... from
--   public`, så ALLE SECURITY DEFINER-funksjonene har vært kjørbare av hvem
--   som helst med den offentlige anon-nøkkelen (som ligger i nettleser-
--   bundelen, NEXT_PUBLIC_SUPABASE_ANON_KEY). requireRole() i app-laget
--   beskytter IKKE mot direkte RPC-kall mot Supabase-URL-en.
--
--   Effekt: en utenforstående kunne dumpe kundelister (navn/telefon/e-post)
--   via shop_customer_search / day_agenda / due_reminders / due_followups,
--   og markere bookinger betalt via mark_booking_paid.
--
--   Denne migrasjonen fjerner PUBLIC + anon fra de funksjonene som KUN skal
--   nås av innloggede ansatte (authenticated) eller av server-ruter med
--   service-role (som uansett bypasser grants). Rene offentlige funksjoner
--   for booking/vurdering/portal (available_slots, rate_booking,
--   customer_portal, cancel_booking_by_token osv.) røres IKKE.
--
--   Idempotent: revoke/grant kan kjøres flere ganger.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GRUPPE A – kun innloggede ansatte (authenticated).
--   Kalles fra /kasse og /admin (alle bak requireRole). Ingen anonym
--   flyt bruker disse. Klokke-terminalen (/kasse/stempling) er også
--   innlogget (requireRole), så PIN er andre-faktor, ikke erstatning.
-- ---------------------------------------------------------------------
revoke execute on function shop_customer_search(text)         from public, anon;
grant  execute on function shop_customer_search(text)          to authenticated;

revoke execute on function day_agenda(date)                   from public, anon;
grant  execute on function day_agenda(date)                    to authenticated;

revoke execute on function active_staff_for_clock()           from public, anon;
grant  execute on function active_staff_for_clock()            to authenticated;

revoke execute on function shift_summary_today()              from public, anon;
grant  execute on function shift_summary_today()               to authenticated;

revoke execute on function verify_pin_status(uuid, text)      from public, anon;
grant  execute on function verify_pin_status(uuid, text)       to authenticated;

revoke execute on function record_shift_event(uuid, text, text) from public, anon;
grant  execute on function record_shift_event(uuid, text, text)  to authenticated;

revoke execute on function current_shift_status(uuid)         from public, anon;
grant  execute on function current_shift_status(uuid)          to authenticated;

revoke execute on function due_followups(int)                 from public, anon;
grant  execute on function due_followups(int)                  to authenticated;

revoke execute on function mark_followup_sent(uuid, text)     from public, anon;
grant  execute on function mark_followup_sent(uuid, text)      to authenticated;

-- ---------------------------------------------------------------------
-- GRUPPE B – kun server-til-server (service-role).
--   Kalles utelukkende fra Next-ruter som nå bruker createServiceClient()
--   (webhooks + cron). service_role bypasser grants, så vi fjerner ALLE
--   roller. Ingen innlogget bruker eller anon skal treffe disse direkte.
-- ---------------------------------------------------------------------
revoke execute on function due_reminders()                          from public, anon, authenticated;
revoke execute on function mark_reminder_sent(uuid)                 from public, anon, authenticated;
revoke execute on function mark_booking_paid(text)                  from public, anon, authenticated;
revoke execute on function sms_inbound_handle(text, text, text)     from public, anon, authenticated;
revoke execute on function sms_set_consent_by_phone(text, boolean)  from public, anon, authenticated;


-- =====================================================================
-- 0042 – Turnus-presis kapasitet (minutter per ansatt over en periode)
--
--   Timeutnyttelse v1 (kpi-queries) brukte flat åpningstid (09–21, man–lør)
--   × antall aktive barberere. Denne RPC-en gir PRESIS planlagt kapasitet
--   ut fra faktisk turnus (staff_hours uke A/B via turnus_week_parity),
--   med fulle fridager (absences + heldags-fravær) trukket fra, delvis
--   fravær subtrahert og ekstravakter lagt til – samme logikk som
--   available_slots (0025/0026/0028), så tallene er konsistente med
--   selve booking-motoren.
--
--   Returnerer minutter per staff_id i [p_from, p_to] (begge inklusive).
--   Kun lesing, authenticated (admin/revisor bruker den server-side).
--   Idempotent.
-- =====================================================================
create or replace function turnus_capacity_minutes(p_from date, p_to date)
returns table (staff_id uuid, minutes numeric)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select
      d::date                            as work_date,
      turnus_week_parity(d::date)        as parity,
      extract(dow from d::date)::int     as dow
    from generate_series(p_from, p_to, interval '1 day') as d
  ),
  active as (
    select id from staff where active = true
  ),
  -- Turnus-minutter per aktiv ansatt per dag (parity 0 = hver uke).
  base as (
    select
      a.id       as staff_id,
      dd.work_date,
      coalesce(
        sum(extract(epoch from (h.end_time - h.start_time)) / 60.0),
        0
      )          as base_min
    from active a
    cross join days dd
    left join staff_hours h
      on h.staff_id   = a.id
     and h.weekday    = dd.dow
     and h.week_parity in (0, dd.parity)
    group by a.id, dd.work_date
  ),
  adj as (
    select
      b.staff_id,
      b.base_min,
      -- Heldags fri: ferie (absences) eller heldags-avvik (off uten tid).
      (
        exists (
          select 1 from absences ab
          where ab.staff_id = b.staff_id
            and b.work_date between ab.from_date and ab.to_date
        )
        or exists (
          select 1 from staff_exceptions e
          where e.staff_id = b.staff_id
            and e.date = b.work_date
            and e.kind = 'off'
            and e.start_time is null
        )
      ) as full_off,
      -- Delvis fravær (off med tider) trekkes fra.
      coalesce((
        select sum(extract(epoch from (e.end_time - e.start_time)) / 60.0)
        from staff_exceptions e
        where e.staff_id = b.staff_id
          and e.date = b.work_date
          and e.kind = 'off'
          and e.start_time is not null
          and e.end_time is not null
      ), 0) as partial_off_min,
      -- Ekstravakter (extra med tider) legges til.
      coalesce((
        select sum(extract(epoch from (e.end_time - e.start_time)) / 60.0)
        from staff_exceptions e
        where e.staff_id = b.staff_id
          and e.date = b.work_date
          and e.kind = 'extra'
          and e.start_time is not null
          and e.end_time is not null
      ), 0) as extra_min
    from base b
  )
  select
    staff_id,
    sum(
      case
        when full_off then 0
        else greatest(0, base_min - partial_off_min) + extra_min
      end
    )::numeric as minutes
  from adj
  group by staff_id;
$$;
grant execute on function turnus_capacity_minutes(date, date) to authenticated;


-- =====================================================================
-- 0043 – SMS-leverandørkonfig (admin-redigerbar, som review_config)
--
--   SMS-laget (src/lib/sms.ts) var kun env-styrt (SMS_PROVIDER, tokens …).
--   Denne tabellen lar admin koble til / bytte SMS-leverandør fra
--   /admin/integrasjoner uten å redigere env i Vercel – samme mønster som
--   review_config (0030): singleton, KUN admin (RLS), nøkler leses
--   server-side med service-role, aldri av besøkende. sms.ts faller
--   tilbake til env når rad/nøkkel mangler, så eksisterende oppsett virker.
--
--   Idempotent.
-- =====================================================================
create table if not exists sms_config (
  id                  int primary key default 1,
  provider            text,            -- gatewayapi | sveve | twilio | generic | '' (auto)
  sender              text,            -- avsendernavn, f.eks. "Downtown"
  gatewayapi_token    text,
  sveve_user          text,
  sveve_password      text,
  twilio_account_sid  text,
  twilio_auth_token   text,
  twilio_from         text,
  generic_api_url     text,
  generic_api_key     text,
  enabled             boolean not null default true,
  updated_at          timestamptz not null default now(),
  constraint sms_config_singleton check (id = 1)
);
insert into sms_config (id) values (1) on conflict (id) do nothing;

alter table sms_config enable row level security;
-- Kun admin. Ingen public/anon read – nøklene skal aldri kunne leses av
-- besøkende. Server-koden bruker service-role for utsending.
drop policy if exists sms_config_admin_all on sms_config;
create policy sms_config_admin_all on sms_config
  for all using (is_admin()) with check (is_admin());


-- ---------------------------------------------------------------------
-- 0044 — Atomisk salgsregistrering i kassen (+ angre)
-- ---------------------------------------------------------------------
-- =====================================================================
-- 0044 – ATOMISK SALGSREGISTRERING I KASSEN (+ angre)
--
--   Bakgrunn: completeBooking gjorde flere separate skriv (status,
--   sales, sale_items) uten å sjekke feil. Feilet én (nett/RLS), kunne
--   bookingen bli markert "completed" UTEN at salget ble registrert –
--   salget så fullført ut, men var borte. Se live-test 19. sept.
--
--   record_sale gjør ALT i én transaksjon:
--     1) låser bookingen (hindrer dobbelt-salg ved dobbelttrykk/retry),
--     2) oppretter ÉN sale,
--     3) legger tjenestelinjen (pris fra bookingen – satt server-side),
--     4) legger evt. produktlinjer (pris hentet fra products – ALDRI
--        fra klienten) og trekker ned lager + logger bevegelsen,
--     5) setter total og markerer bookingen fullført.
--   Feiler noe som helst, rulles ALT tilbake. Kun shop/admin.
--
--   reopen_booking angrer en fullført/ikke-møtt time: sletter salget
--   (cascade tar sale_items), tilbakefører produktlager og logger
--   reverseringen, og setter bookingen tilbake til "confirmed".
--
--   Idempotent (create or replace). Ingen nye tabeller/kolonner.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Registrer salg atomisk. p_products: jsonb-array [{"id": uuid, "qty": n}]
-- Returnerer sale-id.
-- ---------------------------------------------------------------------
create or replace function record_sale(
  p_booking uuid,
  p_payment_method text default null,
  p_products jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_sale    uuid;
  v_total   numeric(10,2) := 0;
  v_item    jsonb;
  v_prod    record;
  v_qty     int;
  v_new     int;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  -- Lås bookingen: samtidige kall serialiseres, så et dobbelttrykk ikke
  -- kan lage to salg for samme time.
  select id, staff_id, customer_id, service_id, price_nok, status
    into v_booking
    from bookings
    where id = p_booking
    for update;
  if not found then
    raise exception 'Fant ikke timen';
  end if;
  if v_booking.status = 'completed' then
    raise exception 'Timen er allerede fullført';
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (p_booking, v_booking.staff_id, v_booking.customer_id, 0,
            nullif(trim(coalesce(p_payment_method, '')), ''))
    returning id into v_sale;

  -- Tjenestelinje (prisen ble satt server-side da timen ble booket).
  if v_booking.service_id is not null then
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_booking.service_id, 1,
              coalesce(v_booking.price_nok, 0));
    v_total := v_total + coalesce(v_booking.price_nok, 0);
  end if;

  -- Produktlinjer – pris hentes fra products, aldri fra klienten.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));

    select id, name, price_nok
      into v_prod
      from products
      where id = (v_item->>'id')::uuid and active = true
      for update;
    if not found then
      raise exception 'Fant ikke produktet';
    end if;

    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'product', v_prod.id, v_prod.name, v_qty, v_prod.price_nok);
    v_total := v_total + (v_prod.price_nok * v_qty);

    -- Trekk ned lager (aldri under 0) + logg bevegelsen.
    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id
      returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  update sales set total_nok = v_total where id = v_sale;
  update bookings set status = 'completed' where id = p_booking;

  return v_sale;
end $$;

grant execute on function record_sale(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Angre en fullført / ikke-møtt time. Sletter salget (sale_items faller
-- med cascade), tilbakefører produktlager, og setter status = confirmed.
-- ---------------------------------------------------------------------
create or replace function reopen_booking(p_booking uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sale record;
  v_agg  record;
  v_new  int;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  for v_sale in select id from sales where booking_id = p_booking loop
    -- Tilbakefør lager per produkt (summert, så flere linjer med samme
    -- produkt håndteres riktig) og logg reverseringen.
    for v_agg in
      select ref_id, sum(quantity)::int as qty
        from sale_items
        where sale_id = v_sale.id and kind = 'product' and ref_id is not null
        group by ref_id
    loop
      update products set stock = stock + v_agg.qty
        where id = v_agg.ref_id
        returning stock into v_new;
      if v_new is not null then
        insert into stock_movements (product_id, delta, reason, new_stock, created_by)
          values (v_agg.ref_id, v_agg.qty, 'salg angret', v_new,
                  (select id from profiles where id = auth.uid()));
      end if;
    end loop;

    delete from sales where id = v_sale.id;
  end loop;

  update bookings set status = 'confirmed' where id = p_booking;
end $$;

grant execute on function reopen_booking(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 0045 — Kunde-selvbetjening fra Min side (avbestill + endre tid)
-- ---------------------------------------------------------------------
-- =====================================================================
-- 0045 – KUNDE-SELVBETJENING FRA MIN SIDE (avbestill + endre time)
--
--   «Min side» (/min-side/[token]) er innloggingsfri og token-gated
--   (customers.portal_token). Til nå var siden read-only. Denne
--   migrasjonen lar kunden AVBESTILLE og ENDRE TID på sine egne
--   kommende timer, uten innlogging og uten ny RLS-flate:
--
--     portal_cancel_booking(token, booking)         -> status-tekst
--     portal_reschedule_slots(token, booking, dato) -> HH:MM[]
--     portal_reschedule_booking(token, booking, dato, tid) -> status
--
--   Alle tre er SECURITY DEFINER og verifiserer at bookingen faktisk
--   tilhører kunden bak tokenet FØR de gjør noe – en fremmed uten
--   tokenet kan ikke røre andres timer. Ledig-tid valideres SERVER-SIDE
--   på nytt i reschedule (ikke bare i UI), så et direkte RPC-kall ikke
--   kan booke en opptatt/ugyldig tid. Tidspunkt bygges med
--   'Europe/Oslo' – nøyaktig som available_slots – så tiden blir riktig
--   uavhengig av serverens tidssone.
--
--   Idempotent (create or replace). Ingen nye tabeller/kolonner.
-- =====================================================================

-- Intern hjelper: kunde-id for et gyldig (token, booking)-par, ellers null.
create or replace function portal_owner_customer(p_token uuid, p_booking uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select b.customer_id
  from bookings b
  join customers c on c.id = b.customer_id
  where b.id = p_booking
    and c.portal_token = p_token;
$$;
grant execute on function portal_owner_customer(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Avbestill egen kommende time. Status: ok | already | too_late | not_found
-- ---------------------------------------------------------------------
create or replace function portal_cancel_booking(p_token uuid, p_booking uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_status text;
  v_start timestamptz;
begin
  v_cust := portal_owner_customer(p_token, p_booking);
  if v_cust is null then
    return 'not_found';
  end if;

  select status, start_at into v_status, v_start
    from bookings where id = p_booking;

  if v_status = 'cancelled' then
    return 'already';
  end if;
  -- Bare kommende, aktive timer kan avbestilles på nett.
  if v_status not in ('pending', 'confirmed') or v_start <= now() then
    return 'too_late';
  end if;

  update bookings set status = 'cancelled' where id = p_booking;
  return 'ok';
end $$;
grant execute on function portal_cancel_booking(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Ledige tider (HH:MM) for kundens egen booking på en gitt dato –
-- samme barber + tjeneste som bookingen. Tom liste hvis token/booking
-- ikke hører sammen.
-- ---------------------------------------------------------------------
create or replace function portal_reschedule_slots(
  p_token uuid, p_booking uuid, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_barber text; v_service text;
begin
  v_cust := portal_owner_customer(p_token, p_booking);
  if v_cust is null then
    return '{}';
  end if;

  select st.full_name, s.name into v_barber, v_service
    from bookings b
    left join staff st on st.id = b.staff_id
    left join services s on s.id = b.service_id
    where b.id = p_booking;

  if v_barber is null or v_service is null then
    return '{}';
  end if;

  return available_slots(v_barber, v_service, p_date);
end $$;
grant execute on function portal_reschedule_slots(uuid, uuid, date) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Endre tid på egen kommende time. Tar dato + HH:MM (bygges i Oslo-tid,
-- som available_slots). Validerer ledig-tid server-side.
-- Status: ok | not_found | too_late | past | taken | invalid
-- ---------------------------------------------------------------------
create or replace function portal_reschedule_booking(
  p_token uuid, p_booking uuid, p_date date, p_time text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_status text; v_start_old timestamptz;
  v_barber text; v_service text; v_dur int;
  v_slots text[];
  v_hhmm text;
  v_new_start timestamptz;
begin
  v_cust := portal_owner_customer(p_token, p_booking);
  if v_cust is null then
    return 'not_found';
  end if;

  select b.status, b.start_at, st.full_name, s.name, coalesce(s.duration_min, 30)
    into v_status, v_start_old, v_barber, v_service, v_dur
    from bookings b
    left join staff st on st.id = b.staff_id
    left join services s on s.id = b.service_id
    where b.id = p_booking;

  -- Bare kommende, aktive timer kan endres.
  if v_status not in ('pending', 'confirmed') or v_start_old <= now() then
    return 'too_late';
  end if;
  if v_barber is null or v_service is null then
    return 'invalid';
  end if;

  -- Normaliser tid til HH24:MI og sjekk at den faktisk er ledig nå.
  begin
    v_hhmm := to_char(p_time::time, 'HH24:MI');
  exception when others then
    return 'invalid';
  end;

  v_slots := available_slots(v_barber, v_service, p_date);
  if not (v_hhmm = any (v_slots)) then
    return 'taken';
  end if;

  -- Bygg instant i Oslo-tid – nøyaktig som available_slots.
  v_new_start := (p_date + v_hhmm::time) at time zone 'Europe/Oslo';
  if v_new_start <= now() then
    return 'past';
  end if;

  update bookings set
    start_at = v_new_start,
    end_at   = v_new_start + make_interval(mins => v_dur)
  where id = p_booking;

  return 'ok';
end $$;
grant execute on function portal_reschedule_booking(uuid, uuid, date, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 0046 — Kasseoppgjør som faktisk avstemmer (talt vs forventet per måte)
-- ---------------------------------------------------------------------
-- =====================================================================
-- 0046 – KASSEOPPGJØR SOM FAKTISK AVSTEMMER
--
--   Til nå lagret et dagsoppgjør bare ett totalbeløp (cash_settlements.
--   total_nok) – ingen sammenligning mot forventet salg, ingen
--   differanse. Selve poenget (fange avvik) manglet.
--
--   Denne migrasjonen legger til talt beløp PER betalingsmåte og et
--   snapshot av FORVENTET beløp per betalingsmåte (fra salget den
--   datoen), regnet ut server-side når oppgjøret lagres. Avviket
--   (talt − forventet) regnes ut ved visning. Gamle rader har NULL i
--   de nye kolonnene og vises som «uten avstemming».
--
--   Kun nye, nullbare kolonner. Ingen RLS-endring (tabellen er allerede
--   admin-only). Idempotent.
-- =====================================================================

alter table cash_settlements
  add column if not exists counted_cash   numeric(10,2),
  add column if not exists counted_card   numeric(10,2),
  add column if not exists counted_vipps  numeric(10,2),
  add column if not exists expected_cash  numeric(10,2),
  add column if not exists expected_card  numeric(10,2),
  add column if not exists expected_vipps numeric(10,2);


-- ---------------------------------------------------------------------
-- 0047 — Én timeutnyttelses-definisjon (turnus + åpningstid-fallback)
-- ---------------------------------------------------------------------
-- =====================================================================
-- 0047 – ÉN timeutnyttelses-definisjon (turnus, med åpningstid som fallback)
--
--   Bakgrunn: Nøkkeltall regnet mot flat åpningstid (09–21 × barbere),
--   mens Produktivitet regnet mot turnus (turnus_capacity_minutes, 0042).
--   To ulike tall for samme sak. I tillegg viste Produktivitet «/ 0 t» så
--   lenge turnus (staff_hours) ikke var fylt inn.
--
--   Denne migrasjonen gjør turnus_capacity_minutes til ÉN felles kilde
--   som BEGGE sidene bruker, og legger til en FALLBACK: en aktiv barber
--   UTEN turnus regnes mot salongens åpningstid (salon_hours, 0026) i
--   stedet for 0 — nøyaktig som available_slots faller tilbake. Fravær
--   (absences + heldags-avvik), delvis fri og ekstravakter justeres likt
--   for begge, så tallet er meningsfullt før turnus fylles inn, og blir
--   turnus-presist når den er det.
--
--   Kun redefinering av funksjonen. Idempotent.
-- =====================================================================
create or replace function turnus_capacity_minutes(p_from date, p_to date)
returns table (staff_id uuid, minutes numeric)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select
      d::date                            as work_date,
      turnus_week_parity(d::date)        as parity,
      extract(dow from d::date)::int     as dow
    from generate_series(p_from, p_to, interval '1 day') as d
  ),
  active as (
    select
      s.id,
      exists (select 1 from staff_hours h where h.staff_id = s.id) as has_turnus
    from staff s
    where s.active = true
  ),
  -- Kapasitet-minutter per aktiv ansatt per dag:
  --   har turnus  → turnus for ukedag + paritet (0 = hver uke)
  --   uten turnus → salongens åpningstid den ukedagen (fallback)
  base as (
    select
      a.id       as staff_id,
      dd.work_date,
      case when a.has_turnus then
        coalesce((
          select sum(extract(epoch from (h.end_time - h.start_time)) / 60.0)
          from staff_hours h
          where h.staff_id = a.id
            and h.weekday = dd.dow
            and h.week_parity in (0, dd.parity)
        ), 0)
      else
        coalesce((
          select extract(epoch from (sh.close_t - sh.open_t)) / 60.0
          from salon_hours(dd.dow) sh
        ), 0)
      end        as base_min
    from active a
    cross join days dd
  ),
  adj as (
    select
      b.staff_id,
      b.base_min,
      (
        exists (
          select 1 from absences ab
          where ab.staff_id = b.staff_id
            and b.work_date between ab.from_date and ab.to_date
        )
        or exists (
          select 1 from staff_exceptions e
          where e.staff_id = b.staff_id
            and e.date = b.work_date
            and e.kind = 'off'
            and e.start_time is null
        )
      ) as full_off,
      coalesce((
        select sum(extract(epoch from (e.end_time - e.start_time)) / 60.0)
        from staff_exceptions e
        where e.staff_id = b.staff_id
          and e.date = b.work_date
          and e.kind = 'off'
          and e.start_time is not null
          and e.end_time is not null
      ), 0) as partial_off_min,
      coalesce((
        select sum(extract(epoch from (e.end_time - e.start_time)) / 60.0)
        from staff_exceptions e
        where e.staff_id = b.staff_id
          and e.date = b.work_date
          and e.kind = 'extra'
          and e.start_time is not null
          and e.end_time is not null
      ), 0) as extra_min
    from base b
  )
  select
    staff_id,
    sum(
      case
        when full_off then 0
        else greatest(0, base_min - partial_off_min) + extra_min
      end
    )::numeric as minutes
  from adj
  group by staff_id;
$$;
grant execute on function turnus_capacity_minutes(date, date) to authenticated;


-- ---------------------------------------------------------------------
-- 0048 — Hurtigsalg / drop-in i kassen (salg uten booking)
-- ---------------------------------------------------------------------
-- =====================================================================
-- 0048 – HURTIGSALG / DROP-IN I KASSEN (uten booking)
--
--   Lar kassen ta betalt for en walk-in UTEN å opprette booking først:
--   en behandling (tjeneste) og/eller varer over disk. Kundeinfo
--   (navn/e-post/telefon) kan fylles inn og lagres i kundekartoteket, og
--   kunden kan valgfritt legges til som «medlem» (samtykke til
--   klubb/markedsføring → goder).
--
--   Alt i én transaksjon (som record_sale, 0044): oppretter/oppdaterer
--   kunde, oppretter salg (uten booking), legger tjeneste- + produktlinjer,
--   trekker ned lager og logger. Priser hentes ALLTID server-side
--   (services/products), aldri fra klienten. Kun shop/admin.
--
--   Idempotent (create or replace). Ingen nye tabeller/kolonner.
-- =====================================================================
create or replace function record_walkin_sale(
  p_staff uuid,
  p_payment_method text,
  p_service text default null,           -- behandling (tjenestenavn), valgfri
  p_products jsonb default '[]'::jsonb,   -- [{"id": uuid, "qty": n}]
  p_customer jsonb default null,          -- {"name":..,"email":..,"phone":..}
  p_make_member boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_name text; v_email text; v_phone text;
  v_sale uuid;
  v_total numeric(10,2) := 0;
  v_service_id uuid; v_service_price numeric;
  v_item jsonb; v_prod record; v_qty int; v_new int;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  -- Det må faktisk selges noe.
  if (p_service is null or trim(p_service) = '')
     and coalesce(jsonb_array_length(p_products), 0) = 0 then
    raise exception 'Ingenting å selge – velg behandling eller vare.';
  end if;

  -- Kunde (valgfri): match e-post, ellers telefon, ellers opprett ny.
  if p_customer is not null then
    v_name  := nullif(trim(p_customer->>'name'), '');
    v_email := nullif(trim(p_customer->>'email'), '');
    v_phone := nullif(trim(p_customer->>'phone'), '');

    if v_email is not null then
      select id into v_customer from customers
        where lower(trim(email)) = lower(v_email) limit 1;
    end if;
    if v_customer is null and v_phone is not null then
      select id into v_customer from customers
        where regexp_replace(coalesce(phone, ''), '\s', '', 'g')
            = regexp_replace(v_phone, '\s', '', 'g') limit 1;
    end if;

    if v_customer is null and (v_name is not null or v_email is not null or v_phone is not null) then
      insert into customers (full_name, email, phone, source)
        values (coalesce(v_name, 'Drop-in'), v_email, v_phone, 'Drop-in kasse')
        returning id into v_customer;
    elsif v_customer is not null then
      update customers set
        full_name = coalesce(v_name, full_name),
        email     = coalesce(v_email, email),
        phone     = coalesce(v_phone, phone)
      where id = v_customer;
    end if;

    -- «Medlem» = samtykke til klubb/markedsføring (goder). Klubbnivå utledes
    -- automatisk av forbruk/besøk (0034).
    if p_make_member and v_customer is not null then
      update customers set marketing_consent = true, marketing_consent_at = now()
        where id = v_customer;
    end if;
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (null, p_staff, v_customer, 0,
            nullif(trim(coalesce(p_payment_method, '')), ''))
    returning id into v_sale;

  -- Behandling (tjeneste) – pris server-side.
  if p_service is not null and trim(p_service) <> '' then
    select id, price_nok into v_service_id, v_service_price
      from services where name = p_service and active = true limit 1;
    if v_service_id is null then
      raise exception 'Fant ikke behandlingen';
    end if;
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_service_id, 1, coalesce(v_service_price, 0));
    v_total := v_total + coalesce(v_service_price, 0);
  end if;

  -- Varer – pris fra products, lager ned + logg.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select id, name, price_nok into v_prod
      from products where id = (v_item->>'id')::uuid and active = true
      for update;
    if not found then
      raise exception 'Fant ikke produktet';
    end if;
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'product', v_prod.id, v_prod.name, v_qty, v_prod.price_nok);
    v_total := v_total + (v_prod.price_nok * v_qty);
    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  update sales set total_nok = v_total where id = v_sale;
  return v_sale;
end $$;

grant execute on function record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean) to authenticated;


-- =====================================================================
-- NYTT FRA ØKTA 21. SEPT 2026 (kjøres etter alt over)
--   0049 + 0050: rabatt/splittbetaling (manglet i denne fila fra før).
--   0051: legg «eier» til rolle-enumet (user_role).
--   0052: eier teller som admin i RLS + shop-flags (kasse-brytere).
--   0053: nivåer & pris per nivå x tjeneste + tjeneste-tilknytning.
-- Alt er idempotent. Funksjonene i 0052 bruker role::text, så hele
-- blokka kan limes inn samlet og kjøres i én omgang.
-- =====================================================================

-- =====================================================================
-- 0049 – RABATT + SPLITTBETALING I KASSEN
--
--   To ting kassen manglet ved betaling av en time:
--     • Rabatt: gi et avslag i kroner på totalen (kampanje, klipp, kulanse).
--     • Splittbetaling: dele én betaling på flere måter (f.eks. 200 kontant
--       + resten kort).
--
--   Datamodell:
--     • sales.discount_nok  – rabatt i kr trukket fra brutto. total_nok blir
--       NETTO (brutto − rabatt), så alle eksisterende sum-spørringer stemmer.
--     • sale_payments       – én rad per betalingsmåte på et salg. Autoritativ
--       kilde for hva som faktisk kom inn per måte. Enkeltbetaling gir én rad,
--       delt betaling flere. Kasseoppgjøret (0046) avstemmer mot denne.
--
--   record_sale utvides med p_discount + p_payments. Den gamle 3-arg-varianten
--   DROPPES (completeBooking oppdateres i samme slipp). Summen av p_payments må
--   stemme med netto (± 1 kr for øreavrunding), ellers rulles ALT tilbake –
--   samme atomiske garanti som før (jf. 0044).
--
--   reopen_booking trenger ingen endring: sale_payments faller med cascade når
--   salget slettes, og discount_nok ligger på sales-raden.
-- =====================================================================

-- --- Rabattkolonne på salget ------------------------------------------
alter table sales
  add column if not exists discount_nok numeric(10,2) not null default 0;

-- --- Betalingslinjer (splittbetaling) ---------------------------------
create table if not exists sale_payments (
  id         uuid primary key default uuid_generate_v4(),
  sale_id    uuid not null references sales(id) on delete cascade,
  method     text not null,
  amount     numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists sale_payments_sale_idx on sale_payments(sale_id);

alter table sale_payments enable row level security;

-- Lesing: admin alt, shop lese – speiler sales. Skriving skjer kun via
-- SECURITY DEFINER-RPC-en record_sale, så ingen insert-policy trengs.
drop policy if exists sale_payments_admin_all on sale_payments;
create policy sale_payments_admin_all on sale_payments
  for all using (is_admin()) with check (is_admin());

drop policy if exists sale_payments_shop_read on sale_payments;
create policy sale_payments_shop_read on sale_payments
  for select using (is_shop_or_admin());

-- --- record_sale: rabatt + splittbetaling -----------------------------
-- Bytt ut den gamle 3-arg-varianten fullstendig.
drop function if exists record_sale(uuid, text, jsonb);

create or replace function record_sale(
  p_booking        uuid,
  p_payment_method text  default null,
  p_products       jsonb default '[]'::jsonb,
  p_discount       numeric default 0,
  p_payments       jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking  record;
  v_sale     uuid;
  v_gross    numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_net      numeric(10,2) := 0;
  v_item     jsonb;
  v_prod     record;
  v_qty      int;
  v_new      int;
  v_pay      jsonb;
  v_paysum   numeric(10,2) := 0;
  v_paycount int := 0;
  v_method   text;
  v_amount   numeric(10,2);
  v_single   text;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  -- Lås bookingen: samtidige kall serialiseres, så et dobbelttrykk ikke
  -- kan lage to salg for samme time.
  select id, staff_id, customer_id, service_id, price_nok, status
    into v_booking
    from bookings
    where id = p_booking
    for update;
  if not found then
    raise exception 'Fant ikke timen';
  end if;
  if v_booking.status = 'completed' then
    raise exception 'Timen er allerede fullført';
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (p_booking, v_booking.staff_id, v_booking.customer_id, 0, null)
    returning id into v_sale;

  -- Tjenestelinje (prisen ble satt server-side da timen ble booket).
  if v_booking.service_id is not null then
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_booking.service_id, 1,
              coalesce(v_booking.price_nok, 0));
    v_gross := v_gross + coalesce(v_booking.price_nok, 0);
  end if;

  -- Produktlinjer – pris hentes fra products, aldri fra klienten.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));

    select id, name, price_nok
      into v_prod
      from products
      where id = (v_item->>'id')::uuid and active = true
      for update;
    if not found then
      raise exception 'Fant ikke produktet';
    end if;

    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'product', v_prod.id, v_prod.name, v_qty, v_prod.price_nok);
    v_gross := v_gross + (v_prod.price_nok * v_qty);

    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id
      returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  -- Rabatt: begrenses til [0, brutto]. Netto = brutto − rabatt.
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_gross);
  v_net := v_gross - v_discount;

  -- ---- Betaling ------------------------------------------------------
  -- Splittbetaling hvis p_payments er gitt: valider hver linje, summér og
  -- krev at summen matcher netto (± 1 kr for avrunding). Skriv én
  -- sale_payments-rad per linje.
  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    for v_pay in select * from jsonb_array_elements(p_payments)
    loop
      v_method := nullif(trim(coalesce(v_pay->>'method', '')), '');
      v_amount := round(coalesce((v_pay->>'amount')::numeric, 0), 2);
      if v_method is null then
        raise exception 'Betalingslinje mangler betalingsmåte';
      end if;
      if v_amount <= 0 then
        continue;  -- hopp over tomme/0-linjer
      end if;
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_method, v_amount);
      v_paysum := v_paysum + v_amount;
      v_paycount := v_paycount + 1;
      v_single := v_method;
    end loop;

    if v_paycount = 0 then
      raise exception 'Ingen gyldige betalingslinjer';
    end if;
    if abs(v_paysum - v_net) > 1 then
      raise exception 'Betaling (% kr) stemmer ikke med totalen (% kr)',
        round(v_paysum), round(v_net);
    end if;

    -- payment_method: enkeltmåte hvis bare én linje, ellers «Delt».
    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = case when v_paycount = 1 then v_single else 'Delt' end
      where id = v_sale;

  else
    -- Enkeltbetaling: hele netto på én måte. Skriv også en sale_payments-rad
    -- (når måte er oppgitt) så kasseoppgjøret har én ensartet kilde.
    v_single := nullif(trim(coalesce(p_payment_method, '')), '');
    if v_single is not null and v_net > 0 then
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_single, v_net);
    end if;
    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = v_single
      where id = v_sale;
  end if;

  update bookings set status = 'completed' where id = p_booking;

  return v_sale;
end $$;

grant execute on function record_sale(uuid, text, jsonb, numeric, jsonb) to authenticated;


-- =====================================================================
-- 0050 – RABATT + SPLITTBETALING I HURTIGSALG (drop-in)
--
--   Speiler 0049 (record_sale) for hurtigsalg uten booking: rabatt i kr og
--   splittbetaling over flere måter. Samme datamodell – rabatt trekkes fra
--   brutto (total_nok = netto), og hver betaling skrives som en rad i
--   sale_payments (også ved enkeltbetaling), så kasseoppgjøret avstemmer
--   likt uansett hvor salget kom fra.
--
--   Den gamle 6-arg-varianten DROPPES; recordWalkinSale oppdateres i samme
--   slipp. Sum av p_payments må matche netto (± 1 kr), ellers rulles ALT
--   tilbake.
--
--   Forutsetter 0049 (sale_payments + sales.discount_nok finnes).
-- =====================================================================
drop function if exists record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean);

create or replace function record_walkin_sale(
  p_staff          uuid,
  p_payment_method text,
  p_service        text default null,
  p_products       jsonb default '[]'::jsonb,
  p_customer       jsonb default null,
  p_make_member    boolean default false,
  p_discount       numeric default 0,
  p_payments       jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_name text; v_email text; v_phone text;
  v_sale uuid;
  v_gross    numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_net      numeric(10,2) := 0;
  v_service_id uuid; v_service_price numeric;
  v_item jsonb; v_prod record; v_qty int; v_new int;
  v_pay jsonb; v_paysum numeric(10,2) := 0; v_paycount int := 0;
  v_method text; v_amount numeric(10,2); v_single text;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  if (p_service is null or trim(p_service) = '')
     and coalesce(jsonb_array_length(p_products), 0) = 0 then
    raise exception 'Ingenting å selge – velg behandling eller vare.';
  end if;

  -- Kunde (valgfri): match e-post, ellers telefon, ellers opprett ny.
  if p_customer is not null then
    v_name  := nullif(trim(p_customer->>'name'), '');
    v_email := nullif(trim(p_customer->>'email'), '');
    v_phone := nullif(trim(p_customer->>'phone'), '');

    if v_email is not null then
      select id into v_customer from customers
        where lower(trim(email)) = lower(v_email) limit 1;
    end if;
    if v_customer is null and v_phone is not null then
      select id into v_customer from customers
        where regexp_replace(coalesce(phone, ''), '\s', '', 'g')
            = regexp_replace(v_phone, '\s', '', 'g') limit 1;
    end if;

    if v_customer is null and (v_name is not null or v_email is not null or v_phone is not null) then
      insert into customers (full_name, email, phone, source)
        values (coalesce(v_name, 'Drop-in'), v_email, v_phone, 'Drop-in kasse')
        returning id into v_customer;
    elsif v_customer is not null then
      update customers set
        full_name = coalesce(v_name, full_name),
        email     = coalesce(v_email, email),
        phone     = coalesce(v_phone, phone)
      where id = v_customer;
    end if;

    if p_make_member and v_customer is not null then
      update customers set marketing_consent = true, marketing_consent_at = now()
        where id = v_customer;
    end if;
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (null, p_staff, v_customer, 0, null)
    returning id into v_sale;

  -- Behandling (tjeneste) – pris server-side.
  if p_service is not null and trim(p_service) <> '' then
    select id, price_nok into v_service_id, v_service_price
      from services where name = p_service and active = true limit 1;
    if v_service_id is null then
      raise exception 'Fant ikke behandlingen';
    end if;
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_service_id, 1, coalesce(v_service_price, 0));
    v_gross := v_gross + coalesce(v_service_price, 0);
  end if;

  -- Varer – pris fra products, lager ned + logg.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select id, name, price_nok into v_prod
      from products where id = (v_item->>'id')::uuid and active = true
      for update;
    if not found then
      raise exception 'Fant ikke produktet';
    end if;
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'product', v_prod.id, v_prod.name, v_qty, v_prod.price_nok);
    v_gross := v_gross + (v_prod.price_nok * v_qty);
    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  -- Rabatt: begrenses til [0, brutto]. Netto = brutto − rabatt.
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_gross);
  v_net := v_gross - v_discount;

  -- Betaling: splittbetaling hvis p_payments er gitt, ellers enkeltbetaling.
  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    for v_pay in select * from jsonb_array_elements(p_payments)
    loop
      v_method := nullif(trim(coalesce(v_pay->>'method', '')), '');
      v_amount := round(coalesce((v_pay->>'amount')::numeric, 0), 2);
      if v_method is null then
        raise exception 'Betalingslinje mangler betalingsmåte';
      end if;
      if v_amount <= 0 then
        continue;
      end if;
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_method, v_amount);
      v_paysum := v_paysum + v_amount;
      v_paycount := v_paycount + 1;
      v_single := v_method;
    end loop;

    if v_paycount = 0 then
      raise exception 'Ingen gyldige betalingslinjer';
    end if;
    if abs(v_paysum - v_net) > 1 then
      raise exception 'Betaling (% kr) stemmer ikke med totalen (% kr)',
        round(v_paysum), round(v_net);
    end if;

    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = case when v_paycount = 1 then v_single else 'Delt' end
      where id = v_sale;
  else
    v_single := nullif(trim(coalesce(p_payment_method, '')), '');
    if v_single is not null and v_net > 0 then
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_single, v_net);
    end if;
    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = v_single
      where id = v_sale;
  end if;

  return v_sale;
end $$;

grant execute on function record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean, numeric, jsonb) to authenticated;


-- =====================================================================
-- 0051 — LEGG TIL «eier» I ROLLE-ENUMET (user_role)
--
--   profiles.role er en Postgres-ENUM (user_role), ikke fri tekst. Den må
--   utvides FØR noen funksjon/policy kan lagre eller sammenligne mot 'eier'
--   (samme som da 'revisor' ble tatt i bruk).
--
--   ADD VALUE IF NOT EXISTS er idempotent. Kjør denne linja ALENE først (eller
--   som første setning) – en ny enum-verdi kan ikke BRUKES i samme transaksjon
--   som den legges til. 0052 unngår dette ved å sammenligne på role::text, så
--   det er uansett trygt om hele skriptet limes inn samlet.
-- =====================================================================

alter type user_role add value if not exists 'eier';


-- =====================================================================
-- 0052 — EIER-ROLLE (RLS) + SHOP-INNSTILLINGER (FEATURE-FLAGS)
--
--   Forutsetter 0051 (enum-verdien 'eier' lagt til user_role).
--
--   To grunnmurs-biter for shop-en:
--
--   1) EIER-ROLLE. Dawit (eier) skal ha full tilgang overalt – som admin –
--      OG ingen shop-begrensninger/flagg skal gjelde for han. Vi lar rollen
--      'eier' telle som admin i RLS ved å utvide is_admin() og
--      is_shop_or_admin(). En egen is_owner() brukes til eier-spesifikk
--      bypass i app-laget (flagg-sjekker i kassa). Sammenligningene bruker
--      role::text slik at funksjonene lages trygt uansett om 'eier' allerede
--      er «committet» i enumet (ingen enum-coercion ved CREATE).
--
--   2) SHOP-FLAGS. Ett sted (settings-nøkkelen 'shop_flags') styrer av/på for
--      funksjoner som kan misbrukes: rabatt, familie/venne-rabatt (+ sats),
--      drop-in uten kunde, dra-for-lengde. Bygget som én gjenbrukbar
--      settings-struktur slik at nye brytere blir trivielle senere.
--      get_shop_flags() flettes alltid mot standardverdier (så manglende
--      nøkler får default), og er lesbar for innlogget kasse (security
--      definer) – settings-tabellen selv forblir admin-only.
--
--   Idempotent.
-- =====================================================================

-- --- 1) Eier teller som admin i RLS ----------------------------------
-- role::text unngår enum-coercion ved CREATE (trygt selv om 'eier' nettopp
-- er lagt til enumet i samme økt).
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'eier')
  );
$$;

create or replace function is_shop_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'shop', 'eier')
  );
$$;

-- Eier-spesifikk sjekk (brukes til bypass av shop-flagg i app-laget).
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role::text = 'eier'
  );
$$;

-- --- 2) Shop-flags i settings ----------------------------------------
-- Standardverdier valgt for å bevare dagens oppførsel: rabatt og drop-in
-- uten kunde er PÅ i dag → default true. Familie/venne-rabatt og
-- dra-for-lengde er nye → default av.
insert into settings (key, value)
values (
  'shop_flags',
  jsonb_build_object(
    'discount_enabled', true,
    'friend_family_discount_enabled', false,
    'friend_family_discount_pct', 20,
    'dropin_without_customer_enabled', true,
    'drag_for_length_enabled', false
  )
)
on conflict (key) do nothing;

-- Les shop-flags, flettet mot standard (manglende nøkler fylles). Security
-- definer + grant til authenticated slik at kassa (shop-rolle) kan lese uten
-- direkte tilgang til settings-tabellen.
create or replace function get_shop_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select
    jsonb_build_object(
      'discount_enabled', true,
      'friend_family_discount_enabled', false,
      'friend_family_discount_pct', 20,
      'dropin_without_customer_enabled', true,
      'drag_for_length_enabled', false
    )
    || coalesce((select value from settings where key = 'shop_flags'), '{}'::jsonb);
$$;
grant execute on function get_shop_flags() to authenticated;

-- Lagre shop-flags. Kun admin/eier (is_admin dekker begge). Fletter patch
-- inn i eksisterende verdi slik at delvise oppdateringer er trygge.
create or replace function set_shop_flags(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb;
begin
  if not is_admin() then
    raise exception 'Ikke tilgang';
  end if;
  insert into settings (key, value)
    values ('shop_flags', coalesce(p_patch, '{}'::jsonb))
  on conflict (key) do update
    set value = settings.value || coalesce(p_patch, '{}'::jsonb)
  returning value into v_new;
  return v_new;
end $$;
grant execute on function set_shop_flags(jsonb) to authenticated;


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



-- =====================================================================
-- 0054 — Venn/familie som egen salgstype (relation_type på sales).
-- =====================================================================

-- =====================================================================
-- 0054 — VENN/FAMILIE SOM EGEN SALGSTYPE
--
--   For å se bruk og hyppighet av venn-/familie-salg tagges salget med en
--   relation_type ('venn' | 'familie'). Settes fra kassa når venn/familie-
--   rabatten brukes. Ligger på sales (dekker både time-salg og hurtigsalg),
--   og settes som et best-effort-oppdatering rett etter at salget er registrert
--   – den atomiske record_sale/record_walkin_sale er urørt.
--
--   Idempotent.
-- =====================================================================

alter table sales
  add column if not exists relation_type text
    check (relation_type is null or relation_type in ('venn', 'familie'));

create index if not exists sales_relation_type_idx
  on sales (relation_type)
  where relation_type is not null;



-- =====================================================================
-- 0055 — Blokker booking (admin sperrer tid for alle ansatte).
-- =====================================================================

-- =====================================================================
-- 0055 — BLOKKER BOOKING (admin sperrer tid for ALLE ansatte)
--
--   Admin kan blokkere hele eller deler av en dag for booking på tvers av
--   alle ansatte (ferie, avspasering, arrangement) – som i Fixit. Blokkerte
--   tider forsvinner fra ledige tider i booking.
--
--   booking_blocks: én rad = en blokkering på en dato. start_time/end_time
--   null = HELE dagen; ellers et tidsintervall. Gjelder alle ansatte.
--
--   available_slots utvides til å respektere blokkeringene (heldags → stengt,
--   delvis → fjerner overlappende slots). Resten av logikken er uendret fra
--   0028. Idempotent.
-- =====================================================================

create table if not exists booking_blocks (
  id         uuid primary key default uuid_generate_v4(),
  block_date date not null,
  start_time time,                       -- null = hele dagen
  end_time   time,
  reason     text,
  created_at timestamptz not null default now(),
  check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);
create index if not exists booking_blocks_date_idx on booking_blocks (block_date);

alter table booking_blocks enable row level security;
drop policy if exists booking_blocks_admin_all on booking_blocks;
create policy booking_blocks_admin_all on booking_blocks
  for all using (is_admin()) with check (is_admin());
drop policy if exists booking_blocks_shop_read on booking_blocks;
create policy booking_blocks_shop_read on booking_blocks
  for select using (is_shop_or_admin());

-- --- available_slots: respekter blokkeringene -------------------------
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

  -- 1) Salongens åpningstid (0026). Stengt → ingen tider.
  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

  -- 1b) Admin-blokkering hele dagen (0055) → stengt for alle.
  if exists (
    select 1 from booking_blocks bb
    where bb.block_date = p_date and bb.start_time is null
  ) then
    return res;
  end if;

  -- 2) Heldags fravær denne datoen → stengt. Gjelder både et heldags-avvik
  --    (staff_exceptions) OG et registrert fravær i datointervall (absences,
  --    fra /admin/fravaer). Sistnevnte blokkerte tidligere IKKE booking.
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

    -- d) Delvis admin-blokkering (0055) fjerner overlappende slots for alle.
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

grant execute on function available_slots(text, text, date) to anon, authenticated;



-- =====================================================================
-- 0056 — Generell uke-rotasjon (A/B/C/D… med valgfritt antall uker).
-- =====================================================================

-- =====================================================================
-- 0056 — GENERELL UKE-ROTASJON (A/B/C/D… med valgfritt antall uker)
--
--   Generaliserer A/B-turnusen til et rotasjonsmønster med N uker. Mønsteret
--   defineres én gang (antall uker + en anker-mandag der uke 1 starter);
--   systemet regner ut hvilken uke-indeks (1..N) som gjelder for enhver dato,
--   framover i tid – uten årsskifte-glitch (teller uker fra ankeret, ikke
--   ISO-ukenummer).
--
--   staff_hours.week_parity brukes uendret: 0 = hver uke, 1..N = uke-indeks.
--   available_slots er uendret (bruker turnus_week_parity + week_parity in
--   (0, v_parity), som funker for enhver N).
--
--   Bakoverkompatibelt: seeder rotasjons-config med N=2 og en anker-mandag som
--   REPRODUSERER dagens A/B (utledet fra den eksisterende turnus_anchor), så
--   ingen eksisterende vakter forskyves. Idempotent.
-- =====================================================================

-- Seed rotasjons-config. Bruker den EKSISTERENDE (0025) turnus_week_parity til
-- å finne en anker-mandag som er «uke A» i dag, slik at N=2 gir nøyaktig samme
-- A/B som før. (Kjøres før funksjonen redefineres nedenfor.)
insert into settings (key, value)
select
  'turnus_rotation',
  jsonb_build_object(
    'weeks', 2,
    'anchor', to_char(
      case
        when turnus_week_parity(date_trunc('week', current_date)::date) = 1
          then date_trunc('week', current_date)::date
        else date_trunc('week', current_date)::date - 7
      end,
      'YYYY-MM-DD'
    )
  )
on conflict (key) do nothing;

-- Generalisert uke-indeks (1..N) for en dato. Teller hele uker fra
-- anker-mandagen; faller tilbake til den gamle A/B-logikken hvis config mangler.
create or replace function turnus_week_parity(p_date date)
returns int
language sql stable security definer set search_path = public as $$
  with cfg as (
    select
      coalesce((value->>'weeks')::int, 2) as n,
      (value->>'anchor')::date as anchor
    from settings where key = 'turnus_rotation'
  ),
  legacy as (
    select coalesce((value->>'a_is_even')::boolean, true) as a_is_even
    from settings where key = 'turnus_anchor'
  )
  select case
    when (select anchor from cfg) is not null and coalesce((select n from cfg), 2) >= 1 then
      (
        (
          ( floor(
              (date_trunc('week', p_date)::date - (select anchor from cfg))::numeric / 7
            )::int
            % (select n from cfg)
          ) + (select n from cfg)
        ) % (select n from cfg)
      ) + 1
    else
      case
        when extract(week from p_date)::int % 2 = 0
          then case when (select a_is_even from legacy) then 1 else 2 end
        else case when (select a_is_even from legacy) then 2 else 1 end
      end
  end;
$$;
grant execute on function turnus_week_parity(date) to anon, authenticated;



-- =====================================================================
-- 0057 — Strekkode på produkter + lager-justering fra shop.
-- =====================================================================

-- =====================================================================
-- 0057 — STREKKODE PÅ PRODUKTER + LAGER-JUSTERING FRA SHOP
--
--   1) products.barcode: strekkode/serienr per produkt (settes i admin).
--      Skann i kassa → varen kommer opp automatisk. Unik når satt.
--   2) record_stock_movement: åpnes for shop (is_shop_or_admin) slik at
--      lager-skanning også virker fra shop-iPad (varemottak/justering).
--      Loggen (stock_movements.created_by) sier hvem som gjorde endringen.
--   Idempotent.
-- =====================================================================

alter table products add column if not exists barcode text;

-- Unik strekkode når satt (tom/NULL teller ikke).
create unique index if not exists products_barcode_uidx
  on products (barcode)
  where barcode is not null and barcode <> '';

-- Lager-justering: tidligere kun admin. Nå shop ELLER admin (eier dekkes av
-- is_admin). Selve loggen viser hvem som justerte.
create or replace function record_stock_movement(
  p_product uuid,
  p_delta int,
  p_reason text default 'justering',
  p_note text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_new int;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  update products set stock = greatest(0, stock + p_delta)
    where id = p_product
    returning stock into v_new;
  if v_new is null then
    raise exception 'Fant ikke produktet';
  end if;
  insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
    values (
      p_product, p_delta,
      coalesce(nullif(trim(p_reason), ''), 'justering'),
      nullif(trim(p_note), ''),
      v_new,
      (select id from profiles where id = auth.uid())
    );
  return v_new;
end $$;
grant execute on function record_stock_movement(uuid, int, text, text) to authenticated;

-- Offentlig/shop-lesbart oppslag på strekkode (aktive produkter). Security
-- definer så både admin og shop kan bruke det uten bred tilgang til products.
create or replace function find_product_by_barcode(p_code text)
returns table (id uuid, name text, price_nok numeric, stock int, is_gift_card boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.price_nok, p.stock, p.is_gift_card
  from products p
  where p.active = true
    and p.barcode is not null
    and p.barcode = trim(p_code)
  limit 1;
$$;
grant execute on function find_product_by_barcode(text) to authenticated;



-- =====================================================================
-- 0058 — Digitalt gavekort med strekkode (oppslag + innløsning).
-- =====================================================================

-- =====================================================================
-- 0058 — DIGITALT GAVEKORT MED STREKKODE
--
--   Fysisk gavekort med strekkode kobles til digital saldo: skann strekkode
--   (eller skriv koden) → gavekortet kommer opp med saldo, og kan innløses i
--   kassa. gift_cards er admin-only via RLS, så oppslag/innløsning går gjennom
--   security-definer-RPC-er som også shop kan bruke.
--
--   Idempotent.
-- =====================================================================

alter table gift_cards add column if not exists barcode text;

create unique index if not exists gift_cards_barcode_uidx
  on gift_cards (barcode)
  where barcode is not null and barcode <> '';

-- Oppslag på kode ELLER strekkode. Returnerer saldo + om utløpt.
create or replace function find_gift_card(p_code text)
returns table (
  id uuid, code text, balance_nok numeric, expires_at date, expired boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.code, g.balance_nok, g.expires_at,
         (g.expires_at is not null and g.expires_at < current_date) as expired
  from gift_cards g
  where g.code = trim(p_code)
     or (g.barcode is not null and g.barcode = trim(p_code))
  limit 1;
$$;
grant execute on function find_gift_card(text) to authenticated;

-- Atomisk innløsning: finn kort på kode/strekkode, sjekk ikke utløpt, trekk
-- inntil saldo. Returnerer hvor mye som ble trukket + ny saldo. Shop + admin.
create or replace function redeem_gift_card_by_code(p_code text, p_amount numeric)
returns table (redeemed numeric, new_balance numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_balance numeric(10,2);
  v_expired boolean;
  v_take numeric(10,2);
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Ugyldig beløp';
  end if;

  select g.id, g.balance_nok,
         (g.expires_at is not null and g.expires_at < current_date)
    into v_id, v_balance, v_expired
  from gift_cards g
  where g.code = trim(p_code)
     or (g.barcode is not null and g.barcode = trim(p_code))
  for update
  limit 1;

  if v_id is null then
    raise exception 'Fant ikke gavekortet';
  end if;
  if v_expired then
    raise exception 'Gavekortet er utløpt';
  end if;
  if v_balance <= 0 then
    raise exception 'Gavekortet er tomt';
  end if;

  v_take := least(round(p_amount, 2), v_balance);
  update gift_cards set balance_nok = balance_nok - v_take where id = v_id;

  redeemed := v_take;
  new_balance := v_balance - v_take;
  return next;
end $$;
grant execute on function redeem_gift_card_by_code(text, numeric) to authenticated;



-- ---------------------------------------------------------------------
-- 0059 — Kundeklubb: helt datadrevne nivåer (legg til / slett / omordne)
-- Admin kan nå legge til nye topp-nivåer (Platinum), slette og omordne
-- nivåer uten kodeendring. Rangen styres av sort_order (høyere = bedre).
-- ---------------------------------------------------------------------
-- ---------- Rang-kolonne (sort_order) ----------
alter table membership_tiers
  add column if not exists sort_order int not null default 0;

-- Backfill: gi eksisterende nivåer en rang fra id-en sin (1/2/3 → 1/2/3),
-- slik at rekkefølgen er identisk med før. Rører bare rader som ennå ikke
-- har fått en rang (default 0), så admin sine egne omordninger bevares.
update membership_tiers set sort_order = id where sort_order = 0;

-- ---------- Nivå-utledning: ranger på sort_order i stedet for id ----------
-- Ellers byte-identisk med 0034: samme grunnlag (forbruk + fullførte besøk),
-- samme ELLER-regel, samme «neste nivå»-beregning — bare rangert på sort_order
-- så nye/omordnede nivåer havner riktig.
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
  select coalesce(sum(total_nok), 0) into v_spend
    from sales where customer_id = p_customer;
  select count(*) into v_visits
    from bookings where customer_id = p_customer and status = 'completed';

  -- HØYESTE nivå (etter sort_order) der spend >= min_spend ELLER visits >= min_visits.
  select * into v_tier
    from membership_tiers
   where v_spend >= min_spend or v_visits >= min_visits
   order by sort_order desc, id desc
   limit 1;

  -- Sikkerhetsnett: ingen terskel matcher → laveste definerte nivå.
  if v_tier.id is null then
    select * into v_tier from membership_tiers order by sort_order asc, id asc limit 1;
  end if;

  -- Neste nivå = laveste nivå med høyere sort_order enn det oppnådde.
  select * into v_next
    from membership_tiers
   where sort_order > v_tier.sort_order
   order by sort_order asc, id asc
   limit 1;

  return query select
    v_tier.id, v_tier.name, v_tier.benefit, v_tier.color,
    v_spend, coalesce(v_visits, 0),
    v_next.name, v_next.min_spend, v_next.min_visits;
end $$;

grant execute on function customer_membership(uuid) to authenticated;

-- ---------- Legg til nytt nivå (atomisk id + sort_order) ----------
-- id og sort_order tildeles som max+1, så et nytt nivå blir det nye toppnivået
-- (admin kan omordne etterpå). Security definer + is_admin()-vakt: kun admin/
-- eier kan opprette. Returnerer den nye raden.
create or replace function membership_tier_add(
  p_name       text,
  p_min_spend  numeric,
  p_min_visits int,
  p_benefit    text,
  p_color      text
)
returns membership_tiers
language plpgsql security definer set search_path = public as $$
declare
  v_id    smallint;
  v_order int;
  v_row   membership_tiers;
begin
  if not is_admin() then
    raise exception 'Kun admin kan legge til nivå';
  end if;

  select coalesce(max(id), 0) + 1        into v_id    from membership_tiers;
  select coalesce(max(sort_order), 0) + 1 into v_order from membership_tiers;

  insert into membership_tiers (id, name, min_spend, min_visits, benefit, color, sort_order)
  values (
    v_id,
    coalesce(nullif(trim(p_name), ''), 'Nytt nivå'),
    greatest(coalesce(p_min_spend, 0), 0),
    greatest(coalesce(p_min_visits, 0), 0),
    nullif(trim(p_benefit), ''),
    nullif(trim(p_color), ''),
    v_order
  )
  returning * into v_row;

  return v_row;
end $$;

grant execute on function membership_tier_add(text, numeric, int, text, text) to authenticated;

-- ---------- Slett nivå (nekt hvis det er det siste) ----------
-- Det må alltid finnes minst ett nivå, ellers har ingen kunder et nivå.
create or replace function membership_tier_delete(p_id smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_admin() then
    raise exception 'Kun admin kan slette nivå';
  end if;

  select count(*) into v_count from membership_tiers;
  if v_count <= 1 then
    raise exception 'Kan ikke slette det siste nivået';
  end if;

  delete from membership_tiers where id = p_id;
end $$;

grant execute on function membership_tier_delete(smallint) to authenticated;

-- ---------- Omordne nivå (bytt rang med naboen i ønsket retning) ----------
-- p_dir: 'up' = høyere rang (bedre nivå), 'down' = lavere rang. Bytter
-- sort_order med det nærmeste nivået i den retningen. No-op om det ikke finnes
-- en nabo (allerede øverst/nederst). Ingen unik-constraint på sort_order, så
-- byttet er trygt.
create or replace function membership_tier_move(p_id smallint, p_dir text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    membership_tiers;
  v_other membership_tiers;
begin
  if not is_admin() then
    raise exception 'Kun admin kan omordne nivå';
  end if;

  select * into v_me from membership_tiers where id = p_id;
  if v_me.id is null then
    return;
  end if;

  if p_dir = 'up' then
    select * into v_other
      from membership_tiers
     where sort_order > v_me.sort_order
     order by sort_order asc, id asc
     limit 1;
  elsif p_dir = 'down' then
    select * into v_other
      from membership_tiers
     where sort_order < v_me.sort_order
     order by sort_order desc, id desc
     limit 1;
  else
    return;
  end if;

  if v_other.id is null then
    return; -- allerede ytterst
  end if;

  update membership_tiers set sort_order = v_other.sort_order where id = v_me.id;
  update membership_tiers set sort_order = v_me.sort_order    where id = v_other.id;
end $$;

grant execute on function membership_tier_move(smallint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 0060 — Kundeklubb: sesong-kuponger til medlemmer
-- Admin utsteder tidsavgrensede rabattkuponger (prosent/fast, per klubbnivå),
-- innløses i kassa. Rabatt beregnes + valideres SERVER-SIDE i salgs-RPC-ene,
-- atomisk. record_sale + record_walkin_sale får valgfri p_campaign
-- (bakoverkompatibel: null = uendret flyt).
-- ---------------------------------------------------------------------
-- ---------- Kupong-tabell ----------
create table if not exists member_campaigns (
  id                 uuid primary key default uuid_generate_v4(),
  name               text not null,
  description        text,
  discount_type      text not null check (discount_type in ('percent', 'fixed')),
  discount_value     numeric(10,2) not null check (discount_value > 0),
  min_tier_sort_order int not null default 0,   -- medlemmets nivå-rang må være >= denne (0 = alle medlemmer)
  starts_at          date,                       -- null = ingen startgrense
  expires_at         date,                       -- null = ingen utløp
  once_per_member    boolean not null default true,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  constraint member_campaigns_percent_max
    check (discount_type <> 'percent' or discount_value <= 100)
);

-- Sperre mot prosent > 100 også på eksisterende tabell (idempotent).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'member_campaigns_percent_max'
  ) then
    alter table member_campaigns
      add constraint member_campaigns_percent_max
      check (discount_type <> 'percent' or discount_value <= 100);
  end if;
end $$;

alter table member_campaigns enable row level security;
drop policy if exists member_campaigns_admin_all on member_campaigns;
create policy member_campaigns_admin_all on member_campaigns
  for all using (is_admin()) with check (is_admin());
drop policy if exists member_campaigns_shop_read on member_campaigns;
create policy member_campaigns_shop_read on member_campaigns
  for select using (is_shop_or_admin());

-- ---------- Innløsnings-logg ----------
create table if not exists member_campaign_redemptions (
  id          uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references member_campaigns(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  sale_id     uuid references sales(id) on delete set null,
  amount_nok  numeric(10,2) not null default 0,
  redeemed_at timestamptz not null default now()
);
create index if not exists mcr_campaign_customer_idx
  on member_campaign_redemptions (campaign_id, customer_id);

alter table member_campaign_redemptions enable row level security;
-- Skriving skjer kun via SECURITY DEFINER (apply_member_campaign), så ingen
-- insert-policy. Lesing: admin alt, shop lese (rapport/oversikt).
drop policy if exists mcr_admin_all on member_campaign_redemptions;
create policy mcr_admin_all on member_campaign_redemptions
  for all using (is_admin()) with check (is_admin());
drop policy if exists mcr_shop_read on member_campaign_redemptions;
create policy mcr_shop_read on member_campaign_redemptions
  for select using (is_shop_or_admin());

-- ---------- Validér + beregn + logg kupong (intern) ----------
-- Kalles KUN fra record_sale / record_walkin_sale (begge security definer).
-- Validerer sesong, klubbnivå og engangsbruk, beregner rabatten mot brutto,
-- logger innløsningen og returnerer rabatten i kr. Feiler noe, kastes en
-- feil som ruller hele salget tilbake. Ikke grantet til klienter.
create or replace function apply_member_campaign(
  p_sale     uuid,
  p_customer uuid,
  p_campaign uuid,
  p_gross    numeric
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_c    member_campaigns;
  v_sort int;
  v_disc numeric(10,2);
begin
  select * into v_c from member_campaigns where id = p_campaign for update;
  if not found or not v_c.active then
    raise exception 'Fant ikke kupongen';
  end if;
  if v_c.starts_at is not null and v_c.starts_at > current_date then
    raise exception 'Kupongen har ikke startet enda';
  end if;
  if v_c.expires_at is not null and v_c.expires_at < current_date then
    raise exception 'Kupongen er utløpt';
  end if;
  if p_customer is null then
    raise exception 'Kupongen krever en registrert kunde';
  end if;

  -- Klubbnivå: medlemmets nivå-rang må være minst kupongens terskel.
  select mt.sort_order into v_sort
    from customer_membership(p_customer) cm
    join membership_tiers mt on mt.id = cm.tier_id;
  if coalesce(v_sort, -1) < v_c.min_tier_sort_order then
    raise exception 'Kupongen gjelder et høyere klubbnivå';
  end if;

  -- Engangsbruk per medlem (kan slås av på kupongen).
  if v_c.once_per_member and exists (
    select 1 from member_campaign_redemptions r
    where r.campaign_id = v_c.id and r.customer_id = p_customer
  ) then
    raise exception 'Kupongen er allerede brukt';
  end if;

  -- Rabatt: prosent av brutto, eller fast kronebeløp. Begrenses til [0, brutto].
  if v_c.discount_type = 'percent' then
    v_disc := round(p_gross * v_c.discount_value / 100.0, 2);
  else
    v_disc := v_c.discount_value;
  end if;
  v_disc := least(greatest(coalesce(v_disc, 0), 0), p_gross);

  -- Ikke «brenn» en engangskupong når det ikke er noe å trekke fra (brutto 0).
  if v_disc <= 0 then
    return 0;
  end if;

  insert into member_campaign_redemptions (campaign_id, customer_id, sale_id, amount_nok)
    values (v_c.id, p_customer, p_sale, v_disc);

  return v_disc;
end $$;

revoke all on function apply_member_campaign(uuid, uuid, uuid, numeric) from public;

-- ---------- Kupong-tilbud for en kunde (til kassa-UI) ----------
-- Returnerer aktive, gyldige kuponger kunden kan bruke nå: innenfor sesong,
-- riktig klubbnivå, og ikke allerede brukt (om engangs). Kun ikke-sensitiv
-- kupong-info for én kunde-id. Kassa bruker denne til å vise valgbare kuponger.
create or replace function member_campaign_offers(p_customer uuid)
returns table (
  id             uuid,
  name           text,
  description    text,
  discount_type  text,
  discount_value numeric,
  expires_at     date
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.description, c.discount_type, c.discount_value, c.expires_at
  from member_campaigns c
  where c.active
    and (c.starts_at is null or c.starts_at <= current_date)
    and (c.expires_at is null or c.expires_at >= current_date)
    and c.min_tier_sort_order <= coalesce((
      select mt.sort_order
        from customer_membership(p_customer) cm
        join membership_tiers mt on mt.id = cm.tier_id
    ), -1)
    and (
      not c.once_per_member
      or not exists (
        select 1 from member_campaign_redemptions r
        where r.campaign_id = c.id and r.customer_id = p_customer
      )
    )
  order by c.discount_value desc, c.name;
$$;
grant execute on function member_campaign_offers(uuid) to authenticated;

-- ---------- record_sale: valgfri medlems-kupong (p_campaign) ----------
-- Identisk med 0049, men med p_campaign: er den satt, beregnes kupong-rabatten
-- server-side og legges til p_discount før klemmingen til [0, brutto].
drop function if exists record_sale(uuid, text, jsonb, numeric, jsonb);
drop function if exists record_sale(uuid, text, jsonb, numeric, jsonb, uuid);

create or replace function record_sale(
  p_booking        uuid,
  p_payment_method text    default null,
  p_products       jsonb   default '[]'::jsonb,
  p_discount       numeric default 0,
  p_payments       jsonb   default null,
  p_campaign       uuid    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking      record;
  v_sale         uuid;
  v_gross        numeric(10,2) := 0;
  v_discount     numeric(10,2) := 0;
  v_campaign_disc numeric(10,2) := 0;
  v_net          numeric(10,2) := 0;
  v_item         jsonb;
  v_prod         record;
  v_qty          int;
  v_new          int;
  v_pay          jsonb;
  v_paysum       numeric(10,2) := 0;
  v_paycount     int := 0;
  v_method       text;
  v_amount       numeric(10,2);
  v_single       text;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  select id, staff_id, customer_id, service_id, price_nok, status
    into v_booking
    from bookings
    where id = p_booking
    for update;
  if not found then
    raise exception 'Fant ikke timen';
  end if;
  if v_booking.status = 'completed' then
    raise exception 'Timen er allerede fullført';
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (p_booking, v_booking.staff_id, v_booking.customer_id, 0, null)
    returning id into v_sale;

  if v_booking.service_id is not null then
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_booking.service_id, 1,
              coalesce(v_booking.price_nok, 0));
    v_gross := v_gross + coalesce(v_booking.price_nok, 0);
  end if;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));

    select id, name, price_nok
      into v_prod
      from products
      where id = (v_item->>'id')::uuid and active = true
      for update;
    if not found then
      raise exception 'Fant ikke produktet';
    end if;

    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'product', v_prod.id, v_prod.name, v_qty, v_prod.price_nok);
    v_gross := v_gross + (v_prod.price_nok * v_qty);

    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id
      returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  -- Medlems-kupong (valgfri): beregnes + valideres + logges server-side.
  if p_campaign is not null then
    v_campaign_disc := apply_member_campaign(v_sale, v_booking.customer_id, p_campaign, v_gross);
  end if;

  -- Rabatt: manuell + kupong, begrenset til [0, brutto]. Netto = brutto − rabatt.
  v_discount := least(greatest(coalesce(p_discount, 0), 0) + v_campaign_disc, v_gross);
  v_net := v_gross - v_discount;

  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    for v_pay in select * from jsonb_array_elements(p_payments)
    loop
      v_method := nullif(trim(coalesce(v_pay->>'method', '')), '');
      v_amount := round(coalesce((v_pay->>'amount')::numeric, 0), 2);
      if v_method is null then
        raise exception 'Betalingslinje mangler betalingsmåte';
      end if;
      if v_amount <= 0 then
        continue;
      end if;
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_method, v_amount);
      v_paysum := v_paysum + v_amount;
      v_paycount := v_paycount + 1;
      v_single := v_method;
    end loop;

    if v_paycount = 0 then
      raise exception 'Ingen gyldige betalingslinjer';
    end if;
    if abs(v_paysum - v_net) > 1 then
      raise exception 'Betaling (% kr) stemmer ikke med totalen (% kr)',
        round(v_paysum), round(v_net);
    end if;

    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = case when v_paycount = 1 then v_single else 'Delt' end
      where id = v_sale;

  else
    v_single := nullif(trim(coalesce(p_payment_method, '')), '');
    if v_single is not null and v_net > 0 then
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_single, v_net);
    end if;
    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = v_single
      where id = v_sale;
  end if;

  update bookings set status = 'completed' where id = p_booking;

  return v_sale;
end $$;

grant execute on function record_sale(uuid, text, jsonb, numeric, jsonb, uuid) to authenticated;

-- ---------- record_walkin_sale: valgfri medlems-kupong (p_campaign) ----------
drop function if exists record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean, numeric, jsonb);
drop function if exists record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean, numeric, jsonb, uuid);

create or replace function record_walkin_sale(
  p_staff          uuid,
  p_payment_method text,
  p_service        text    default null,
  p_products       jsonb   default '[]'::jsonb,
  p_customer       jsonb   default null,
  p_make_member    boolean default false,
  p_discount       numeric default 0,
  p_payments       jsonb   default null,
  p_campaign       uuid    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_name text; v_email text; v_phone text;
  v_sale uuid;
  v_gross    numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_campaign_disc numeric(10,2) := 0;
  v_net      numeric(10,2) := 0;
  v_service_id uuid; v_service_price numeric;
  v_item jsonb; v_prod record; v_qty int; v_new int;
  v_pay jsonb; v_paysum numeric(10,2) := 0; v_paycount int := 0;
  v_method text; v_amount numeric(10,2); v_single text;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  if (p_service is null or trim(p_service) = '')
     and coalesce(jsonb_array_length(p_products), 0) = 0 then
    raise exception 'Ingenting å selge – velg behandling eller vare.';
  end if;

  if p_customer is not null then
    v_name  := nullif(trim(p_customer->>'name'), '');
    v_email := nullif(trim(p_customer->>'email'), '');
    v_phone := nullif(trim(p_customer->>'phone'), '');

    if v_email is not null then
      select id into v_customer from customers
        where lower(trim(email)) = lower(v_email) limit 1;
    end if;
    if v_customer is null and v_phone is not null then
      select id into v_customer from customers
        where regexp_replace(coalesce(phone, ''), '\s', '', 'g')
            = regexp_replace(v_phone, '\s', '', 'g') limit 1;
    end if;

    if v_customer is null and (v_name is not null or v_email is not null or v_phone is not null) then
      insert into customers (full_name, email, phone, source)
        values (coalesce(v_name, 'Drop-in'), v_email, v_phone, 'Drop-in kasse')
        returning id into v_customer;
    elsif v_customer is not null then
      update customers set
        full_name = coalesce(v_name, full_name),
        email     = coalesce(v_email, email),
        phone     = coalesce(v_phone, phone)
      where id = v_customer;
    end if;

    if p_make_member and v_customer is not null then
      update customers set marketing_consent = true, marketing_consent_at = now()
        where id = v_customer;
    end if;
  end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
    values (null, p_staff, v_customer, 0, null)
    returning id into v_sale;

  if p_service is not null and trim(p_service) <> '' then
    select id, price_nok into v_service_id, v_service_price
      from services where name = p_service and active = true limit 1;
    if v_service_id is null then
      raise exception 'Fant ikke behandlingen';
    end if;
    insert into sale_items (sale_id, kind, ref_id, quantity, price_nok)
      values (v_sale, 'service', v_service_id, 1, coalesce(v_service_price, 0));
    v_gross := v_gross + coalesce(v_service_price, 0);
  end if;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select id, name, price_nok into v_prod
      from products where id = (v_item->>'id')::uuid and active = true
      for update;
    if not found then
      raise exception 'Fant ikke produktet';
    end if;
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
      values (v_sale, 'product', v_prod.id, v_prod.name, v_qty, v_prod.price_nok);
    v_gross := v_gross + (v_prod.price_nok * v_qty);
    update products set stock = greatest(0, stock - v_qty)
      where id = v_prod.id returning stock into v_new;
    insert into stock_movements (product_id, delta, reason, new_stock, created_by)
      values (v_prod.id, -v_qty, 'salg', v_new,
              (select id from profiles where id = auth.uid()));
  end loop;

  -- Medlems-kupong (valgfri): beregnes + valideres + logges server-side.
  if p_campaign is not null then
    v_campaign_disc := apply_member_campaign(v_sale, v_customer, p_campaign, v_gross);
  end if;

  -- Rabatt: manuell + kupong, begrenset til [0, brutto]. Netto = brutto − rabatt.
  v_discount := least(greatest(coalesce(p_discount, 0), 0) + v_campaign_disc, v_gross);
  v_net := v_gross - v_discount;

  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    for v_pay in select * from jsonb_array_elements(p_payments)
    loop
      v_method := nullif(trim(coalesce(v_pay->>'method', '')), '');
      v_amount := round(coalesce((v_pay->>'amount')::numeric, 0), 2);
      if v_method is null then
        raise exception 'Betalingslinje mangler betalingsmåte';
      end if;
      if v_amount <= 0 then
        continue;
      end if;
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_method, v_amount);
      v_paysum := v_paysum + v_amount;
      v_paycount := v_paycount + 1;
      v_single := v_method;
    end loop;

    if v_paycount = 0 then
      raise exception 'Ingen gyldige betalingslinjer';
    end if;
    if abs(v_paysum - v_net) > 1 then
      raise exception 'Betaling (% kr) stemmer ikke med totalen (% kr)',
        round(v_paysum), round(v_net);
    end if;

    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = case when v_paycount = 1 then v_single else 'Delt' end
      where id = v_sale;
  else
    v_single := nullif(trim(coalesce(p_payment_method, '')), '');
    if v_single is not null and v_net > 0 then
      insert into sale_payments (sale_id, method, amount)
        values (v_sale, v_single, v_net);
    end if;
    update sales
      set total_nok = v_net,
          discount_nok = v_discount,
          payment_method = v_single
      where id = v_sale;
  end if;

  return v_sale;
end $$;

grant execute on function record_walkin_sale(uuid, text, text, jsonb, jsonb, boolean, numeric, jsonb, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 0061 — Dra-for-lengde: endre en bookings varighet fra kalenderen
-- set_booking_length (security definer): shop/admin drar i nederkanten av en
-- booking for å endre sluttid. Starttid beholdes; min 5 min; ingen overlapp
-- med andre aktive bookinger/blokker for samme barber.
-- ---------------------------------------------------------------------
create or replace function set_booking_length(p_booking uuid, p_end timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_b       record;
  v_min_end timestamptz;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  select id, staff_id, start_at, status
    into v_b
    from bookings
    where id = p_booking
    for update;
  if not found then
    raise exception 'Fant ikke timen';
  end if;

  if v_b.status in ('completed', 'no_show', 'cancelled') then
    raise exception 'Kan ikke endre lengde på en fullført eller kansellert time';
  end if;

  if p_end <= v_b.start_at then
    raise exception 'Sluttid må være etter starttid';
  end if;

  -- Minst 5 minutter.
  v_min_end := v_b.start_at + interval '5 minutes';
  if p_end < v_min_end then
    p_end := v_min_end;
  end if;

  -- Ingen overlapp med en annen aktiv booking/blokk for samme barber.
  if v_b.staff_id is not null and exists (
    select 1
      from bookings o
      where o.staff_id = v_b.staff_id
        and o.id <> v_b.id
        and o.status <> 'cancelled'
        and o.start_at < p_end
        and o.end_at   > v_b.start_at
  ) then
    raise exception 'Den nye lengden overlapper en annen booking';
  end if;

  update bookings set end_at = p_end where id = v_b.id;
end $$;

grant execute on function set_booking_length(uuid, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- 0062 — Bilag til revisor (vouchers)
-- Privat 'vouchers'-bøtte + tabell. Admin laster opp fakturaer/bilag i
-- admin → vises automatisk hos revisor (lese-kun via RLS). Nedlasting via
-- signerte URL-er. Speiler 0033/0038.
-- ---------------------------------------------------------------------
-- Privat Storage-bøtte (public = false). Samme mønster som 0033/0038.
insert into storage.buckets (id, name, public)
values ('vouchers', 'vouchers', false)
on conflict (id) do nothing;

-- storage.objects-policies for bøtta 'vouchers'.
-- Admin (is_admin() = admin/eier) har full tilgang (insert/update/delete/select).
drop policy if exists "vouchers_admin_insert" on storage.objects;
create policy "vouchers_admin_insert" on storage.objects
  for insert with check (bucket_id = 'vouchers' and public.is_admin());

drop policy if exists "vouchers_admin_select" on storage.objects;
create policy "vouchers_admin_select" on storage.objects
  for select using (bucket_id = 'vouchers' and public.is_admin());

drop policy if exists "vouchers_admin_update" on storage.objects;
create policy "vouchers_admin_update" on storage.objects
  for update using (bucket_id = 'vouchers' and public.is_admin());

drop policy if exists "vouchers_admin_delete" on storage.objects;
create policy "vouchers_admin_delete" on storage.objects
  for delete using (bucket_id = 'vouchers' and public.is_admin());

-- Revisor: KUN lesing (select). Speiler profiles-rolleoppslaget som is_admin()
-- og staff_docs_revisor (0038) bruker. Admin/eier er med her også, slik at
-- én select-policy dekker «admin eller revisor». Revisor får ALDRI
-- insert/update/delete på bøtta.
drop policy if exists "vouchers_revisor_select" on storage.objects;
create policy "vouchers_revisor_select" on storage.objects
  for select using (
    bucket_id = 'vouchers'
    and (select role::text from public.profiles where id = auth.uid())
        in ('admin', 'eier', 'revisor')
  );

-- Metadata-tabell for bilagene.
create table if not exists vouchers (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,                    -- visningsnavn/tittel
  supplier      text,                             -- leverandør
  voucher_date  date,                             -- bilagsdato
  kind          text check (kind in ('faktura', 'kvittering', 'bilag', 'annet'))
                default 'bilag',
  amount_nok    numeric(12, 2),                   -- beløp inkl. mva
  vat_nok       numeric(12, 2),                   -- mva-andel
  path          text not null,                    -- sti i Storage-bøtta 'vouchers'
  size_bytes    bigint,
  mime          text,
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists vouchers_date_created_idx
  on vouchers (voucher_date desc, created_at desc);

-- RLS: admin full tilgang, revisor kun lesing.
alter table vouchers enable row level security;

drop policy if exists vouchers_admin_all on vouchers;
create policy vouchers_admin_all on vouchers
  for all using (is_admin()) with check (is_admin());

-- Revisor: KUN select. Samme «admin eller revisor»-uttrykk som storage-policyen.
drop policy if exists vouchers_revisor_read on vouchers;
create policy vouchers_revisor_read on vouchers
  for select using (
    (select role::text from public.profiles where id = auth.uid())
      in ('admin', 'eier', 'revisor')
  );


-- ---------------------------------------------------------------------
-- 0063 — Nettside-CMS (etappe 1): redigerbare bilder for forsiden
-- Offentlig 'site'-bøtte + site_images (hero/galleri, rekkefølge, aktiv).
-- Admin legger til/omordner/skjuler bilder fra Admin → Nettside; forsiden
-- viser aktive, med fallback til de innebygde bildene.
-- ---------------------------------------------------------------------
-- Offentlig Storage-bøtte for nettside-bilder.
insert into storage.buckets (id, name, public)
values ('site', 'site', true)
on conflict (id) do nothing;

-- Kun admin kan laste opp / endre / slette; alle kan lese (offentlig forside).
drop policy if exists "site_admin_insert" on storage.objects;
create policy "site_admin_insert" on storage.objects
  for insert with check (bucket_id = 'site' and public.is_admin());

drop policy if exists "site_admin_update" on storage.objects;
create policy "site_admin_update" on storage.objects
  for update using (bucket_id = 'site' and public.is_admin())
  with check (bucket_id = 'site' and public.is_admin());

drop policy if exists "site_admin_delete" on storage.objects;
create policy "site_admin_delete" on storage.objects
  for delete using (bucket_id = 'site' and public.is_admin());

drop policy if exists "site_public_read" on storage.objects;
create policy "site_public_read" on storage.objects
  for select using (bucket_id = 'site');

-- Metadata for forsidens bilder.
create table if not exists site_images (
  id          uuid primary key default gen_random_uuid(),
  section     text not null check (section in ('hero', 'gallery')),
  kind        text not null check (kind in ('image', 'video')) default 'image',
  path        text not null,                 -- sti i 'site'-bøtta
  alt         text,                          -- alt-tekst (galleri)
  sort_order  int not null default 0,        -- rekkefølge i seksjonen (lav = først)
  active      boolean not null default true, -- inaktive vises kun i forhåndsvisning
  created_at  timestamptz not null default now()
);

create index if not exists site_images_section_order_idx
  on site_images (section, sort_order, created_at);

alter table site_images enable row level security;

-- Offentlig lesing (forsiden er offentlig), admin full tilgang.
drop policy if exists site_images_read on site_images;
create policy site_images_read on site_images
  for select using (true);

drop policy if exists site_images_admin_all on site_images;
create policy site_images_admin_all on site_images
  for all using (is_admin()) with check (is_admin());


-- ---------------------------------------------------------------------
-- 0064 — Nettside-CMS (etappe 2): «Håndverket»-blokkene redigerbare
-- site_craft (bilde + tittel + tekst + rekkefølge + aktiv) på 'site'-bøtta.
-- Admin styrer blokkene fra Admin → Nettside; forsiden viser aktive med
-- fallback til de innebygde.
-- ---------------------------------------------------------------------
create table if not exists site_craft (
  id          uuid primary key default gen_random_uuid(),
  image_path  text not null,                  -- sti i 'site'-bøtta
  title       text not null default '',
  body        text,
  sort_order  int not null default 0,         -- rekkefølge (lav = først)
  active      boolean not null default true,  -- inaktive vises kun i forhåndsvisning
  created_at  timestamptz not null default now()
);

create index if not exists site_craft_order_idx
  on site_craft (sort_order, created_at);

alter table site_craft enable row level security;

-- Offentlig lesing (forsiden er offentlig), admin full tilgang.
drop policy if exists site_craft_read on site_craft;
create policy site_craft_read on site_craft
  for select using (true);

drop policy if exists site_craft_admin_all on site_craft;
create policy site_craft_admin_all on site_craft
  for all using (is_admin()) with check (is_admin());


-- ---------------------------------------------------------------------
-- 0065 — Nettside-CMS (etappe 3): about/banner-seksjoner
-- Utvider site_images.section til hero/gallery/about/banner, så «Om oss»-
-- bildet og neon-banneret også kan byttes fra admin. Enkeltbilder (første
-- aktive), fallback til de innebygde. Gjenbruker 'site'-bøtta.
-- ---------------------------------------------------------------------
do $$
declare c text;
begin
  -- Dropp enhver eksisterende CHECK som nevner 'section' (auto-navngitt eller vår).
  for c in
    select conname from pg_constraint
     where conrelid = 'public.site_images'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%section%'
  loop
    execute format('alter table site_images drop constraint %I', c);
  end loop;

  alter table site_images
    add constraint site_images_section_check
    check (section in ('hero', 'gallery', 'about', 'banner'));
end $$;
