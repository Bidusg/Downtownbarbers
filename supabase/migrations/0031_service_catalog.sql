-- =====================================================================
-- 0031 — TJENESTE-KATALOG: online-bookbar, popularitet, behandlingsunntak
--   1) services.online_bookable — skilt fra `active`. En tjeneste kan være
--      aktiv (synlig i kasse/admin) men samtidig skrudd av for online booking.
--   2) service_popularity(p_days) — antall FULLFØRTE bookinger per tjeneste
--      siste N dager (default 90). Brukes til å sortere booking-veiviseren
--      (mest booket øverst) innen hver kategori.
--   3) staff_service_exclusions — én rad = «denne barberen utfører IKKE denne
--      tjenesten». Booking filtrerer barber-lista på dette for valgt tjeneste.
--
--   available_slots (tid/slot-logikk) er BEVISST urørt — unntak håndteres ved
--   å filtrere barber-lista i booking-flyten, ikke i slot-funksjonen.
-- Idempotent.
-- =====================================================================

-- 1) Online-bookbar per tjeneste (default true → ingen regresjon på eksisterende).
alter table services add column if not exists online_bookable boolean not null default true;

-- 3) Behandlingsunntak per ansatt.
create table if not exists staff_service_exclusions (
  staff_id   uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, service_id)
);
create index if not exists staff_service_exclusions_service_idx
  on staff_service_exclusions (service_id);

alter table staff_service_exclusions enable row level security;
-- Admin: full tilgang. Kasse (shop): kun lesetilgang. Ingen using(true).
drop policy if exists sse_admin_all on staff_service_exclusions;
create policy sse_admin_all on staff_service_exclusions
  for all using (is_admin()) with check (is_admin());
drop policy if exists sse_shop_read on staff_service_exclusions;
create policy sse_shop_read on staff_service_exclusions
  for select using (is_shop_or_admin());

-- 2) Popularitet: fullførte bookinger per tjeneste siste N dager.
--    security definer + grant til anon slik at den offentlige booking-siden
--    kan sortere uten å eksponere rå bookings-data (samme mønster som
--    available_slots / salon_hours).
create or replace function service_popularity(p_days int default 90)
returns table (service_id uuid, completed_count int)
language sql stable security definer set search_path = public as $$
  select b.service_id, count(*)::int
  from bookings b
  where b.status = 'completed'
    and b.service_id is not null
    and b.start_at >= now() - make_interval(days => greatest(coalesce(p_days, 90), 1))
  group by b.service_id;
$$;
grant execute on function service_popularity(int) to anon, authenticated;

-- Offentlig lesbar liste over behandlingsunntak (tjeneste-navn → barber-navn)
-- for booking-flyten. RLS-tabellen forblir streng; dette er den kontrollerte
-- offentlige lesestien (security definer, som available_slots). Kun aktive barbere.
create or replace function service_exclusions_public()
returns table (service_name text, barber_name text)
language sql stable security definer set search_path = public as $$
  select s.name, st.full_name
  from staff_service_exclusions x
  join services s on s.id = x.service_id
  join staff st on st.id = x.staff_id
  where st.active;
$$;
grant execute on function service_exclusions_public() to anon, authenticated;
