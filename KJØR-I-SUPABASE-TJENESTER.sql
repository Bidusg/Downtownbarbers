-- =====================================================================
-- KJØR-I-SUPABASE-TJENESTER.sql
--   Bygger om hele tjenestekatalogen til Klipp / Kombo / Skjegg / Barbering
--   med beskrivelser, varighet og nivåpriser (Barber / Senior / Master).
--
--   • Idempotent – trygg å kjøre flere ganger (matcher tjenester på navn).
--   • Deaktiverer alle gamle tjenester, aktiverer de nye. Gamle rader slettes
--     ikke (booking-historikk beholder referansene).
--   • Nivåpris settes i service_level_prices for barber/senior/master.
--     Junior har ingen pris satt ennå → faller tilbake til basispris
--     (= barber-pris). Sett Junior fra admin når dere vil.
--   • Basispris (services.price_nok) = laveste nivå (barber) → «fra»-pris.
-- =====================================================================

do $$
declare
  c_klipp uuid; c_kombo uuid; c_skjegg uuid; c_barb uuid;
begin
  ------------------------------------------------------------------ KATEGORIER
  -- Opprett om de mangler, ellers oppdater sorteringen.
  select id into c_klipp  from service_categories where name = 'Klipp'     limit 1;
  if c_klipp is null then insert into service_categories(name,sort_order) values('Klipp',1)     returning id into c_klipp;  else update service_categories set sort_order=1 where id=c_klipp;  end if;
  select id into c_kombo  from service_categories where name = 'Kombo'     limit 1;
  if c_kombo is null then insert into service_categories(name,sort_order) values('Kombo',2)     returning id into c_kombo;  else update service_categories set sort_order=2 where id=c_kombo;  end if;
  select id into c_skjegg from service_categories where name = 'Skjegg'    limit 1;
  if c_skjegg is null then insert into service_categories(name,sort_order) values('Skjegg',3)   returning id into c_skjegg; else update service_categories set sort_order=3 where id=c_skjegg; end if;
  select id into c_barb   from service_categories where name = 'Barbering' limit 1;
  if c_barb is null then insert into service_categories(name,sort_order) values('Barbering',4)  returning id into c_barb;   else update service_categories set sort_order=4 where id=c_barb;   end if;

  ------------------------------------------------------------------ NULLSTILL
  -- Alle eksisterende tjenester av. De nye slås på igjen under.
  update services set active = false;

  ------------------------------------------------------------------ HJELPER
  -- Upsert én tjeneste (match på navn) + nivåpriser barber/senior/master.
  create or replace function pg_temp.svc(
    p_cat uuid, p_name text, p_desc text, p_dur int, p_sort int,
    p_barber numeric, p_senior numeric, p_master numeric
  ) returns void language plpgsql as $f$
  declare sid uuid; lb uuid; ls uuid; lm uuid;
  begin
    select id into lb from staff_levels where slug='barber';
    select id into ls from staff_levels where slug='senior';
    select id into lm from staff_levels where slug='master';
    select id into sid from services where name = p_name limit 1;
    if sid is null then
      insert into services(category_id,name,description,price_nok,duration_min,sort_order,active,online_bookable)
      values (p_cat,p_name,p_desc,p_barber,p_dur,p_sort,true,true)
      returning id into sid;
    else
      update services set category_id=p_cat, description=p_desc, price_nok=p_barber,
        duration_min=p_dur, sort_order=p_sort, active=true, online_bookable=true
      where id=sid;
    end if;
    if lb is not null then insert into service_level_prices(service_id,level_id,price_nok) values (sid,lb,p_barber) on conflict (service_id,level_id) do update set price_nok=excluded.price_nok, updated_at=now(); end if;
    if ls is not null then insert into service_level_prices(service_id,level_id,price_nok) values (sid,ls,p_senior) on conflict (service_id,level_id) do update set price_nok=excluded.price_nok, updated_at=now(); end if;
    if lm is not null then insert into service_level_prices(service_id,level_id,price_nok) values (sid,lm,p_master) on conflict (service_id,level_id) do update set price_nok=excluded.price_nok, updated_at=now(); end if;
  end $f$;

  ------------------------------------------------------------------ KLIPP
  perform pg_temp.svc(c_klipp, 'Maskinklipp/Lineup',
    'Rask maskinklipp eller lineup for deg som bare vil rydde opp rundt ører, nakke og hårlinje. Kort og effektivt – vær presis på oppmøtetid.',
    15, 1, 349, 449, 599);
  perform pg_temp.svc(c_klipp, 'Herreklipp 30''',
    'En klipp for de fleste frisyrer. På 30 minutter rekker vi skinfade, taperfade og de fleste standard-klipp.',
    30, 2, 499, 549, 649);
  perform pg_temp.svc(c_klipp, 'Herreklipp 45''',
    'For deg som vil ha litt ekstra tid – førstegangskunde, skinfade, classic cut, mullet eller mer krevende frisyrer, med tynning, teksturering og detaljer underveis.',
    45, 3, 699, 749, 849);
  perform pg_temp.svc(c_klipp, 'Barneklipp',
    'Klipp for barn under 13 år, hos hvilken som helst barber.',
    30, 4, 449, 449, 449);

  ------------------------------------------------------------------ KOMBO
  perform pg_temp.svc(c_kombo, 'Lett kombo',
    'Klipp og skjegg i samme sesjon. Skjegget formes og trimmes med maskin (uten hot towel) – en effektiv oppgradering fra vanlig klipp.',
    45, 5, 799, 849, 949);
  perform pg_temp.svc(c_kombo, 'Full kombo',
    'Full behandling med god tid: grundig klipp kombinert med komplett skjeggpleie og hot towel-barbering. Den komplette opplevelsen.',
    60, 6, 999, 1099, 1199);

  ------------------------------------------------------------------ SKJEGG
  perform pg_temp.svc(c_skjegg, 'Lineup / skjeggtrim',
    'Rask lineup og trim – skarpe, rene kanter på skjegget. Også fin som en kjapp oppfriskning mellom fulle behandlinger.',
    15, 7, 349, 449, 599);
  perform pg_temp.svc(c_skjegg, 'Skjeggtrim',
    'Forming, trimming og stell av skjegget med maskin og kniv, tilpasset ansiktsform.',
    30, 8, 499, 549, 649);
  perform pg_temp.svc(c_skjegg, 'Skjeggtrim deluxe',
    'Full skjeggbehandling med hot towel, nøyaktig forming, barberkniv på kantene og pleieprodukter.',
    45, 9, 699, 749, 849);

  ------------------------------------------------------------------ BARBERING
  perform pg_temp.svc(c_barb, 'Hodebarbering',
    'Barbering av hodet med barberkniv og blad – ren, glatt finish med hot towel.',
    30, 10, 499, 549, 649);
  perform pg_temp.svc(c_barb, 'Barbering (ansikt)',
    'Klassisk våtbarbering av ansiktet: hot towel, skum og barberblad for en tett, ren barbering.',
    30, 11, 499, 549, 649);
  perform pg_temp.svc(c_barb, 'Barbering deluxe',
    'Den fulle barberopplevelsen med ekstra tid, hot towel, forming og pleie – for en luksuriøs, tett barbering.',
    45, 12, 699, 749, 849);

end $$;

-- Kontroll: se katalogen med nivåpriser etterpå.
select c.sort_order as kat_sort, c.name as kategori, s.sort_order, s.name,
       s.duration_min as min, s.price_nok as basis_fra
from services s
join service_categories c on c.id = s.category_id
where s.active
order by c.sort_order, s.sort_order;
