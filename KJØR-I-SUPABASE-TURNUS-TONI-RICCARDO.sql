-- =====================================================================
-- FAST TURNUS FOR TONI, RICCARDO OG KOCHARI – gjelder fra NÅ (mandag 2. november 2026)
--
-- Faste arbeidstider (ingen rotasjon på timene), faste pauser.
-- Bare fridagene til Toni og Riccardo roterer (uke A/C og B/D).
--
--   TONI      11–19 alle arbeidsdager, pause 14:30–15:00
--             Fri mandag i uke A og C · fri onsdag i uke B og D
--   RICCARDO  12–20 alle arbeidsdager, pause 15:00–15:30
--             Fri onsdag i uke A og C · fri mandag i uke B og D
--             → mandag og onsdag er alltid én av dem på jobb
--   KOCHARI   Mandag, onsdag, torsdag 11–20, pause 14:00–14:30
--             Tirsdag fri (fast) · fredag 17–20 · lørdag 10–20, pause 13:00–13:30
--             Opplæring med Dawit mandag og onsdag 11–13 i oddetallsuker
--             (uke 47, 49, 51 …) beholdes: de dagene er vakta delt i
--             11–14 (opplæring 11–13) og 14:30–20.
--
-- ALL gammel turnus for de tre SLETTES (også gamle perioder), og den nye
-- gjelder fra og med denne uka. Dawits opplæringsvakter røres ikke.
-- Kan kjøres flere ganger.
--
-- Krever: turnus-rotasjon på 4 uker (Admin → Timelister),
--         KJØR-I-SUPABASE-TURNUS-PAUSE.sql og KJØR-I-SUPABASE-TURNUS-OPPLAERING.sql.
-- =====================================================================

alter table staff_hours add column if not exists pause_note text;

