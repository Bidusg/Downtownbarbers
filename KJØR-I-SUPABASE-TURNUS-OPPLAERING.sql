-- =====================================================================
-- OPPLÆRING I TURNUSEN + NY FAST TURNUS FOR KOCHARI
--
-- 1) staff_hours.pause_note: en fast «pause» kan få en merknad, f.eks.
--    «Opplæring». Tiden er da ikke bookbar for kunder (som en vanlig pause),
--    men regnes som ARBEIDSTID (trekkes ikke fra timene) og vises med
--    merknaden i timeboken og turnusoversikten.
--
-- 2) Kochari fra mandag 2. november 2026 – samme vakter hver uke:
--      Mandag   11–19   (oddetallsuker: opplæring 11–13)
--      Tirsdag  fri
--      Onsdag   11–19   (oddetallsuker: opplæring 11–13)
--      Torsdag  11–19
--      Fredag   17–20
--      Lørdag   11–19
--      Søndag   stengt
--    Oddetallsuker = ISO-ukenummer (45, 47, 49 …). 2026 har uke 53, så
--    2027 legges inn som egen periode for å holde seg på oddetallsukene.
--    Gamle vakter avsluttes søndag 1. november (historikken beholdes).
--
-- Krever KJØR-I-SUPABASE-TURNUS-PAUSE.sql (pausen må blokkere booking).
-- Kan kjøres flere ganger.
-- =====================================================================

alter table staff_hours add column if not exists pause_note text;

do $$
declare
  v_staff  uuid;
  v_n      int;
  v_start  date := date '2026-11-02';   -- mandag uke 45 (oddetall)
  v_split  date := date '2027-01-04';   -- mandag uke 1 2027 (oddetall)
  d        int;
  k        int;
begin
  -- Pausen må faktisk blokkere booking (TURNUS-PAUSE kjørt).
  if not exists (select 1 from information_schema.columns
                  where table_name = 'staff_hours' and column_name = 'pause_start')
     or position('pause_start' in pg_get_functiondef('available_slots_dur(text,int,date)'::regprocedure)) = 0 then
    raise exception 'Kjør KJØR-I-SUPABASE-TURNUS-PAUSE.sql først (pausen må blokkere booking).';
  end if;

  select id into v_staff from staff where full_name ilike '%kochari%' limit 2;
  if v_staff is null then raise exception 'Fant ingen ansatt som heter Kochari.'; end if;
  if (select count(*) from staff where full_name ilike '%kochari%') > 1 then
    raise exception 'Fant flere ansatte med «Kochari» i navnet – rett navnet i skriptet.';
  end if;

  select coalesce((value->>'weeks')::int, 2) into v_n from settings where key = 'turnus_rotation';
  v_n := coalesce(v_n, 2);
  -- Annenhver uke går bare opp når rotasjonen har et partall antall uker
  -- (2, 4, 6 …): da er hver uke-indeks enten alltid oddetall eller alltid
  -- partall. Opplæringen legges på de indeksene som er oddetallsuker.
  if v_n < 2 or v_n % 2 <> 0 then
    raise exception 'Turnusen roterer over % uke(r). Annenhver uke krever et partall antall uker i rotasjonen (Admin → Timelister).', v_n;
  end if;

  -- Rydd: fjern framtidige vakter (også fra en tidligere kjøring av skriptet),
  -- avslutt dagens vakter dagen før den nye turnusen starter.
  delete from staff_hours where staff_id = v_staff and valid_from >= v_start;
  update staff_hours set valid_to = v_start - 1
   where staff_id = v_staff and (valid_to is null or valid_to >= v_start);

  -- Torsdag (4), lørdag (6): 11–19 hver uke. Fredag (5): 17–20.
  insert into staff_hours (staff_id, weekday, start_time, end_time, week_parity, valid_from)
  values (v_staff, 4, '11:00', '19:00', 0, v_start),
         (v_staff, 6, '11:00', '19:00', 0, v_start),
         (v_staff, 5, '17:00', '20:00', 0, v_start);

  -- Mandag (1) og onsdag (3): 11–19 hver uke, opplæring 11–13 i oddetallsukene.
  -- Én rad per uke-indeks i rotasjonen; k = 0, 2, 4 … er oddetallsuker
  -- (startdatoene er mandag i en oddetallsuke).
  foreach d in array array[1, 3] loop
    for k in 0 .. v_n - 1 loop
      insert into staff_hours (staff_id, weekday, start_time, end_time, week_parity, valid_from, valid_to,
                               pause_start, pause_end, pause_note)
      values
        (v_staff, d, '11:00', '19:00', turnus_week_parity(v_start + 7 * k), v_start, v_split - 1,
         case when k % 2 = 0 then time '11:00' end, case when k % 2 = 0 then time '13:00' end,
         case when k % 2 = 0 then 'Opplæring' end),
        (v_staff, d, '11:00', '19:00', turnus_week_parity(v_split + 7 * k), v_split, null,
         case when k % 2 = 0 then time '11:00' end, case when k % 2 = 0 then time '13:00' end,
         case when k % 2 = 0 then 'Opplæring' end);
    end loop;
  end loop;

  raise notice 'Kochari: ny turnus fra % (rotasjon over % uker).', v_start, v_n;
