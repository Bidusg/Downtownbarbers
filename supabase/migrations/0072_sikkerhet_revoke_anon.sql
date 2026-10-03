-- 0072_sikkerhet_revoke_anon.sql
-- =====================================================================
-- GO-LIVE-SIKKERHET: fjern anonym tilgang til kasse-/kundefunksjoner.
--
-- Disse SECURITY DEFINER-funksjonene ble i 0016 gitt «grant execute … to
-- anon, authenticated». De kalles i praksis KUN fra innlogget kasse-kontekst
-- (src/app/kasse/actions.ts). Offentlig booking bruker create_booking (ikke
-- disse), og kunde-reschedule går via den token-sikrede portal_reschedule_booking.
-- Derfor er det trygt å fjerne anon-tilgang:
--   * reschedule_booking / create_booking_for_customer  → anon kunne flytte/
--     gjenåpne eller opprette hvilken som helst booking.
--   * shop_customer_search / day_agenda                → anon kunne lese alle
--     kunders navn/telefon/e-post og hele dagsagendaen.
--
-- Merk: dette lukker den ANONYME vektoren. Disse fire er fortsatt kjørbare for
-- alle innloggede (authenticated). Den gjenstående jobben (eget punkt): slå av
-- offentlig e-post-registrering i Supabase Auth, så ingen kan selv-registrere
-- seg til en customer-konto og dermed nå kunde-søk/dagsagenda.
-- =====================================================================

revoke execute on function create_booking_for_customer(uuid, text, text, timestamptz) from anon, public;
revoke execute on function reschedule_booking(uuid, timestamptz, text) from anon, public;
revoke execute on function shop_customer_search(text) from anon, public;
revoke execute on function day_agenda(date) from anon, public;

-- Behold tilgang for innloggede (idempotent re-grant).
grant execute on function create_booking_for_customer(uuid, text, text, timestamptz) to authenticated;
grant execute on function reschedule_booking(uuid, timestamptz, text) to authenticated;
grant execute on function shop_customer_search(text) to authenticated;
grant execute on function day_agenda(date) to authenticated;
