-- =====================================================================
-- SHOP-FLAGS 2 – flere av/på-brytere for kassa (kalender-funksjoner)
--
--   Utvider det eksisterende shop_flags-systemet (0052) med fire nye
--   brytere, slik at eier kan skru kalender-funksjoner av/på for kassa:
--     • move_booking_enabled      – flytte time til ny tid (dra opp/ned)
--     • transfer_booking_enabled  – flytte kunde til en annen barber
--     • manual_booking_enabled    – booke ny time ved å trykke i kalenderen
--     • block_times_enabled       – blokkere/pause tid fra kassa
--
--   Standardverdier er valgt for å BEVARE dagens oppførsel: flytte/booke
--   er på i dag (default true), blokkering var kun i admin (default av).
--   Eier/admin omgår fortsatt alle flaggene (is_owner-bypass i app-laget).
--
--   Kun get_shop_flags() oppdateres (nye nøkler i standard-objektet, så
--   manglende nøkler får riktig default). set_shop_flags() er generisk og
--   trenger ingen endring. Idempotent (create or replace), ingen data røres.
-- =====================================================================

create or replace function get_shop_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select
    jsonb_build_object(
      'discount_enabled', true,
      'friend_family_discount_enabled', false,
      'friend_family_discount_pct', 20,
      'dropin_without_customer_enabled', true,
      'drag_for_length_enabled', false,
      'move_booking_enabled', true,
      'transfer_booking_enabled', true,
      'manual_booking_enabled', true,
      'block_times_enabled', false
    )
    || coalesce((select value from settings where key = 'shop_flags'), '{}'::jsonb);
$$;
grant execute on function get_shop_flags() to authenticated;
