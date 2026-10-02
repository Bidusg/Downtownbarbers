-- =====================================================================
-- 0070 – MARKEDSFØRINGSSAMTYKKE FRA BOOKINGFLYTEN
--   Lar den offentlige bookingveiviseren registrere markedsførings-
--   samtykke (markedsføringsloven §15) for kunden som nettopp booket.
--   Kalles fra server-action etter at bookingen er opprettet, med
--   booking-id som nøkkel – samme trygge, offentlige mønster som
--   portal_token_for_booking / booking_cancel_token (SECURITY DEFINER,
--   grant til anon). customers har ingen anon UPDATE-policy, så dette
--   MÅ gå via en security definer-funksjon.
--
--   Setter KUN samtykke = true (når avkrysningsboksen er huket av).
--   Fjerner aldri et eksisterende samtykke – en booking uten huket boks
--   kaller aldri denne funksjonen, så tidligere samtykke står urørt.
-- Idempotent (create or replace).
-- =====================================================================

create or replace function set_marketing_consent_for_booking(p_booking uuid)
returns void
language sql security definer set search_path = public as $$
  update customers c
     set marketing_consent    = true,
         marketing_consent_at = now()
    from bookings b
   where b.id = p_booking
     and c.id = b.customer_id;
$$;

grant execute on function set_marketing_consent_for_booking(uuid) to anon, authenticated;
