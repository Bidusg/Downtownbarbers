-- =====================================================================
-- AVBESTILLINGER – stemple HVEM og NÅR en time ble avbestilt
--
--   Til nå ble en avbestilling bare lagret som status = 'cancelled' på
--   bookingen. Raden beholdes (ingen sletting), så HISTORIKKEN finnes –
--   men vi har ikke visst *når* den ble avbestilt eller *hvem* som gjorde
--   det (kunden selv, eller oss i skranken/admin).
--
--   Denne migrasjonen legger til to kolonner og en trigger som stempler
--   dem automatisk UANSETT hvilken vei avbestillingen kommer fra:
--     • kunde via «Min side»       (RPC portal_cancel_booking)
--     • kunde via avbestill-lenke  (RPC cancel_booking_by_token)
--     • oss i admin/skranke        (setBookingStatus → update status)
--
--   Vi rører derfor INGEN av RPC-ene (de settes ikke engang alle fra
--   repoet). Trigger på bookings fanger alle veier på ett sted.
--
--   «Hvem»: avbestiller kunden, skjer det anonymt via token/Min side
--   (auth.uid() er null). Avbestiller vi, er det en innlogget ansatt/eier
--   (auth.uid() er satt). Det gir et presist og vedlikeholdsfritt skille.
--
--   Historiske avbestillinger (før denne kjøres) får cancelled_at = null
--   og cancelled_by = null → vises som «– (ukjent)» i oversikten. Alt
--   NYTT stemples korrekt fra og med nå.
--
--   Idempotent. Ingen data røres. Trygt å kjøre om igjen.
-- =====================================================================

alter table bookings add column if not exists cancelled_at timestamptz;
alter table bookings add column if not exists cancelled_by text;   -- 'customer' | 'staff'

-- Rask henting av avbestillinger nyeste først.
create index if not exists idx_bookings_cancelled_at
  on bookings (cancelled_at desc) where status = 'cancelled';

create or replace function stamp_booking_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ble nettopp avbestilt (og var det ikke fra før) → stemple tid + hvem.
  if new.status = 'cancelled' and coalesce(old.status, '') <> 'cancelled' then
    new.cancelled_at := now();
    -- Anonym (token / Min side) = kunden selv. Innlogget = oss (ansatt/eier).
    new.cancelled_by := case when auth.uid() is null then 'customer' else 'staff' end;

  -- Gjenåpnes en avbestilt time (f.eks. satt tilbake til confirmed) → nullstill
  -- stemplene, så oversikten alltid speiler faktisk status.
  elsif new.status <> 'cancelled' and coalesce(old.status, '') = 'cancelled' then
    new.cancelled_at := null;
    new.cancelled_by := null;
  end if;

  return new;
end $$;

drop trigger if exists trg_stamp_booking_cancellation on bookings;
create trigger trg_stamp_booking_cancellation
  before update of status on bookings
  for each row
  execute function stamp_booking_cancellation();
