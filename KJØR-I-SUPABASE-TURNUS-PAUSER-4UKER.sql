-- =====================================================================
-- Pauser i 4-ukers turnusen (Riccardo, Kochari, Søren, Toni)
--
-- For deg som ALLEREDE har kjørt KJØR-I-SUPABASE-TURNUS-4UKER.sql:
-- legger 30 min pause midt i hver vakt i turnusen som starter 1. november.
-- (Kjører du TURNUS-4UKER på nytt, legger den inn pausene selv.)
-- Pausen kan ikke bookes på nett eller i kassa, og vises som «Pause».
-- Krever KJØR-I-SUPABASE-TURNUS-PAUSE.sql. Trygt å kjøre flere ganger.
-- =====================================================================

begin;

create temp table _who (staff_id uuid primary key) on commit drop;
insert into _who
select s.id from staff s
 where s.active
   and (trim(s.full_name) ilike any (array['Riccardo%','Kochari%','Soren%','Søren%','Toni%','Tony%','%Antonio%','%Moysa%']));

-- Fast pause på 30 min midt i hver vakt (rundet ned til hel/halv time, så
-- pausene blir forskjøvet og ikke alle har pause samtidig).
-- Eks.: 10–17 → 13:30–14:00 · 11:30–18:30 → 15:00–15:30 · 13–20 → 16:30–17:00
--       Lør 10–18 → 14:00 · 10:30–18:30 → 14:30 · 11:30–19:30 → 15:30 · 12–20 → 16:00
--       Fre 17–20 (Kochari) → 18:30–19:00
alter table staff_hours add column if not exists pause_start time;
alter table staff_hours add column if not exists pause_end time;

update staff_hours h
   set pause_start = h.start_time
         + make_interval(mins => (floor(extract(epoch from (h.end_time - h.start_time)) / 60 / 2 / 30) * 30)::int),
       pause_end   = h.start_time
         + make_interval(mins => (floor(extract(epoch from (h.end_time - h.start_time)) / 60 / 2 / 30) * 30)::int + 30)
 where h.valid_from = date '2026-11-01'
   and h.staff_id in (select staff_id from _who);

commit;

-- Kontroll: vakter og pauser per ansatt per turnusuke
select s.full_name, h.week_parity as turnusuke,
       string_agg(to_char(h.start_time, 'HH24:MI') || '–' || to_char(h.end_time, 'HH24:MI')
                  || ' (pause ' || to_char(h.pause_start, 'HH24:MI') || ')', ', ' order by h.weekday) as vakter
  from staff_hours h join staff s on s.id = h.staff_id
 where h.valid_from = date '2026-11-01'
 group by 1, 2 order by 1, 2;
