-- =====================================================================
-- La publikum (anon) sende inn bookinger + kunder fra online booking.
-- =====================================================================

create policy customers_public_insert on customers for insert with check (true);
create policy bookings_public_insert  on bookings  for insert with check (true);
