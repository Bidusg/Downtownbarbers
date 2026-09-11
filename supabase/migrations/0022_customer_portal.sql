-- =====================================================================
-- 0022 – KUNDEPORTAL ("Min side")
--   Personlig, innloggingsfri side (samme mønster som avbestilling):
--   hver kunde har en portal_token og når sin side via en lenke i
--   bekreftelses-e-posten. Data hentes av en SECURITY DEFINER-funksjon
--   som kun eksponerer kundens egne data ut fra tokenet.
-- Idempotent.
-- =====================================================================

alter table customers add column if not exists portal_token uuid unique default gen_random_uuid();
update customers set portal_token = gen_random_uuid() where portal_token is null;

create or replace function customer_portal(p_token uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_cust customers;
  v_loyalty json;
  v_bookings json;
  v_completed int;
  v_spent numeric;
begin
  select * into v_cust from customers where portal_token = p_token limit 1;
  if v_cust.id is null then
    return null;
  end if;

  select coalesce(json_agg(to_json(t) order by t.start_at desc), '[]'::json)
    into v_bookings
  from (
    select bk.id, bk.start_at, bk.status, bk.price_nok,
           s.name as service, st.full_name as barber
    from bookings bk
    left join services s on s.id = bk.service_id
    left join staff st on st.id = bk.staff_id
    where bk.customer_id = v_cust.id
    order by bk.start_at desc
    limit 100
  ) t;

  select count(*) filter (where status = 'completed'),
         coalesce(sum(price_nok) filter (where status = 'completed'), 0)
    into v_completed, v_spent
    from bookings where customer_id = v_cust.id;

  -- Klippekort via eksisterende funksjon (tåler at den mangler).
  begin
    select row_to_json(l) into v_loyalty from loyalty_status(v_cust.id) l;
  exception when others then
    v_loyalty := null;
  end;

  return json_build_object(
    'full_name', v_cust.full_name,
    'member_since', v_cust.created_at,
    'visits', v_completed,
    'total_spent', v_spent,
    'loyalty', v_loyalty,
    'bookings', v_bookings
  );
end $$;

grant execute on function customer_portal(uuid) to anon, authenticated;

-- Hjelpefunksjon: hent portal-token ut fra en booking (for e-postlenke,
-- samme mønster som booking_cancel_token – trygt i den offentlige flyten).
create or replace function portal_token_for_booking(p_booking uuid)
returns uuid
language sql security definer set search_path = public as $$
  select c.portal_token
  from bookings b
  join customers c on c.id = b.customer_id
  where b.id = p_booking;
$$;
grant execute on function portal_token_for_booking(uuid) to anon, authenticated;
