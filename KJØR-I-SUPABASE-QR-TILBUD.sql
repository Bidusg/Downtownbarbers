-- =====================================================================
-- QR-TILBUD (partnerkampanjer, f.eks. «KPMG × Movember»)
--   • Et skjult tilbud som bare gjelder for dem som har skannet QR-koden
--     (downtownbarbers.no/q/<kode>). Tilbudet ligger ikke åpent på nettsiden.
--   • Skanning → informasjonskapsel i nettleseren → bookingen og nettbutikken
--     legger på rabatten automatisk. Kassa trekker den ved betaling
--     (samme felt som kundeklubb-rabatten: bookings.member_*).
--   • Tilbudet:
--       service_pct  – rabatt på timen til den som booker
--       friend_pct   – rabatt til venner booket i SAMME bestilling
--                      («Vi er flere personer»)
--       product_pct  – rabatt på produkter (i salongen ved timen + nettbutikken)
--   • Kan kjøres flere ganger.
-- =====================================================================

create table if not exists promo_campaigns (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,           -- koden i QR-lenken
  name              text not null,                  -- internt navn
  label             text not null,                  -- vises til kunden / i kassa
  headline          text,
  body              text,
  service_pct       numeric not null default 0 check (service_pct between 0 and 100),
  friend_pct        numeric not null default 0 check (friend_pct between 0 and 100),
  product_pct       numeric not null default 0 check (product_pct between 0 and 100),
  book_by           date,     -- siste dag man kan booke med tilbudet
  visit_by          date,     -- timen må være senest denne dagen
  products_until    date,     -- produktrabatt i nettbutikken til og med
  once_per_customer boolean not null default true,
  active            boolean not null default true,
  scans             int not null default 0,
  created_at        timestamptz not null default now()
);

alter table promo_campaigns enable row level security;
drop policy if exists promo_admin_all on promo_campaigns;
create policy promo_admin_all on promo_campaigns
  for all using (is_admin()) with check (is_admin());

alter table bookings      add column if not exists promo_id uuid references promo_campaigns(id) on delete set null;
alter table online_orders add column if not exists promo_id uuid references promo_campaigns(id) on delete set null;
create index if not exists bookings_promo_idx on bookings(promo_id) where promo_id is not null;
create index if not exists online_orders_promo_idx on online_orders(promo_id) where promo_id is not null;

-- Dagens dato i Oslo.
create or replace function promo_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Oslo')::date $$;

-- Offentlig: tilbudet bak en kode (null når det er av / utløpt).
create or replace function promo_public(p_slug text)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'slug', p.slug, 'label', p.label, 'headline', p.headline, 'body', p.body,
    'service_pct', p.service_pct, 'friend_pct', p.friend_pct, 'product_pct', p.product_pct,
    'book_by', p.book_by, 'visit_by', p.visit_by, 'products_until', p.products_until,
    'booking_open', (p.book_by is null or promo_today() <= p.book_by),
    'products_open', (p.product_pct > 0 and (p.products_until is null or promo_today() <= p.products_until)))
  from promo_campaigns p
  where lower(p.slug) = lower(trim(coalesce(p_slug, '')))
    and p.active
    and ((p.book_by is null or promo_today() <= p.book_by)
         or (p.product_pct > 0 and (p.products_until is null or promo_today() <= p.products_until)))
  limit 1;
$$;
revoke execute on function promo_public(text) from public;
grant  execute on function promo_public(text) to anon, authenticated;

-- Skanning: teller + returnerer tilbudet.
create or replace function promo_scan(p_slug text)
returns json
language plpgsql security definer set search_path = public as $$
declare v json := promo_public(p_slug);
begin
  if v is not null then
    update promo_campaigns set scans = scans + 1 where lower(slug) = lower(trim(p_slug));
  end if;
  return v;
end $$;
revoke execute on function promo_scan(text) from public;
grant  execute on function promo_scan(text) to anon, authenticated;

