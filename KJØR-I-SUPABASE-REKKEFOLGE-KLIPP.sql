-- Rekkefølge i Hårklipp: Herreklipp 30' → Herreklipp 45' → Maskinklipp/Lineup → Barneklipp.
update services set sort_order = 1 where name = 'Herreklipp 30''';
update services set sort_order = 2 where name = 'Herreklipp 45''';
update services set sort_order = 3 where name = 'Maskinklipp/Lineup';
update services set sort_order = 4 where name = 'Barneklipp';
select s.name, s.sort_order from services s join service_categories c on c.id = s.category_id
 where c.name in ('Hårklipp','Klipp') order by s.sort_order;
