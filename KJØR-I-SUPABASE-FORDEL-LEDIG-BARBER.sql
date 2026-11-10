-- =====================================================================
-- Fordel «Hvem som helst» / første ledige rettferdig mellom barbere
--
-- Krav fra eier: når kunden velger «første ledige» skal hen dirigeres til
-- barberen som har FÆRREST kunder den dagen, slik at en barber som allerede
-- har mange kunder ikke også får de som velger «hvem som helst».
--
-- barber_day_load(p_date) gir, per aktiv barber, antall KUNDER (en
-- gruppebooking med flere tjenester = én kunde) og bookede minutter på en
-- gitt dato (Oslo-tid). Telles: status pending, confirmed og completed.
-- Blokkeringer/pauser fra kassa er bookinger UTEN tjeneste (service_id null)
-- og telles ikke.
-- Barbernavn = staff.full_name (samme nøkkel som available_slots_dur og
-- create_booking_group bruker som p_barber).
--
-- SIKKERHET: funksjonen er security definer og GIS TIL ANON, fordi den
-- offentlige bookingflyten kjører som anon. Det er akseptabelt fordi den
-- KUN returnerer aggregerte tall per barber (navn, antall, minutter) –
-- ingen kundedata, ingen booking-id-er, ingen tidspunkt.
--
-- Koden i cart-actions.ts tåler at denne filen ikke er kjørt (da velges
-- første ledige barber i rekkefølge, som før). Trygt å kjøre flere ganger.
-- =====================================================================

create or replace function barber_day_load(p_date date)
returns table(barber text, bookings int, minutes int)
language sql stable security definer set search_path = public as $$
  select s.full_name::text as barber,
         count(distinct coalesce(b.group_id, b.id))::int as bookings,
         coalesce(sum(greatest(0, extract(epoch from (b.end_at - b.start_at)) / 60)), 0)::int as minutes
    from staff s
    left join bookings b
      on b.staff_id = s.id
     and b.service_id is not null
     and b.status::text in ('pending', 'confirmed', 'completed')
     -- Oslo-døgn som tidsintervall, så indeksen på start_at kan brukes.
     and b.start_at >= (p_date::timestamp at time zone 'Europe/Oslo')
     and b.start_at <  ((p_date + 1)::timestamp at time zone 'Europe/Oslo')
   where s.active
   group by s.full_name;
$$;

revoke all on function barber_day_load(date) from public;
revoke all on function barber_day_load(date) from anon;
grant execute on function barber_day_load(date) to anon, authenticated;

notify pgrst, 'reload schema';

-- Kontroll: skal gi én rad per aktiv barber (antall/minutter for i dag).
select * from barber_day_load((now() at time zone 'Europe/Oslo')::date) order by barber;
