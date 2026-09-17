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