end $$;

-- «Min turnus» for ansatte: vaktene som gjelder i dag (ikke avsluttede eller
-- framtidige perioder om hverandre) + pause/opplæring.
drop function if exists my_turnus();
create function my_turnus()
returns table (weekday smallint, week_parity smallint, start_time time, end_time time,
               pause_start time, pause_end time, pause_note text)
language sql stable security definer set search_path = public as $$
  select h.weekday, h.week_parity, h.start_time, h.end_time, h.pause_start, h.pause_end, h.pause_note
  from staff_hours h
  where h.staff_id = current_staff_id()
    and (h.valid_from is null or h.valid_from <= (now() at time zone 'Europe/Oslo')::date)
    and (h.valid_to   is null or h.valid_to   >= (now() at time zone 'Europe/Oslo')::date)
  order by h.week_parity, h.weekday, h.start_time;
$$;
revoke execute on function my_turnus() from public, anon;
grant  execute on function my_turnus() to authenticated;

drop function if exists my_upcoming_shifts(int);
create function my_upcoming_shifts(p_days int default 21)
returns table (work_date date, weekday int, start_time time, end_time time, week_parity int,
               pause_start time, pause_end time, pause_note text)
language sql stable security definer set search_path = public as $$
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
    turnus_week_parity(dd.work_date),
    h.pause_start,
    h.pause_end,
    h.pause_note
  from days dd
  cross join sid
  join staff_hours h
    on h.staff_id = sid.id
   and h.weekday = extract(dow from dd.work_date)::int
   and h.week_parity in (0, turnus_week_parity(dd.work_date))
   and (h.valid_from is null or h.valid_from <= dd.work_date) and (h.valid_to is null or h.valid_to >= dd.work_date)
  where sid.id is not null
    and not exists (
      select 1 from staff_exceptions e
      where e.staff_id = sid.id and e.date = dd.work_date and e.kind = 'off' and e.start_time is null
    )
    and not exists (
      select 1 from absences a
      where a.staff_id = sid.id and dd.work_date between a.from_date and a.to_date
    )
  order by dd.work_date, h.start_time;
$$;
revoke execute on function my_upcoming_shifts(int) from public, anon;
grant  execute on function my_upcoming_shifts(int) to authenticated;

notify pgrst, 'reload schema';

-- Sjekk: Kocharis turnus fra 2. november.
select case h.weekday when 1 then 'Mandag' when 2 then 'Tirsdag' when 3 then 'Onsdag'
         when 4 then 'Torsdag' when 5 then 'Fredag' when 6 then 'Lørdag' else 'Søndag' end as dag,
       to_char(h.start_time, 'HH24:MI') || '–' || to_char(h.end_time, 'HH24:MI') as vakt,
       case when h.week_parity = 0 then 'hver uke' else 'uke-indeks ' || h.week_parity end as uker,
       coalesce(h.pause_note || ' ' || to_char(h.pause_start, 'HH24:MI') || '–' || to_char(h.pause_end, 'HH24:MI'), '') as opplaering,
       h.valid_from as fra, h.valid_to as til
  from staff_hours h join staff s on s.id = h.staff_id
 where s.full_name ilike '%kochari%' and (h.valid_to is null or h.valid_to >= date '2026-11-02')
 order by h.valid_from, h.weekday, h.week_parity;
