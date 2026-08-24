-- =====================================================================
-- Vipps: marker en booking som betalt (depositum) via en trygg
-- SECURITY DEFINER-funksjon, siden kunden ikke er innlogget.
-- Referanse-format: 'booking-<uuid>'.
-- =====================================================================

create or replace function mark_booking_paid(p_reference text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  v_id := replace(p_reference, 'booking-', '')::uuid;
  update bookings
     set deposit_paid = true,
         payment_provider = 'vipps',
         payment_ref = p_reference
   where id = v_id;
end $$;

grant execute on function mark_booking_paid(text) to anon, authenticated;
