-- Kategorien «Klipp» heter nå «Hårklipp» (EN: Haircuts). Idempotent.
update service_categories set name = 'Hårklipp' where name = 'Klipp';
select name, sort_order from service_categories order by sort_order;