do $$
declare
  v_start date := date '2026-11-02';   -- mandag uke 45 (oddetall)
  v_split date := date '2027-01-04';   -- mandag uke 1 2027 (oddetall) – 2026 har uke 53
  v_n     int;
  v_toni  uuid;
  v_ric   uuid;
  v_koc   uuid;
  n       int;
  d       int;
  k       int;
  per     record;
  v_train boolean;
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'staff_hours' and column_name = 'pause_start') then
    raise exception 'Kjør KJØR-I-SUPABASE-TURNUS-PAUSE.sql først (pausen må blokkere booking).';
  end if;

  select coalesce((value->>'weeks')::int, 2) into v_n from settings where key = 'turnus_rotation';
  if coalesce(v_n, 2) <> 4 then
    raise exception 'Turnusen roterer over % uke(r), men denne planen er A–D (4 uker). Sett rotasjonen til 4 uker under Admin → Timelister først.', coalesce(v_n, 2);
  end if;

  -- Finn de tre ansatte (nøyaktig én hver).
  select count(*) into n from staff
   where active and (full_name ilike '%moysa%' or full_name ilike '%antonio%' or full_name ~* '^toni\M');
  if n <> 1 then raise exception 'Fant % aktive ansatte som matcher Toni/Antonio Moysa (skal være 1).', n; end if;
  select id into v_toni from staff
   where active and (full_name ilike '%moysa%' or full_name ilike '%antonio%' or full_name ~* '^toni\M');

  select count(*) into n from staff where active and full_name ilike '%riccardo%';
  if n <> 1 then raise exception 'Fant % aktive ansatte som heter Riccardo (skal være 1).', n; end if;
  select id into v_ric from staff where active and full_name ilike '%riccardo%';

  select count(*) into n from staff where active and full_name ilike '%kochari%';
  if n <> 1 then raise exception 'Fant % aktive ansatte som heter Kochari (skal være 1).', n; end if;
  select id into v_koc from staff where active and full_name ilike '%kochari%';

  -- Rydd: ALL gammel turnus for de tre slettes – den nye er den eneste.
  delete from staff_hours where staff_id in (v_toni, v_ric, v_koc);

  -- TONI og RICCARDO (uke 0 = hver uke, 1–4 = A–D).
  insert into staff_hours (staff_id, weekday, week_parity, start_time, end_time, pause_start, pause_end, valid_from)
  select v.staff, v.wd, v.wk, v.s::time, v.e::time, v.ps::time, v.pe::time, v_start
  from (values
    -- TONI 11–19: mandag uke B+D, onsdag uke A+C, tir/tor/fre/lør hver uke
    (v_toni, 1, 2, '11:00', '19:00', '14:30', '15:00'),
    (v_toni, 1, 4, '11:00', '19:00', '14:30', '15:00'),
    (v_toni, 2, 0, '11:00', '19:00', '14:30', '15:00'),
    (v_toni, 3, 1, '11:00', '19:00', '14:30', '15:00'),
    (v_toni, 3, 3, '11:00', '19:00', '14:30', '15:00'),
    (v_toni, 4, 0, '11:00', '19:00', '14:30', '15:00'),
    (v_toni, 5, 0, '11:00', '19:00', '14:30', '15:00'),
    (v_toni, 6, 0, '11:00', '19:00', '14:30', '15:00'),
    -- RICCARDO 12–20: mandag uke A+C, onsdag uke B+D, tir/tor/fre/lør hver uke
    (v_ric, 1, 1, '12:00', '20:00', '15:00', '15:30'),
    (v_ric, 1, 3, '12:00', '20:00', '15:00', '15:30'),
    (v_ric, 2, 0, '12:00', '20:00', '15:00', '15:30'),
    (v_ric, 3, 2, '12:00', '20:00', '15:00', '15:30'),
    (v_ric, 3, 4, '12:00', '20:00', '15:00', '15:30'),
    (v_ric, 4, 0, '12:00', '20:00', '15:00', '15:30'),
    (v_ric, 5, 0, '12:00', '20:00', '15:00', '15:30'),
    (v_ric, 6, 0, '12:00', '20:00', '15:00', '15:30'),
    -- KOCHARI: torsdag 11–20, fredag 17–20, lørdag 10–20 (tirsdag fri)
    (v_koc, 4, 0, '11:00', '20:00', '14:00', '14:30'),
    (v_koc, 5, 0, '17:00', '20:00', null,    null),
    (v_koc, 6, 0, '10:00', '20:00', '13:00', '13:30')
  ) as v(staff, wd, wk, s, e, ps, pe);

  -- KOCHARI mandag og onsdag 11–20. Oddetallsuker: opplæring 11–13, så
  -- vakta deles (11–14 med opplæring, 14:30–20) for å beholde lunsjpausen.
  -- Én rad per uke-indeks; to perioder fordi 2026 har uke 53.
  for per in
    select v_start as f, v_split - 1 as t, 0 as odd_k    -- uke 45 er oddetall → k=0,2
    union all
    select v_split, null::date, 0                         -- uke 1 2027 er oddetall → k=0,2
  loop
    foreach d in array array[1, 3] loop
      for k in 0 .. v_n - 1 loop
        v_train := (k % 2) = per.odd_k;
        if v_train then
          insert into staff_hours (staff_id, weekday, week_parity, start_time, end_time,
                                   pause_start, pause_end, pause_note, valid_from, valid_to)
          values
            (v_koc, d, turnus_week_parity(per.f + 7 * k), '11:00', '14:00', '11:00', '13:00', 'Opplæring', per.f, per.t),
            (v_koc, d, turnus_week_parity(per.f + 7 * k), '14:30', '20:00', null, null, null, per.f, per.t);
        else
          insert into staff_hours (staff_id, weekday, week_parity, start_time, end_time,
                                   pause_start, pause_end, valid_from, valid_to)
          values (v_koc, d, turnus_week_parity(per.f + 7 * k), '11:00', '20:00', '14:00', '14:30', per.f, per.t);
        end if;
      end loop;
    end loop;
  end loop;

  raise notice 'Turnus for Toni, Riccardo og Kochari lagt inn fra %.', v_start;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- SJEKK 1: Hvilke kalenderuker er A/B/C/D, og når er det opplæring?
-- ---------------------------------------------------------------------
select to_char(d, 'IW') as kalenderuke,
       to_char(d, 'DD.MM') || '–' || to_char(d + 5, 'DD.MM') as man_lor,
       chr(64 + turnus_week_parity(d)) as turnusuke,
       case when to_char(d, 'IW')::int % 2 = 1 then 'opplæring man+ons 11–13' else '' end as kochari
  from (select gs::date as d
          from generate_series(date '2026-11-02', date '2026-11-02' + 49, interval '7 day') gs) w;

