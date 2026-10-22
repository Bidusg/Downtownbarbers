-- =====================================================================
-- Trygg booking: alt eller ingenting, og aldri dobbeltbooking
--
-- create_booking_group lagrer ALLE linjene i en bestilling i én operasjon:
--   • Feiler én linje, lagres ingenting (ingen halve bestillinger).
--   • Bestillinger hos samme barber settes i kø (lås), så to kunder som
--     trykker «Fullfør» samtidig på samme tid ikke begge får den.
--   • Rett før lagring sjekkes det at tiden fortsatt er ledig (samme regel
--     som tidene kunden ser: turnus, pauser, fri, blokkeringer og bookinger).
--     Er den tatt, avbrytes alt med feilen SLOT_TAKEN, og kunden sendes
--     tilbake for å velge ny tid.
--
-- p_lines er en liste med linjer, hver med:
--   service, barber, start (tidspunkt), person, addons (uuid-liste),
--   extra_min (ekstra minutter fra tillegg),
--   check_min (minutter som skal være ledige fra start; 0 = ikke sjekk –
--              brukes på linje 2, 3 … når flere tjenester ligger etter
--              hverandre hos samme barber og første linje sjekket hele blokka)
--
-- Trygt å kjøre flere ganger.
-- =====================================================================

create or replace function create_booking_group(
  p_lines  jsonb,
  p_name   text,
  p_email  text,
  p_phone  text,
  p_source text,
  p_group  uuid,
  p_notes  text default null
) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  r        jsonb;
  b        text;
  v_ids    uuid[] := '{}';
  v_id     uuid;
  v_start  timestamptz;
  v_check  int;
  v_date   date;
  v_time   text;
  v_addons uuid[];
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_CART';
  end if;

  -- Lås hver barber (sortert, så to bestillinger aldri venter på hverandre i kryss).
  for b in
    select distinct x->>'barber' from jsonb_array_elements(p_lines) x order by 1
  loop
    perform pg_advisory_xact_lock(hashtext('dtb-booking:' || coalesce(b, '')));
  end loop;

  for r in select x from jsonb_array_elements(p_lines) x loop
    v_start := (r->>'start')::timestamptz;
    v_check := coalesce((r->>'check_min')::int, 0);

    if v_check > 0 then
      v_date := (v_start at time zone 'Europe/Oslo')::date;
      v_time := to_char(v_start at time zone 'Europe/Oslo', 'HH24:MI');
      if not (v_time = any(available_slots_dur(r->>'barber', v_check, v_date))) then
        raise exception 'SLOT_TAKEN';
      end if;
    end if;

    select coalesce(array_agg(a::uuid), '{}')
      into v_addons
      from jsonb_array_elements_text(coalesce(r->'addons', '[]'::jsonb)) a;

    v_id := create_booking_line(
      r->>'service', r->>'barber', v_start,
      p_name, p_email, p_phone, p_source,
      p_group, r->>'person', v_addons,
      coalesce((r->>'extra_min')::int, 0),
      p_notes
    );
    if v_id is null then
      raise exception 'BOOKING_FAILED';
    end if;
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end $$;

grant execute on function create_booking_group(jsonb, text, text, text, text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
