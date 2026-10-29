-- =====================================================================
-- DAWIT LÆRER OPP KOCHARI – samme opplæringsøkter i Dawits turnus
--
--   Mandag og onsdag kl. 11–13 i oddetallsuker (uke 45, 47, 49 …), fra
--   mandag 2. november 2026. Tiden blir stengt for kunder hos Dawit og vises
--   som «Opplæring av Kochari» i timeboken, turnusoversikten og på Dawits
--   «Min turnus».
--
--   • Har Dawit en vanlig vakt mandag/onsdag (hver uke) som dekker 11–13,
--     beholdes den – opplæringen legges inn som en sperret periode i den.
--   • Har han ingen vakt de dagene, legges det inn en egen opplæringsøkt
--     11–13 (bare oddetallsuker), som ikke er bookbar.
--   • Er turnusen hans mer sammensatt (A/B-uker, flere vakter samme dag,
--     egen pause), stopper skriptet uten å endre noe og sier fra.
--
--   Kjør KJØR-I-SUPABASE-TURNUS-OPPLAERING.sql først. Kan kjøres flere ganger.
-- =====================================================================

do $$
declare
  v_staff uuid;
  v_start date := date '2026-11-02';   -- mandag uke 45 (oddetall)
  v_split date := date '2027-01-04';   -- mandag uke 1 2027 (oddetall)
  v_note  text := 'Opplæring av Kochari';
  v_n  int;
  d int;
  k int;
  r record;
  n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'staff_hours' and column_name = 'pause_note') then
    raise exception 'Kjør KJØR-I-SUPABASE-TURNUS-OPPLAERING.sql først.';
  end if;

  select count(*) into n from staff where full_name ilike '%david%' and active;
  if n = 0 then raise exception 'Fant ingen aktiv ansatt som heter David (Dawit).'; end if;
  if n > 1 then raise exception 'Fant flere aktive ansatte med «David» i navnet – rett navnet i skriptet.'; end if;
  select id into v_staff from staff where full_name ilike '%david%' and active;

  select coalesce((value->>'weeks')::int, 2) into v_n from settings where key = 'turnus_rotation';
  v_n := coalesce(v_n, 2);
  -- Annenhver uke går bare opp når rotasjonen har et partall antall uker
  -- (2, 4, 6 …): da er hver uke-indeks enten alltid oddetall eller alltid
  -- partall. Opplæringen legges på de indeksene som er oddetallsuker.
  if v_n < 2 or v_n % 2 <> 0 then
    raise exception 'Turnusen roterer over % uke(r). Annenhver uke krever et partall antall uker i rotasjonen (Admin → Timelister).', v_n;
  end if;

  -- Tidligere kjøring av dette skriptet: fjern opplæringsradene den laget og
  -- åpne igjen vakter den avsluttet (de kjennes igjen på merknaden/datoene).
  delete from staff_hours
   where staff_id = v_staff and weekday in (1, 3) and valid_from >= v_start;
  update staff_hours set valid_to = null
   where staff_id = v_staff and weekday in (1, 3) and valid_to = v_start - 1;

  foreach d in array array[1, 3] loop
    -- Vakter som fortsatt gjelder den dagen.
    select count(*) into n from staff_hours
     where staff_id = v_staff and weekday = d and (valid_to is null or valid_to >= v_start);

    if n = 0 then
      -- Ingen vakt: egen opplæringsøkt 11–13 i oddetallsukene.
      for k in 0 .. v_n - 1 by 2 loop
        insert into staff_hours (staff_id, weekday, start_time, end_time, week_parity, valid_from, valid_to,
                                 pause_start, pause_end, pause_note)
        values (v_staff, d, '11:00', '13:00', turnus_week_parity(v_start + 7 * k), v_start, v_split - 1,
                '11:00', '13:00', v_note),
               (v_staff, d, '11:00', '13:00', turnus_week_parity(v_split + 7 * k), v_split, null,
                '11:00', '13:00', v_note);
      end loop;
      continue;
    end if;

    if n > 1 then
      raise exception 'Dawit har flere vakter på % – legg inn opplæringen manuelt under Timelister.',
        case d when 1 then 'mandag' else 'onsdag' end;
    end if;

    select * into r from staff_hours
     where staff_id = v_staff and weekday = d and (valid_to is null or valid_to >= v_start);

    if r.week_parity <> 0 or r.pause_start is not null
       or r.start_time > time '11:00' or r.end_time < time '13:00' then
      raise exception 'Dawits vakt på % (%–%, uke %, pause %) passer ikke automatisk – legg inn opplæringen manuelt under Timelister.',
        case d when 1 then 'mandag' else 'onsdag' end, r.start_time, r.end_time, r.week_parity,
        coalesce(r.pause_start::text, 'ingen');
    end if;

    -- Vanlig vakt hver uke som dekker 11–13: avslutt den og legg inn samme
    -- vakt delt på oddetall (med opplæring) / partall (uten).
    update staff_hours set valid_to = v_start - 1 where id = r.id;
    for k in 0 .. v_n - 1 loop
      insert into staff_hours (staff_id, weekday, start_time, end_time, week_parity, valid_from, valid_to,
                               pause_start, pause_end, pause_note)
      values
        (v_staff, d, r.start_time, r.end_time, turnus_week_parity(v_start + 7 * k), v_start, v_split - 1,
         case when k % 2 = 0 then time '11:00' end, case when k % 2 = 0 then time '13:00' end,
         case when k % 2 = 0 then v_note end),
        (v_staff, d, r.start_time, r.end_time, turnus_week_parity(v_split + 7 * k), v_split, null,
         case when k % 2 = 0 then time '11:00' end, case when k % 2 = 0 then time '13:00' end,
         case when k % 2 = 0 then v_note end);
    end loop;
  end loop;

  raise notice 'Dawit: opplæring av Kochari lagt inn mandag og onsdag 11–13 i oddetallsuker fra %.', v_start;
end $$;

notify pgrst, 'reload schema';

-- Sjekk: Dawits mandag/onsdag fra 2. november.
select case h.weekday when 1 then 'Mandag' else 'Onsdag' end as dag,
       to_char(h.start_time, 'HH24:MI') || '–' || to_char(h.end_time, 'HH24:MI') as vakt,
       case when h.week_parity = 0 then 'hver uke' else 'uke-indeks ' || h.week_parity end as uker,
       coalesce(h.pause_note || ' ' || to_char(h.pause_start, 'HH24:MI') || '–' || to_char(h.pause_end, 'HH24:MI'), '') as opplaering,
       h.valid_from as fra, h.valid_to as til
  from staff_hours h join staff s on s.id = h.staff_id
 where s.full_name ilike '%david%' and s.active and h.weekday in (1, 3)
   and (h.valid_to is null or h.valid_to >= date '2026-11-02')
 order by h.valid_from nulls first, h.weekday, h.week_parity;
