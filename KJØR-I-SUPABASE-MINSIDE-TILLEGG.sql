-- =====================================================================
-- KJØR-I-SUPABASE-MINSIDE-TILLEGG.sql   (Min side: tillegg per booking)
--
--   ADDITIV og trygg: rører IKKE customer_portal eller noe annet.
--   Publikum (anon) kan ikke lese booking_addons direkte (RLS). Denne
--   SECURITY DEFINER-funksjonen eksponerer KUN tilleggene til kundens
--   egne bookinger, matchet ut fra portal-tokenet – samme mønster som
--   customer_portal (customers.portal_token = p_token).
--
--   Idempotent (create or replace).
-- =====================================================================

create or replace function customer_portal_addons(p_token uuid)
returns table(booking_id uuid, name text, price_nok numeric)
language sql security definer set search_path = public as $$
  select ba.booking_id, ba.name, ba.price_nok
  from booking_addons ba
  join bookings b   on b.id = ba.booking_id
  join customers c  on c.id = b.customer_id
  where c.portal_token = p_token
  order by ba.created_at;
$$;

grant execute on function customer_portal_addons(uuid) to anon, authenticated;