-- Booking: legg tilbudet på timene som nettopp ble laget.
--   p_group = true: første linje er den som booker, resten er venner.
--   Gir alltid kunden den beste satsen (kundeklubb eller tilbud).
create or replace function mark_promo_booking(p_slug text, p_bookings uuid[], p_group boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_p    promo_campaigns;
  v_cust uuid;
  v_n    int := 0;
  v_one  int;
  v_pct  numeric;
  i      int;
begin
  select * into v_p from promo_campaigns
   where lower(slug) = lower(trim(coalesce(p_slug, ''))) and active limit 1;
  if v_p.id is null then return 0; end if;
  if v_p.book_by is not null and promo_today() > v_p.book_by then return 0; end if;
  if coalesce(array_length(p_bookings, 1), 0) = 0 then return 0; end if;

  select customer_id into v_cust from bookings where id = p_bookings[1];
  if v_p.once_per_customer and v_cust is not null and exists (
       select 1 from bookings b
        where b.promo_id = v_p.id and b.customer_id = v_cust
          and b.id <> all(p_bookings) and coalesce(b.status::text, '') <> 'cancelled') then
    return 0;
  end if;

  for i in 1 .. array_length(p_bookings, 1) loop
    v_pct := case when p_group and i > 1 then v_p.friend_pct else v_p.service_pct end;
    if v_pct <= 0 and v_p.product_pct <= 0 then continue; end if;
    update bookings b
       set promo_id           = v_p.id,
           member_tier        = v_p.label,
           member_service_pct = greatest(coalesce(b.member_service_pct, 0), v_pct),
           member_product_pct = greatest(coalesce(b.member_product_pct, 0), v_p.product_pct)
     where b.id = p_bookings[i]
       and b.promo_id is null
       and b.created_at > now() - interval '15 minutes'
       and (v_p.visit_by is null or (b.start_at at time zone 'Europe/Oslo')::date <= v_p.visit_by);
    get diagnostics v_one = row_count;
    v_n := v_n + v_one;
  end loop;
  return v_n;
end $$;
revoke execute on function mark_promo_booking(text, uuid[], boolean) from public;
grant  execute on function mark_promo_booking(text, uuid[], boolean) to anon, authenticated;

-- Nettbutikk: produktrabatten på en ordre som nettopp ble laget (før betaling).
create or replace function apply_promo_to_order(p_order uuid, p_token uuid, p_slug text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p   promo_campaigns;
  v_o   online_orders;
  v_cfg json := webshop_settings();
  v_pct numeric;
  v_sub numeric; v_disc numeric; v_ship numeric; v_total numeric;
begin
  select * into v_o from online_orders where id = p_order and access_token = p_token for update;
  if v_o.id is null then return null; end if;
  if v_o.promo_id is not null or v_o.created_at < now() - interval '15 minutes'
     or coalesce(v_o.payment_status::text, '') in ('paid', 'captured', 'authorized', 'reserved') then
    return json_build_object('total_nok', v_o.total_nok);
  end if;

  select * into v_p from promo_campaigns
   where lower(slug) = lower(trim(coalesce(p_slug, ''))) and active limit 1;
  if v_p.id is null or v_p.product_pct <= 0
     or (v_p.products_until is not null and promo_today() > v_p.products_until) then
    return json_build_object('total_nok', v_o.total_nok);
  end if;

  v_sub := coalesce(v_o.subtotal_nok, 0);
  v_pct := v_p.product_pct;
  -- Bare når tilbudet gir mer enn kundeklubb-rabatten kunden allerede har.
  if v_sub <= 0 or round(v_sub * v_pct / 100) <= coalesce(v_o.discount_nok, 0) then
    return json_build_object('total_nok', v_o.total_nok);
  end if;

  v_disc := round(v_sub * v_pct / 100);
  v_ship := 0;
  if v_o.delivery = 'ship' and (v_sub - v_disc) < coalesce((v_cfg->>'free_over_nok')::numeric, 599) then
    v_ship := coalesce((v_cfg->>'shipping_nok')::numeric, 79);
  end if;
  v_total := v_sub - v_disc + v_ship;

  update online_orders
     set promo_id       = v_p.id,
         member_tier    = v_p.label,
         discount_nok   = v_disc,
         discount_pct   = v_pct / 100,
         shipping_nok   = v_ship,
         total_nok      = v_total,
         authorized_nok = case when authorized_nok is not null then v_total end
   where id = p_order;

  return json_build_object('total_nok', v_total);
end $$;
revoke execute on function apply_promo_to_order(uuid, uuid, text) from public;
grant  execute on function apply_promo_to_order(uuid, uuid, text) to anon, authenticated;

-- Admin-oversikt: tall per kampanje.
create or replace function promo_stats()
returns table (id uuid, bookings int, booked_people int, completed int, orders int, order_nok numeric)
language sql stable security definer set search_path = public as $$
  select p.id,
         (select count(distinct coalesce(b.group_id, b.id))::int from bookings b
           where b.promo_id = p.id and coalesce(b.status::text, '') <> 'cancelled'),
         (select count(*)::int from bookings b
           where b.promo_id = p.id and coalesce(b.status::text, '') <> 'cancelled'),
         (select count(*)::int from bookings b
           where b.promo_id = p.id and b.status::text = 'completed'),
         (select count(*)::int from online_orders o
           where o.promo_id = p.id and coalesce(o.status::text, '') <> 'cancelled'),
         (select coalesce(sum(o.total_nok), 0) from online_orders o
           where o.promo_id = p.id and coalesce(o.status::text, '') <> 'cancelled')
    from promo_campaigns p
   where is_admin();
$$;
revoke execute on function promo_stats() from public, anon;
grant  execute on function promo_stats() to authenticated;

-- ---------- KPMG × Movember (kan endres under Admin → QR-tilbud) ----------
insert into promo_campaigns (slug, name, label, headline, body,
                             service_pct, friend_pct, product_pct,
                             book_by, visit_by, products_until, once_per_customer)
values ('kpmg-mo26', 'KPMG × Movember 2026', 'KPMG × Movember',
        'Takk for at du støttet Movember',
        'Som takk for shaven hos KPMG får du et eget tilbud hos oss. Ta med en venn – vennen får halv pris.',
        20, 50, 15,
        date '2026-11-30', date '2026-12-20', date '2026-12-24', true)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

-- Sjekk: skal vise én rad.
select slug, label, service_pct, friend_pct, product_pct, book_by, visit_by, products_until, active
  from promo_campaigns;
