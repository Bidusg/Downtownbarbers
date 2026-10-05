-- =====================================================================
-- KJØR-I-SUPABASE-BYGG9.sql  (idempotent – trygt å kjøre flere ganger)
--
--  1) Priser: Maskinklipp/Lineup + Lineup/skjeggtrim «fra 299» (299/399/549)
--  2) Kategorirekkefølge: Klipp → Skjegg → Kombo → Barbering
--  3) Tjenester per ansatt: avhuket = leverer, uavhuket = leverer ikke
--  4) Kundenotat på booking (create_booking_line får p_notes)
--  5) Annuller salg (void_sale) med sporbar logg
--  6) Grunnlønn per ansatt (staff.base_salary_nok)
--  7) Bildegalleri: site_media (bibliotek) + plasseringer + innebygde bilder
--  8) Varsling ved ny booking (settings.booking_notify)
--
--  Kjør FØR du pusher bygg 9.
-- =====================================================================

-- ---------------------------------------------------------- 1) PRISER
do $$
declare lb uuid; ls uuid; lm uuid; sid uuid; n text;
begin
  select id into lb from staff_levels where slug='barber';
  select id into ls from staff_levels where slug='senior';
  select id into lm from staff_levels where slug='master';
  foreach n in array array['Maskinklipp/Lineup', 'Lineup / skjeggtrim'] loop
    select id into sid from services where name = n limit 1;
    if sid is null then continue; end if;
    update services set price_nok = 299 where id = sid;
    if lb is not null then
      insert into service_level_prices(service_id, level_id, price_nok) values (sid, lb, 299)
      on conflict (service_id, level_id) do update set price_nok = excluded.price_nok, updated_at = now();
    end if;
    if ls is not null then
      insert into service_level_prices(service_id, level_id, price_nok) values (sid, ls, 399)
      on conflict (service_id, level_id) do update set price_nok = excluded.price_nok, updated_at = now();
    end if;
    if lm is not null then
      insert into service_level_prices(service_id, level_id, price_nok) values (sid, lm, 549)
      on conflict (service_id, level_id) do update set price_nok = excluded.price_nok, updated_at = now();
    end if;
  end loop;
end $$;

-- ------------------------------------------------ 2) KATEGORIREKKEFØLGE
update service_categories set sort_order = 1 where name = 'Klipp';
update service_categories set sort_order = 2 where name = 'Skjegg';
update service_categories set sort_order = 3 where name = 'Kombo';
update service_categories set sort_order = 4 where name = 'Barbering';
update service_categories set sort_order = 9 where name = 'Tillegg';

-- --------------------------------- 3) TJENESTER PER ANSATT (strengt sett)
-- Før: «ingen rader = leverer alt». Nå: bare avhukede tjenester leveres.
-- Ansatte som i dag ikke har rader (= leverer alt) får eksplisitte rader for
-- alle aktive tjenester, så ingenting endrer seg for kundene.
insert into staff_services (staff_id, service_id)
select st.id, s.id
from staff st
cross join services s
where st.active and s.active
  and not exists (select 1 from staff_services ss where ss.staff_id = st.id)
on conflict do nothing;

create or replace function service_non_providers_public()
returns table (service_name text, barber_name text)
language sql stable security definer set search_path = public as $$
  select s.name, st.full_name
  from services s
  join staff st on st.active
  where s.active
    and not exists (
      select 1 from staff_services ss2
      where ss2.staff_id = st.id and ss2.service_id = s.id
    );
$$;
grant execute on function service_non_providers_public() to anon, authenticated;

-- ------------------------------------------- 4) KUNDENOTAT PÅ BOOKING
-- Ny signatur med p_notes (valgfri). Den gamle 11-parameter-versjonen droppes
-- så kallet ikke blir tvetydig.
drop function if exists create_booking_line(text, text, timestamptz, text, text, text, text, uuid, text, uuid[], int);

