-- =====================================================================
-- 0068 – LEDIGE TIDER FOR EN PERIODE (én RPC for mange dager)
--
--   available_slots(barber, service, dato) gir tider for ÉN dag. Booking-
--   veiviseren trengte da ett kall per dag → tregt og «henter …» hver gang
--   man byttet dag. Denne funksjonen returnerer ledige tider for HELE
--   perioden i ETT kall (gjenbruker den eksisterende dag-logikken), slik at
--   tidene kan vises som kolonner per dag uten venting.
--
--   Idempotent.
-- =====================================================================

create or replace function available_slots_range(
  p_barber text, p_service text, p_from date, p_to date
) returns table(slot_date date, slot_time text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  d date := p_from;
begin
  -- Sikkerhetsgrense: maks ~60 dager per kall.
  if p_to < p_from or p_to - p_from > 60 then
    return;
  end if;
  while d <= p_to loop
    return query
      select d, unnest(available_slots(p_barber, p_service, d));
    d := d + 1;
  end loop;
end $$;

grant execute on function available_slots_range(text, text, date, date)
  to anon, authenticated;
