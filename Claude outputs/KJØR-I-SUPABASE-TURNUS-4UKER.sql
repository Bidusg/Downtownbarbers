-- =====================================================================
-- TURNUS: Riccardo, Kochari, Soren og Toni – 4-ukers rotasjon
-- Gjelder fra 2026-11-01 (søndag 1. nov). Mandag 2026-11-02 = turnusuke 1.
--
--  Man–tor (7 t): 3 på jobb, én har fri (roterer hver uke)
--     Tidlig 10:00–17:00 · Mellom 11:30–18:30 · Sen 13:00–20:00
--  Lørdag (8 t): alle fire
--     Tidlig 10:00–18:00 · Mellom 1 10:30–18:30 · Mellom 2 11:30–19:30 · Sen 12:00–20:00
--  Fredag (8 t): Riccardo, Soren og Toni roterer
--     Tidlig 10:00–18:00 · Mellom 11:00–19:00 · Sen 12:00–20:00
--     + Kochari 17:00–20:00 (jobber ikke før 17 på fredager)
--  Søndag: alle fri.
--
-- Hva skriptet gjør:
--  1) Sjekker at de fire navnene finnes (avbryter ellers).
--  2) Sjekker at ingen turnus som gjelder FØR 1. nov (eller andre ansattes
--     turnus) bruker uke A/B – den ville blitt forskjøvet av 4-ukers
--     rotasjon (avbryter ellers).
--  3) Setter rotasjonen til 4 uker med start 2026-11-02.
--  4) Lar de fires nåværende turnus gå ut lørdag 31. oktober, og legger inn ny.
-- Alt skjer i én transaksjon – feiler noe, endres ingenting.
-- =====================================================================

begin;

create temp table _who (short text primary key, staff_id uuid) on commit drop;

do $$
declare
  r record;
  v_id uuid;
  v_n int;
  pats record;
begin
  for pats in
    select * from (values
      ('Riccardo', array['Riccardo%']),
      ('Kochari',  array['Kochari%']),
      ('Soren',    array['Soren%','Søren%']),
      ('Toni',     array['Toni%','Tony%','%Antonio%','%Moysa%'])
    ) as t(short, pats)
  loop
    select count(*), min(s.id::text)::uuid into v_n, v_id
      from staff s
     where s.active and trim(s.full_name) ilike any (pats.pats);
    if v_n <> 1 then
      raise exception 'Fant % aktive ansatte som matcher «%». Finnes: % (inaktive: %)', v_n, pats.short,
        (select coalesce(string_agg(full_name, ', '), 'ingen') from staff where active),
        (select coalesce(string_agg(full_name, ', '), 'ingen') from staff where not active);
    end if;
    insert into _who values (pats.short, v_id);
  end loop;

  -- Uke A/B-vakter som fortsatt gjelder ville fått feil uke med 4-ukers
  -- rotasjon: andre ansattes (alltid), og de fires gamle turnus frem til 1. nov.
  for r in
    select distinct s.full_name,
           (h.staff_id in (select staff_id from _who)) as is_new
      from staff_hours h join staff s on s.id = h.staff_id
     where h.week_parity <> 0
       and s.active
       and (h.valid_to is null or h.valid_to >= current_date)
       and (
         h.staff_id not in (select staff_id from _who)
         or ((h.valid_from is null or h.valid_from < date '2026-11-01')
             and current_date < date '2026-11-01')
       )
  loop
    if r.is_new then
      raise exception '«%» har uke A/B-turnus som gjelder frem til 1. november. Kjør skriptet søndag 1. november i stedet (da er den gamle turnusen ferdig).', r.full_name;
    else
      raise exception 'Ansatt «%» har uke A/B-turnus. Sett den til «hver uke» først (eller si fra, så lager vi 4-ukers turnus for vedkommende også).', r.full_name;
    end if;
  end loop;
end $$;

-- 3a) Tillat turnusuke 1–6 (databasen var låst til uke A/B = 1–2).
--     Samme grense som appen bruker (0 = hver uke, 1–6 = turnusuke).
alter table staff_hours drop constraint if exists staff_hours_week_parity_chk;
alter table staff_hours add constraint staff_hours_week_parity_chk
  check (week_parity between 0 and 6);

-- 3b) 4-ukers rotasjon med uke 1 = 2026-11-02
insert into settings (key, value)
values ('turnus_rotation', jsonb_build_object('weeks', 4, 'anchor', '2026-11-02'))
on conflict (key) do update set value = excluded.value;

