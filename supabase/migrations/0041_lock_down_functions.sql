-- =====================================================================
-- 0041 – Lås ned SECURITY DEFINER-funksjoner (fjern PUBLIC/anon-tilgang)
--
--   BAKGRUNN: I Postgres får hver funksjon EXECUTE til PUBLIC som standard
--   ved opprettelse. Ingen tidligere migrasjon har gjort `revoke ... from
--   public`, så ALLE SECURITY DEFINER-funksjonene har vært kjørbare av hvem
--   som helst med den offentlige anon-nøkkelen (som ligger i nettleser-
--   bundelen, NEXT_PUBLIC_SUPABASE_ANON_KEY). requireRole() i app-laget
--   beskytter IKKE mot direkte RPC-kall mot Supabase-URL-en.
--
--   Effekt: en utenforstående kunne dumpe kundelister (navn/telefon/e-post)
--   via shop_customer_search / day_agenda / due_reminders / due_followups,
--   og markere bookinger betalt via mark_booking_paid.
--
--   Denne migrasjonen fjerner PUBLIC + anon fra de funksjonene som KUN skal
--   nås av innloggede ansatte (authenticated) eller av server-ruter med
--   service-role (som uansett bypasser grants). Rene offentlige funksjoner
--   for booking/vurdering/portal (available_slots, rate_booking,
--   customer_portal, cancel_booking_by_token osv.) røres IKKE.
--
--   Idempotent: revoke/grant kan kjøres flere ganger.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GRUPPE A – kun innloggede ansatte (authenticated).
--   Kalles fra /kasse og /admin (alle bak requireRole). Ingen anonym
--   flyt bruker disse. Klokke-terminalen (/kasse/stempling) er også
--   innlogget (requireRole), så PIN er andre-faktor, ikke erstatning.
-- ---------------------------------------------------------------------
revoke execute on function shop_customer_search(text)         from public, anon;
grant  execute on function shop_customer_search(text)          to authenticated;

revoke execute on function day_agenda(date)                   from public, anon;
grant  execute on function day_agenda(date)                    to authenticated;

revoke execute on function active_staff_for_clock()           from public, anon;
grant  execute on function active_staff_for_clock()            to authenticated;

revoke execute on function shift_summary_today()              from public, anon;
grant  execute on function shift_summary_today()               to authenticated;

revoke execute on function verify_pin_status(uuid, text)      from public, anon;
grant  execute on function verify_pin_status(uuid, text)       to authenticated;

revoke execute on function record_shift_event(uuid, text, text) from public, anon;
grant  execute on function record_shift_event(uuid, text, text)  to authenticated;

revoke execute on function current_shift_status(uuid)         from public, anon;
grant  execute on function current_shift_status(uuid)          to authenticated;

revoke execute on function due_followups(int)                 from public, anon;
grant  execute on function due_followups(int)                  to authenticated;

revoke execute on function mark_followup_sent(uuid, text)     from public, anon;
grant  execute on function mark_followup_sent(uuid, text)      to authenticated;

-- ---------------------------------------------------------------------
-- GRUPPE B – kun server-til-server (service-role).
--   Kalles utelukkende fra Next-ruter som nå bruker createServiceClient()
--   (webhooks + cron). service_role bypasser grants, så vi fjerner ALLE
--   roller. Ingen innlogget bruker eller anon skal treffe disse direkte.
-- ---------------------------------------------------------------------
revoke execute on function due_reminders()                          from public, anon, authenticated;
revoke execute on function mark_reminder_sent(uuid)                 from public, anon, authenticated;
revoke execute on function mark_booking_paid(text)                  from public, anon, authenticated;
revoke execute on function sms_inbound_handle(text, text, text)     from public, anon, authenticated;
revoke execute on function sms_set_consent_by_phone(text, boolean)  from public, anon, authenticated;
