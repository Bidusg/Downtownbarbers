-- =====================================================================
-- KUNDE ↔ BARBER-KOBLING (customer_barbers)
--
--   Hvem har klippet hvilken kunde? I det nye systemet utledes dette
--   fra bookinger/salg, men den HISTORISKE koblingen (hvem barberen har
--   klippet i Fixit før lansering) finnes ikke i bookingene våre. Denne
--   tabellen holder den koblingen på ett sted, slik at:
--     • Fixit-importen kan legge inn «kunde X ble klippet av barber Y»
--       med antall besøk, sist besøkt og forbruk (det Fixit-eksporten gir).
--     • Kunde-filteret (admin → Kunder → Filter) kan vise alle kunder en
--       barber har klippet = union av bookinger + salg + denne tabellen.
--
--   Én rad per (kunde, barber). Idempotent – trygg å kjøre flere ganger.
--   Ingen sletting av eksisterende data.
-- =====================================================================

create table if not exists customer_barbers (
  customer_id  uuid not null references customers(id) on delete cascade,
  staff_id     uuid not null references staff(id)     on delete cascade,
  visits       integer,            -- antall besøk hos denne barberen (fra Fixit)
  last_visit   date,               -- sist klippet av denne barberen
  total_spent  numeric(12,2),      -- historisk forbruk hos denne barberen (fra Fixit)
  source       text default 'fixit', -- hvor koblingen kom fra (fixit / manuell)
  created_at   timestamptz not null default now(),
  primary key (customer_id, staff_id)
);

-- Rask oppslag «alle kunder for barber X».
create index if not exists customer_barbers_staff_idx on customer_barbers (staff_id);

alter table customer_barbers enable row level security;

-- Admin/eier: full tilgang. Shop: lese (filteret brukes i admin, men vi lar
-- shop lese så samme spørring ikke feiler for kasse-rollen). Ingen anon.
drop policy if exists customer_barbers_admin_all on customer_barbers;
create policy customer_barbers_admin_all on customer_barbers
  for all using (is_admin()) with check (is_admin());

drop policy if exists customer_barbers_shop_read on customer_barbers;
create policy customer_barbers_shop_read on customer_barbers
  for select using (is_shop_or_admin());