-- ---------------------------------------------------------------------
-- SJEKK 2: Hver dag i uke A–D (de første 4 ukene): vakter, antall på jobb
-- ved stengetid (19:30–20:00) og om pausene krasjer.
-- ---------------------------------------------------------------------
with days as (
  select gs::date as dt
    from generate_series(date '2026-11-02', date '2026-11-02' + 27, interval '1 day') gs
   where extract(dow from gs) between 1 and 6
),
h as (
  select dd.dt,
         case when s.full_name ilike '%riccardo%' then 'Riccardo'
              when s.full_name ilike '%kochari%' then 'Kochari' else 'Toni' end as hvem,
         x.start_time, x.end_time, x.pause_start, x.pause_end, x.pause_note
    from days dd
    join staff_hours x
      on x.weekday = extract(dow from dd.dt)::int
     and x.week_parity in (0, turnus_week_parity(dd.dt))
     and (x.valid_from is null or x.valid_from <= dd.dt)
     and (x.valid_to is null or x.valid_to >= dd.dt)
    join staff s on s.id = x.staff_id
   where s.active
     and (s.full_name ilike '%riccardo%' or s.full_name ilike '%kochari%'
          or s.full_name ilike '%moysa%' or s.full_name ilike '%antonio%' or s.full_name ~* '^toni\M')
)
select to_char(dd.dt, 'Dy DD.MM') as dag,
       chr(64 + turnus_week_parity(dd.dt)) as uke,
       coalesce((select string_agg(to_char(start_time,'HH24:MI')||'–'||to_char(end_time,'HH24:MI'), ' + ' order by start_time)
                   from h where h.dt = dd.dt and hvem = 'Toni'), 'fri') as toni,
       coalesce((select string_agg(to_char(start_time,'HH24:MI')||'–'||to_char(end_time,'HH24:MI'), ' + ' order by start_time)
                   from h where h.dt = dd.dt and hvem = 'Riccardo'), 'fri') as riccardo,
       coalesce((select string_agg(to_char(start_time,'HH24:MI')||'–'||to_char(end_time,'HH24:MI')
                                   || coalesce(' ('||pause_note||' '||to_char(pause_start,'HH24')||'–'||to_char(pause_end,'HH24')||')',''),
                                   ' + ' order by start_time)
                   from h where h.dt = dd.dt and hvem = 'Kochari'), 'fri') as kochari,
       (select count(distinct hvem) from h where h.dt = dd.dt and h.end_time >= time '20:00') as ved_stengetid,
       case when exists (
              select 1 from h a join h b on a.dt = b.dt and a.hvem < b.hvem
               where a.dt = dd.dt and a.pause_note is null and b.pause_note is null
                 and a.pause_start < b.pause_end and a.pause_end > b.pause_start)
            then 'PAUSE KRASJER' else 'ok' end as pauser
  from days dd
 order by dd.dt;

-- ---------------------------------------------------------------------
-- SJEKK 3: Bookede timer fra i dag som havner UTENFOR ny turnus
-- (fridag, utenfor arbeidstid, i pause eller opplæring). Disse må flyttes.
-- ---------------------------------------------------------------------
select s.full_name as barber,
       to_char(b.start_at at time zone 'Europe/Oslo', 'Dy DD.MM HH24:MI') as tid,
       chr(64 + turnus_week_parity((b.start_at at time zone 'Europe/Oslo')::date)) as turnusuke,
       b.status::text as status
  from bookings b
  join staff s on s.id = b.staff_id
 where s.active
   and (s.full_name ilike '%riccardo%' or s.full_name ilike '%kochari%'
        or s.full_name ilike '%moysa%' or s.full_name ilike '%antonio%' or s.full_name ~* '^toni\M')
   and (b.start_at at time zone 'Europe/Oslo')::date >= date '2026-11-02'
   and coalesce(b.status::text, '') not in ('cancelled', 'no_show')
   and not exists (
     select 1 from staff_hours h
      where h.staff_id = b.staff_id
        and h.weekday = extract(dow from (b.start_at at time zone 'Europe/Oslo'))::int
        and h.week_parity in (0, turnus_week_parity((b.start_at at time zone 'Europe/Oslo')::date))
        and (h.valid_from is null or h.valid_from <= (b.start_at at time zone 'Europe/Oslo')::date)
        and (h.valid_to   is null or h.valid_to   >= (b.start_at at time zone 'Europe/Oslo')::date)
        and (b.start_at at time zone 'Europe/Oslo')::time >= h.start_time
        and (b.end_at   at time zone 'Europe/Oslo')::time <= h.end_time
        and not (h.pause_start is not null
                 and (b.start_at at time zone 'Europe/Oslo')::time < h.pause_end
                 and (b.end_at   at time zone 'Europe/Oslo')::time > h.pause_start)
   )
 order by b.start_at;