create or replace function create_booking_line(
  p_service text, p_barber text, p_start timestamptz,
  p_name text, p_email text, p_phone text, p_source text,
  p_group uuid, p_person text, p_addons uuid[], p_extra_min int,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_booking uuid; a uuid; v_name text; v_price numeric; v_sum numeric := 0;
begin
  v_booking := create_booking(p_service, p_barber, p_start, p_name, p_email, p_phone, p_source);
  if v_booking is null then return null; end if;

  update bookings
     set group_id = p_group,
         person_label = nullif(trim(coalesce(p_person, '')), ''),
         notes = nullif(left(trim(coalesce(p_notes, '')), 500), '')
   where id = v_booking;

  if p_addons is not null then
    foreach a in array p_addons loop
      select name, price_nok into v_name, v_price from services where id = a;
      if v_name is not null then
        insert into booking_addons(booking_id, service_id, name, price_nok)
          values (v_booking, a, v_name, coalesce(v_price, 0));
        v_sum := v_sum + coalesce(v_price, 0);
      end if;
    end loop;
  end if;

  if coalesce(p_extra_min, 0) > 0 then
    update bookings set end_at = end_at + make_interval(mins => p_extra_min)
     where id = v_booking;
  end if;
  if v_sum > 0 then
    update bookings set price_nok = coalesce(price_nok, 0) + v_sum
     where id = v_booking;
  end if;

  return v_booking;
end $$;
grant execute on function create_booking_line(text, text, timestamptz, text, text, text, text, uuid, text, uuid[], int, text) to anon, authenticated;

-- ------------------------------------------------- 5) ANNULLER SALG
-- Sletter salget (linjer/betalinger følger med) men legger en kopi i
-- sale_voids, så det er sporbart hvem som annullerte hva og hvorfor.
-- Tilbakefører lagerbeholdning og gavekort-saldo, og setter booking tilbake
-- til «bekreftet». Nektes hvis dagen allerede er sendt til Tripletex.
create table if not exists sale_voids (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null,
  sold_at      timestamptz not null,
  staff_id     uuid,
  customer_id  uuid,
  total_nok    numeric(10,2) not null default 0,
  payment      jsonb,              -- betalingslinjer
  items        jsonb,              -- salgslinjer
  reason       text,
  voided_by    uuid references profiles(id) on delete set null,
  voided_at    timestamptz not null default now()
);
alter table sale_voids enable row level security;
drop policy if exists sale_voids_admin_read on sale_voids;
create policy sale_voids_admin_read on sale_voids for select using (is_admin());

