-- =====================================================================
-- 0040 – Egne bookinger på «Min side» (/ansatt)
--   «Min timeplan» leste tidligere bookings/customers/services DIREKTE.
--   Rollen 'staff' har ingen RLS-lesetilgang på disse tabellene (kun
--   admin/shop, jf. 0001), så lista ble tom for en ren staff-bruker.
--
--   Løsning (samme mønster som 0035): en tynn SECURITY DEFINER-RPC som
--   KUN returnerer den innloggede ansattes egne bookinger, strengt
--   filtrert på staff_id = current_staff_id(). Ingen RLS-policy på de
--   delte tabellene endres eller løsnes.
-- Kun lesing. Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Innlogget ansatts egne bookinger, framover i tid.
--   Felt: id, start_at, status, customer (full_name), service (name).
--   Filtrert på staff_id = current_staff_id() (fra 0035) og – når
--   p_future_only er true (standard) – start_at >= dagens start (Oslo).
--   Sortert stigende på start_at. status castes til text (enum -> text).
-- ---------------------------------------------------------------------
create or replace function my_bookings(p_future_only boolean default true)
returns table (
  id       uuid,
  start_at timestamptz,
  status   text,
  customer text,
  service  text
)
language sql
stable
security definer
set search_path = public
as $$
  with sid as (select current_staff_id() as id)
  select
    b.id,
    b.start_at,
    b.status::text,
    c.full_name,
    s.name
  from bookings b
  cross join sid
  left join customers c on c.id = b.customer_id
  left join services  s on s.id = b.service_id
  where sid.id is not null
    and b.staff_id = sid.id
    and (
      not coalesce(p_future_only, true)
      or b.start_at >= ((now() at time zone 'Europe/Oslo')::date)::timestamp at time zone 'Europe/Oslo'
    )
  order by b.start_at asc;
$$;
grant execute on function my_bookings(boolean) to authenticated;