-- 4) Rydd og avslutt nåværende turnus for de fire
delete from staff_hours
 where staff_id in (select staff_id from _who)
   and valid_from >= date '2026-11-01';

update staff_hours
   set valid_to = date '2026-11-01' - 1
 where staff_id in (select staff_id from _who)
   and (valid_to is null or valid_to >= date '2026-11-01');

insert into staff_hours (staff_id, weekday, start_time, end_time, week_parity, valid_from)
select w.staff_id, v.weekday, v.start_t::time, v.end_t::time, v.week, date '2026-11-01'
  from (values
    ('Kochari', 1, '10:00', '17:00', 1),  -- uke 1 man: Tidlig
    ('Kochari', 3, '13:00', '20:00', 1),  -- uke 1 ons: Sen
    ('Kochari', 4, '11:30', '18:30', 1),  -- uke 1 tor: Mellom
    ('Kochari', 5, '17:00', '20:00', 1),  -- uke 1 fre: Kveld
    ('Kochari', 6, '10:30', '18:30', 1),  -- uke 1 lør: Mellom 1
    ('Kochari', 1, '11:30', '18:30', 2),  -- uke 2 man: Mellom
    ('Kochari', 2, '10:00', '17:00', 2),  -- uke 2 tir: Tidlig
    ('Kochari', 4, '13:00', '20:00', 2),  -- uke 2 tor: Sen
    ('Kochari', 5, '17:00', '20:00', 2),  -- uke 2 fre: Kveld
    ('Kochari', 6, '11:30', '19:30', 2),  -- uke 2 lør: Mellom 2
    ('Kochari', 1, '13:00', '20:00', 3),  -- uke 3 man: Sen
    ('Kochari', 2, '11:30', '18:30', 3),  -- uke 3 tir: Mellom
    ('Kochari', 3, '10:00', '17:00', 3),  -- uke 3 ons: Tidlig
    ('Kochari', 5, '17:00', '20:00', 3),  -- uke 3 fre: Kveld
    ('Kochari', 6, '12:00', '20:00', 3),  -- uke 3 lør: Sen
    ('Kochari', 2, '13:00', '20:00', 4),  -- uke 4 tir: Sen
    ('Kochari', 3, '11:30', '18:30', 4),  -- uke 4 ons: Mellom
    ('Kochari', 4, '10:00', '17:00', 4),  -- uke 4 tor: Tidlig
    ('Kochari', 5, '17:00', '20:00', 4),  -- uke 4 fre: Kveld
    ('Kochari', 6, '10:00', '18:00', 4),  -- uke 4 lør: Tidlig
    ('Riccardo', 2, '13:00', '20:00', 1),  -- uke 1 tir: Sen
    ('Riccardo', 3, '11:30', '18:30', 1),  -- uke 1 ons: Mellom
    ('Riccardo', 4, '10:00', '17:00', 1),  -- uke 1 tor: Tidlig
    ('Riccardo', 5, '10:00', '18:00', 1),  -- uke 1 fre: Tidlig
    ('Riccardo', 6, '10:00', '18:00', 1),  -- uke 1 lør: Tidlig
    ('Riccardo', 1, '10:00', '17:00', 2),  -- uke 2 man: Tidlig
    ('Riccardo', 3, '13:00', '20:00', 2),  -- uke 2 ons: Sen
    ('Riccardo', 4, '11:30', '18:30', 2),  -- uke 2 tor: Mellom
    ('Riccardo', 5, '11:00', '19:00', 2),  -- uke 2 fre: Mellom
    ('Riccardo', 6, '10:30', '18:30', 2),  -- uke 2 lør: Mellom 1
    ('Riccardo', 1, '11:30', '18:30', 3),  -- uke 3 man: Mellom
    ('Riccardo', 2, '10:00', '17:00', 3),  -- uke 3 tir: Tidlig
    ('Riccardo', 4, '13:00', '20:00', 3),  -- uke 3 tor: Sen
    ('Riccardo', 5, '12:00', '20:00', 3),  -- uke 3 fre: Sen
    ('Riccardo', 6, '11:30', '19:30', 3),  -- uke 3 lør: Mellom 2
    ('Riccardo', 1, '13:00', '20:00', 4),  -- uke 4 man: Sen
    ('Riccardo', 2, '11:30', '18:30', 4),  -- uke 4 tir: Mellom
    ('Riccardo', 3, '10:00', '17:00', 4),  -- uke 4 ons: Tidlig
    ('Riccardo', 5, '10:00', '18:00', 4),  -- uke 4 fre: Tidlig
    ('Riccardo', 6, '12:00', '20:00', 4),  -- uke 4 lør: Sen
    ('Soren', 1, '11:30', '18:30', 1),  -- uke 1 man: Mellom
    ('Soren', 2, '10:00', '17:00', 1),  -- uke 1 tir: Tidlig
    ('Soren', 4, '13:00', '20:00', 1),  -- uke 1 tor: Sen
    ('Soren', 5, '11:00', '19:00', 1),  -- uke 1 fre: Mellom
    ('Soren', 6, '11:30', '19:30', 1),  -- uke 1 lør: Mellom 2
    ('Soren', 1, '13:00', '20:00', 2),  -- uke 2 man: Sen
    ('Soren', 2, '11:30', '18:30', 2),  -- uke 2 tir: Mellom
    ('Soren', 3, '10:00', '17:00', 2),  -- uke 2 ons: Tidlig
    ('Soren', 5, '12:00', '20:00', 2),  -- uke 2 fre: Sen
    ('Soren', 6, '12:00', '20:00', 2),  -- uke 2 lør: Sen
    ('Soren', 2, '13:00', '20:00', 3),  -- uke 3 tir: Sen
    ('Soren', 3, '11:30', '18:30', 3),  -- uke 3 ons: Mellom
    ('Soren', 4, '10:00', '17:00', 3),  -- uke 3 tor: Tidlig
    ('Soren', 5, '10:00', '18:00', 3),  -- uke 3 fre: Tidlig
    ('Soren', 6, '10:00', '18:00', 3),  -- uke 3 lør: Tidlig
    ('Soren', 1, '10:00', '17:00', 4),  -- uke 4 man: Tidlig
    ('Soren', 3, '13:00', '20:00', 4),  -- uke 4 ons: Sen
    ('Soren', 4, '11:30', '18:30', 4),  -- uke 4 tor: Mellom
    ('Soren', 5, '11:00', '19:00', 4),  -- uke 4 fre: Mellom
    ('Soren', 6, '10:30', '18:30', 4),  -- uke 4 lør: Mellom 1
    ('Toni', 1, '13:00', '20:00', 1),  -- uke 1 man: Sen
    ('Toni', 2, '11:30', '18:30', 1),  -- uke 1 tir: Mellom
    ('Toni', 3, '10:00', '17:00', 1),  -- uke 1 ons: Tidlig
    ('Toni', 5, '12:00', '20:00', 1),  -- uke 1 fre: Sen
    ('Toni', 6, '12:00', '20:00', 1),  -- uke 1 lør: Sen
    ('Toni', 2, '13:00', '20:00', 2),  -- uke 2 tir: Sen
    ('Toni', 3, '11:30', '18:30', 2),  -- uke 2 ons: Mellom
    ('Toni', 4, '10:00', '17:00', 2),  -- uke 2 tor: Tidlig
    ('Toni', 5, '10:00', '18:00', 2),  -- uke 2 fre: Tidlig
    ('Toni', 6, '10:00', '18:00', 2),  -- uke 2 lør: Tidlig
    ('Toni', 1, '10:00', '17:00', 3),  -- uke 3 man: Tidlig
    ('Toni', 3, '13:00', '20:00', 3),  -- uke 3 ons: Sen
    ('Toni', 4, '11:30', '18:30', 3),  -- uke 3 tor: Mellom
    ('Toni', 5, '11:00', '19:00', 3),  -- uke 3 fre: Mellom
    ('Toni', 6, '10:30', '18:30', 3),  -- uke 3 lør: Mellom 1
    ('Toni', 1, '11:30', '18:30', 4),  -- uke 4 man: Mellom
    ('Toni', 2, '10:00', '17:00', 4),  -- uke 4 tir: Tidlig
    ('Toni', 4, '13:00', '20:00', 4),  -- uke 4 tor: Sen
    ('Toni', 5, '12:00', '20:00', 4),  -- uke 4 fre: Sen
    ('Toni', 6, '11:30', '19:30', 4)  -- uke 4 lør: Mellom 2
  ) as v(short, weekday, start_t, end_t, week)
  join _who w on w.short = v.short;

commit;

-- Kontroll: antall vakter og timer per ansatt per turnusuke
select s.full_name, h.week_parity as turnusuke,
       count(*) as vakter,
       round(sum(extract(epoch from (h.end_time - h.start_time)) / 3600)::numeric, 1) as timer
  from staff_hours h join staff s on s.id = h.staff_id
 where h.valid_from = date '2026-11-01'
 group by 1, 2 order by 1, 2;