create or replace function void_sale(p_sale uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sale sales%rowtype;
  v_day date;
  r record;
begin
  if not is_admin() then
    raise exception 'Kun admin kan annullere salg';
  end if;
  select * into v_sale from sales where id = p_sale;
  if v_sale.id is null then
    raise exception 'Fant ikke salget';
  end if;

  v_day := (v_sale.sold_at at time zone 'Europe/Oslo')::date;
  if exists (select 1 from tripletex_voucher_log where voucher_date = v_day) then
    raise exception 'Dagen (%) er allerede sendt til Tripletex – korriger bilaget der i stedet', v_day;
  end if;

  -- Logg kopi før sletting.
  insert into sale_voids (sale_id, sold_at, staff_id, customer_id, total_nok, payment, items, reason, voided_by)
  select v_sale.id, v_sale.sold_at, v_sale.staff_id, v_sale.customer_id, v_sale.total_nok,
         (select coalesce(jsonb_agg(jsonb_build_object('method', sp.method, 'amount', sp.amount)), '[]'::jsonb)
            from sale_payments sp where sp.sale_id = v_sale.id),
         (select coalesce(jsonb_agg(jsonb_build_object('kind', si.kind, 'ref_id', si.ref_id,
                   'description', si.description, 'quantity', si.quantity, 'price_nok', si.price_nok)), '[]'::jsonb)
            from sale_items si where si.sale_id = v_sale.id),
         nullif(trim(coalesce(p_reason, '')), ''),
         auth.uid();

  -- Lager tilbake for produktlinjer.
  for r in select ref_id, quantity from sale_items where sale_id = v_sale.id and kind = 'product' and ref_id is not null loop
    update products set stock = stock + coalesce(r.quantity, 1) where id = r.ref_id;
    insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
    select r.ref_id, coalesce(r.quantity, 1), 'annullert salg', 'Salg ' || v_sale.id, stock, auth.uid()
      from products where id = r.ref_id;
  end loop;

  -- Gavekort-saldo tilbake.
  for r in select gift_card_id, amount_nok from gift_card_redemptions where sale_id = v_sale.id loop
    update gift_cards set balance_nok = balance_nok + r.amount_nok where id = r.gift_card_id;
  end loop;
  delete from gift_card_redemptions where sale_id = v_sale.id;

  -- Booking tilbake til bekreftet (var satt til fullført av salget).
  if v_sale.booking_id is not null then
    update bookings set status = 'confirmed' where id = v_sale.booking_id and status = 'completed';
  end if;

  delete from sale_payments where sale_id = v_sale.id;
  delete from sale_items where sale_id = v_sale.id;
  delete from sales where id = v_sale.id;
end $$;
grant execute on function void_sale(uuid, text) to authenticated;

-- ------------------------------------------- 6) GRUNNLØNN PER ANSATT
alter table staff add column if not exists base_salary_nok numeric(10,2);
comment on column staff.base_salary_nok is 'Fast grunnlønn per måned. NULL = standard (27 000).';

-- ---------------------------------------------------- 7) BILDEGALLERI
create table if not exists site_media (
  id         uuid primary key default gen_random_uuid(),
  path       text not null unique,                     -- storage-sti ELLER «/img/...» (innebygd)
  kind       text not null default 'image' check (kind in ('image','video')),
  alt        text,
  label      text,                                     -- visningsnavn i galleriet
  created_at timestamptz not null default now()
);
alter table site_media enable row level security;
drop policy if exists site_media_read on site_media;
create policy site_media_read on site_media for select using (true);
drop policy if exists site_media_admin_all on site_media;
create policy site_media_admin_all on site_media for all using (is_admin()) with check (is_admin());

alter table site_images add column if not exists media_id uuid references site_media(id) on delete cascade;
alter table site_craft  add column if not exists media_id uuid references site_media(id) on delete set null;

-- Eksisterende opplastede bilder inn i biblioteket + koble plasseringer.
insert into site_media (path, kind, alt)
select distinct on (path) path, kind, alt from site_images
on conflict (path) do nothing;
update site_images si set media_id = m.id
  from site_media m where m.path = si.path and si.media_id is null;

insert into site_media (path, kind, alt)
select distinct on (image_path) image_path, 'image', title from site_craft
on conflict (path) do nothing;
update site_craft sc set media_id = m.id
  from site_media m where m.path = sc.image_path and sc.media_id is null;

