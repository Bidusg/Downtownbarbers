-- =====================================================================
-- 0045 – KUNDE-SELVBETJENING FRA MIN SIDE (avbestill + endre time)
--
--   «Min side» (/min-side/[token]) er innloggingsfri og token-gated
--   (customers.portal_token). Til nå var siden read-only. Denne
--   migrasjonen lar kunden AVBESTILLE og ENDRE TID på sine egne
--   kommende timer, uten innlogging og uten ny RLS-flate:
--
--     portal_cancel_booking(token, booking)         -> status-tekst
--     portal_reschedule_slots(token, booking, dato) -> HH:MM[]
--     portal_reschedule_booking(token, booking, dato, tid) -> status
--
--   Alle tre er SECURITY DEFINER og verifiserer at bookingen faktisk
--   tilhører kunden bak tokenet FØR de gjør noe – en fremmed uten
--   tokenet kan ikke røre andres timer. Ledig-tid valideres SERVER-SIDE
--   på nytt i reschedule (ikke bare i UI), så et direkte RPC-kall ikke
--   kan booke en opptatt/ugyldig tid. Tidspunkt bygges med
--   'Europe/Oslo' – nøyaktig som available_slots – så tiden blir riktig
--   uavhengig av serverens tidssone.
--
--   Idempotent (create or replace). Ingen nye tabeller/kolonner.
-- =====================================================================

-- Intern hjelper: kunde-id for et gyldig (token, booking)-par, ellers null.
create or replace function portal_owner_customer(p_token uuid, p_booking uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select b.customer_id
  from bookings b
  join customers c on c.id = b.customer_id
  where b.id = p_booking
    and c.portal_token = p_token;
$$;
grant execute on function portal_owner_customer(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Avbestill egen kommende time. Status: ok | already | too_late | not_found
-- ---------------------------------------------------------------------
create or replace function portal_cancel_booking(p_token uuid, p_booking uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_status text;
  v_start timestamptz;
begin
  v_cust := portal_owner_customer(p_token, p_booking);
  if v_cust is null then
    return 'not_found';
  end if;

  select status, start_at into v_status, v_start
    from bookings where id = p_booking;

  if v_status = 'cancelled' then
    return 'already';
  end if;
  -- Bare kommende, aktive timer kan avbestilles på nett.
  if v_status not in ('pending', 'confirmed') or v_start <= now() then
    return 'too_late';
  end if;

  update bookings set status = 'cancelled' where id = p_booking;
  return 'ok';
end $$;
grant execute on function portal_cancel_booking(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Ledige tider (HH:MM) for kundens egen booking på en gitt dato –
-- samme barber + tjeneste som bookingen. Tom liste hvis token/booking
-- ikke hører sammen.
-- ---------------------------------------------------------------------
create or replace function portal_reschedule_slots(
  p_token uuid, p_booking uuid, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_barber text; v_service text;
begin
  v_cust := portal_owner_customer(p_token, p_booking);
  if v_cust is null then
    return '{}';
  end if;

  select st.full_name, s.name into v_barber, v_service
    from bookings b
    left join staff st on st.id = b.staff_id
    left join services s on s.id = b.service_id
    where b.id = p_booking;

  if v_barber is null or v_service is null then
    return '{}';
  end if;

  return available_slots(v_barber, v_service, p_date);
end $$;
grant execute on function portal_reschedule_slots(uuid, uuid, date) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Endre tid på egen kommende time. Tar dato + HH:MM (bygges i Oslo-tid,
-- som available_slots). Validerer ledig-tid server-side.
-- Status: ok | not_found | too_late | past | taken | invalid
-- ---------------------------------------------------------------------
create or replace function portal_reschedule_booking(
  p_token uuid, p_booking uuid, p_date date, p_time text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_status text; v_start_old timestamptz;
  v_barber text; v_service text; v_dur int;
  v_slots text[];
  v_hhmm text;
  v_new_start timestamptz;
begin
  v_cust := portal_owner_customer(p_token, p_booking);
  if v_cust is null then
    return 'not_found';
  end if;

  select b.status, b.start_at, st.full_name, s.name, coalesce(s.duration_min, 30)
    into v_status, v_start_old, v_barber, v_service, v_dur
    from bookings b
    left join staff st on st.id = b.staff_id
    left join services s on s.id = b.service_id
    where b.id = p_booking;

  -- Bare kommende, aktive timer kan endres.
  if v_status not in ('pending', 'confirmed') or v_start_old <= now() then
    return 'too_late';
  end if;
  if v_barber is null or v_service is null then
    return 'invalid';
  end if;

  -- Normaliser tid til HH24:MI og sjekk at den faktisk er ledig nå.
  begin
    v_hhmm := to_char(p_time::time, 'HH24:MI');
  exception when others then
    return 'invalid';
  end;

  v_slots := available_slots(v_barber, v_service, p_date);
  if not (v_hhmm = any (v_slots)) then
    return 'taken';
  end if;

  -- Bygg instant i Oslo-tid – nøyaktig som available_slots.
  v_new_start := (p_date + v_hhmm::time) at time zone 'Europe/Oslo';
  if v_new_start <= now() then
    return 'past';
  end if;

  update bookings set
    start_at = v_new_start,
    end_at   = v_new_start + make_interval(mins => v_dur)
  where id = p_booking;

  return 'ok';
end $$;
grant execute on function portal_reschedule_booking(uuid, uuid, date, text) to anon, authenticated;
