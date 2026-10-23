-- =====================================================================
-- Kundens språk (norsk / engelsk)
--
-- Når en kunde booker på engelsk, lagres «en» på kunden. Da sendes
-- bekreftelse, påminnelse dagen før, kvittering og «ikke møtt»-e-post
-- på engelsk – både fra nettsiden, kassa og den automatiske jobben.
-- Booker kunden senere på norsk, byttes det tilbake til «no».
--
-- Trygt å kjøre flere ganger. Uten denne SQL-en går alt på norsk som før.
-- =====================================================================

alter table customers add column if not exists lang text;

do $$ begin
  alter table customers
    add constraint customers_lang_check check (lang is null or lang in ('no', 'en'));
exception when duplicate_object then null; end $$;

-- Kalles fra bookingen på nettsiden rett etter at timen er lagret (samme
-- trygge mønster som set_marketing_consent_for_booking: booking-id som nøkkel).
create or replace function set_customer_lang_for_booking(p_booking uuid, p_lang text)
returns void
language sql security definer set search_path = public as $$
  update customers c
     set lang = case when p_lang = 'en' then 'en' else 'no' end
    from bookings b
   where b.id = p_booking
     and c.id = b.customer_id;
$$;

grant execute on function set_customer_lang_for_booking(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