-- Innebygde bilder (ligger i repoet under /public) – så de kan styres i admin.
insert into site_media (path, kind, alt, label) values
  ('/img/hero/h1.jpg','image','Downtown Barbers – hero 1','Hero 1'),
  ('/img/hero/h2.jpg','image','Downtown Barbers – hero 2','Hero 2'),
  ('/img/hero/h3.jpg','image','Downtown Barbers – hero 3','Hero 3'),
  ('/img/hero/h4.jpg','image','Downtown Barbers – hero 4','Hero 4'),
  ('/img/hero/h5.jpg','image','Downtown Barbers – hero 5','Hero 5'),
  ('/img/hero/h6.jpg','image','Downtown Barbers – hero 6','Hero 6'),
  ('/img/hero/h7.jpg','image','Downtown Barbers – hero 7','Hero 7'),
  ('/img/hero/h8.jpg','image','Downtown Barbers – hero 8','Hero 8'),
  ('/img/hero/h9.jpg','image','Downtown Barbers – hero 9','Hero 9'),
  ('/img/hero/h10.jpg','image','Downtown Barbers – hero 10','Hero 10'),
  ('/img/hero/h11.jpg','image','Downtown Barbers – hero 11','Hero 11'),
  ('/img/hero/h12.jpg','image','Downtown Barbers – hero 12','Hero 12'),
  ('/img/hero/h13.jpg','image','Downtown Barbers – hero 13','Hero 13'),
  ('/img/hero/h14.jpg','image','Downtown Barbers – hero 14','Hero 14'),
  ('/img/curly-fade.jpg','image','Curly top med skarp drop fade','Curly fade'),
  ('/img/razor-detail.jpg','image','Barbering med barberkniv og pensel','Barberkniv'),
  ('/img/clipper-neck.jpg','image','Ren nakkelinje med trimmer','Nakkelinje'),
  ('/img/shelf-detail.jpg','image','Detaljer og produkter i shopen','Hylle'),
  ('/img/neckline.jpg','image','Barber som renser nakkelinjen','Om oss'),
  ('/img/neon-sign.jpg','image','Downtown Barbers neonskilt','Neonskilt'),
  ('/img/portrait-fade.jpg','image','Faden','Faden'),
  ('/img/hot-towel.jpg','image','Det varme håndkleet','Hot towel'),
  ('/img/powder.jpg','image','Finishen','Finishen')
on conflict (path) do nothing;

-- Plasseringer for seksjoner som ennå ikke har egne bilder (= det som vises i dag).
insert into site_images (section, kind, path, alt, sort_order, active, media_id)
select 'hero', 'image', m.path, m.alt, n, true, m.id
from generate_series(1, 14) as n
join site_media m on m.path = '/img/hero/h' || n || '.jpg'
where not exists (select 1 from site_images where section = 'hero');

insert into site_images (section, kind, path, alt, sort_order, active, media_id)
select 'gallery', 'image', m.path, m.alt, x.n, true, m.id
from (values ('/img/curly-fade.jpg',1),('/img/razor-detail.jpg',2),('/img/clipper-neck.jpg',3),('/img/shelf-detail.jpg',4)) as x(p, n)
join site_media m on m.path = x.p
where not exists (select 1 from site_images where section = 'gallery');

insert into site_images (section, kind, path, alt, sort_order, active, media_id)
select 'about', 'image', m.path, m.alt, 1, true, m.id from site_media m
where m.path = '/img/neckline.jpg' and not exists (select 1 from site_images where section = 'about');

insert into site_images (section, kind, path, alt, sort_order, active, media_id)
select 'banner', 'image', m.path, m.alt, 1, true, m.id from site_media m
where m.path = '/img/neon-sign.jpg' and not exists (select 1 from site_images where section = 'banner');

insert into site_craft (image_path, title, body, sort_order, active, media_id)
select x.p, x.t, x.b, x.n, true, m.id
from (values
  ('/img/portrait-fade.jpg','Faden','Hud til topp i én ren overgang. Ingen kanter som skurrer.',1),
  ('/img/hot-towel.jpg','Det varme håndkleet','Fem minutter der ingenting haster. Så barberkniven.',2),
  ('/img/powder.jpg','Finishen','Tekstur og hold som sitter – fra stolen til siste øl.',3)
) as x(p, t, b, n)
join site_media m on m.path = x.p
where not exists (select 1 from site_craft);

-- ------------------------------------------ 8) VARSLING VED NY BOOKING
insert into settings (key, value)
values ('booking_notify', jsonb_build_object('enabled', true, 'email', 'post@downtownbarbers.no'))
on conflict (key) do nothing;

-- ---------------------------------------------------------- KONTROLL
select name, price_nok from services where name in ('Maskinklipp/Lineup','Lineup / skjeggtrim');
select name, sort_order from service_categories order by sort_order;
select section, count(*) from site_images group by section order by section;
select count(*) as media from site_media;
