-- =====================================================================
-- KJØR-I-SUPABASE-ENDRE-BEHANDLING.sql
--   Endre hvilken behandling (og hvilke tillegg) som er booket på en time.
--   Brukes når en kunde ringer og vil bytte, eller i kassa når det faktisk
--   utførte avviker fra det som ble booket.
--
--   change_booking_service gjør ALT i én transaksjon (security definer,
--   speiler set_booking_length / reschedule_booking – shop kan ikke skrive
--   til bookings direkte):
--     1) låser bookingen (for update),
--     2) setter ny hovedbehandling (pris + varighet fra services, server-side),
--     3) erstatter tilleggene i booking_addons med den nye lista,
--     4) regner ny pris = hovedbehandling + sum(tillegg)  (samme invariant som
--        create_booking_with_addons: bookings.price_nok inkluderer tilleggene),
--     5) regner ny sluttid = start + varighet(hovedbehandling + tillegg),
--     6) avviser hvis den nye lengden overlapper en annen aktiv booking for
--        samme barber (da må man flytte/forkorte først).
--   Feiler noe, rulles ALT tilbake.
--
--   Behandlinger sendes som NAVN (slik appen allerede jobber), slås opp mot
--   aktive services. Krever 0052 (is_shop_or_admin dekker eier) og
--   booking_addons-tabellen (KJØR-I-SUPABASE-BOOKING-GRUPPE).
--
--   Idempotent (create or replace). Ingen nye tabeller/kolonner.
-- =====================================================================

create or replace function change_booking_service(
  p_booking uuid,
  p_service text,
  p_addons  text[] default '{}'::text[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_b      record;
  v_svc    record;
  v_a      record;
  v_addon  text;
  v_price  numeric(10,2) := 0;
  v_dur    int := 0;
  v_end    timestamptz;
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;

  -- Lås timen. Kan ikke endres når den er gjort opp/kansellert.
  select id, staff_id, start_at, status
    into v_b
    from bookings
    where id = p_booking
    for update;
  if not found then
    raise exception 'Fant ikke timen';
  end if;
  if v_b.status in ('completed', 'no_show', 'cancelled') then
    raise exception 'Kan ikke endre behandling på en fullført eller kansellert time';
  end if;

  -- Hovedbehandling (aktiv). Pris + varighet settes server-side.
  select id, name, price_nok, duration_min
    into v_svc
    from services
    where active = true and lower(name) = lower(btrim(p_service))
    order by sort_order nulls last, name
    limit 1;
  if v_svc.id is null then
    raise exception 'Fant ikke behandlingen «%»', p_service;
  end if;

  v_price := coalesce(v_svc.price_nok, 0);
  v_dur   := greatest(5, coalesce(v_svc.duration_min, 0));

  -- Erstatt tilleggene. Summer pris + varighet fra services (aldri klient).
  delete from booking_addons where booking_id = v_b.id;

  if p_addons is not null then
    foreach v_addon in array p_addons loop
      if btrim(coalesce(v_addon, '')) = '' then
        continue;
      end if;
      select id, name, price_nok, duration_min
        into v_a
        from services
        where active = true and lower(name) = lower(btrim(v_addon))
        order by sort_order nulls last, name
        limit 1;
      if v_a.id is not null then
        insert into booking_addons (booking_id, service_id, name, price_nok)
          values (v_b.id, v_a.id, v_a.name, coalesce(v_a.price_nok, 0));
        v_price := v_price + coalesce(v_a.price_nok, 0);
        v_dur   := v_dur + greatest(0, coalesce(v_a.duration_min, 0));
      end if;
    end loop;
  end if;

  v_end := v_b.start_at + make_interval(mins => v_dur);

  -- Ingen overlapp med en annen aktiv booking for samme barber (speiler
  -- set_booking_length): blir den nye behandlingen for lang, må man flytte først.
  if v_b.staff_id is not null and exists (
    select 1
      from bookings o
      where o.staff_id = v_b.staff_id
        and o.id <> v_b.id
        and o.status <> 'cancelled'
        and o.start_at < v_end
        and o.end_at   > v_b.start_at
  ) then
    raise exception 'Den nye behandlingen blir for lang og overlapper en annen time. Flytt eller forkort først.';
  end if;

  update bookings
     set service_id = v_svc.id,
         price_nok  = v_price,
         end_at     = v_end
   where id = v_b.id;
end $$;

grant execute on function change_booking_service(uuid, text, text[]) to authenticated;
