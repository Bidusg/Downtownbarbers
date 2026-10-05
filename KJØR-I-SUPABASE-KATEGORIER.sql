-- =====================================================================
-- KATEGORI-OPPRYDDING (idempotent)
--   Tabellen service_categories har mange dubletter («Hår & klipp» ×8 osv.)
--   fra gamle seed-kjøringer. Dette rydder til nøyaktig fem kategorier:
--     1 Hårklipp · 2 Skjegg · 3 Kombo · 4 Barbering · 5 Tillegg
--   Tjenester i dublettene flyttes over til riktig kategori, deretter
--   slettes dublettene. (EN: Haircuts · Beard · Combo · Shaving · Add-ons)
--   «Tillegg» MÅ hete akkurat det – koden kjenner igjen tilleggstjenester
--   på navnet.
-- =====================================================================

do $$
declare
  canon text[] := array['Hårklipp','Skjegg','Kombo','Barbering','Tillegg'];
  cname text; cid uuid; i int := 0;
  keep uuid[] := '{}';
  r record;
begin
  -- 1) Én kanonisk rad per navn (behold den med flest tjenester, ellers eldste).
  foreach cname in array canon loop
    i := i + 1;
    select c.id into cid
      from service_categories c
      left join services s on s.category_id = c.id
     where c.name = cname
     group by c.id
     order by count(s.id) desc, c.id
     limit 1;
    if cid is null and cname = 'Hårklipp' then
      select c.id into cid from service_categories c where c.name = 'Klipp' limit 1;
      if cid is not null then update service_categories set name = 'Hårklipp' where id = cid; end if;
    end if;
    if cid is null then
      insert into service_categories (name, sort_order) values (cname, i) returning id into cid;
    end if;
    update service_categories set sort_order = i where id = cid;
    keep := keep || cid;
  end loop;

  -- 2) Alle andre rader: flytt tjenestene til riktig kanonisk, slett raden.
  for r in select id, name from service_categories where not (id = any(keep)) loop
    select id into cid from service_categories
     where id = any(keep) and name = case
       when r.name ilike 'hår%' or r.name ilike 'klipp%' then 'Hårklipp'
       when r.name ilike 'skjegg%' then 'Skjegg'
       when r.name ilike 'kombo%' then 'Kombo'
       when r.name ilike 'ansikt%' or r.name ilike 'barbering%' or r.name ilike 'shav%' then 'Barbering'
       when r.name ilike 'tillegg%' or r.name ilike 'add%' then 'Tillegg'
       else 'Hårklipp' end
     limit 1;
    update services set category_id = cid where category_id = r.id;
    delete from service_categories where id = r.id;
  end loop;
end $$;

-- Kontroll: skal være nøyaktig fem rader, i denne rekkefølgen.
select c.name, c.sort_order, count(s.id) as tjenester
  from service_categories c
  left join services s on s.category_id = c.id
 group by c.id, c.name, c.sort_order
 order by c.sort_order;
