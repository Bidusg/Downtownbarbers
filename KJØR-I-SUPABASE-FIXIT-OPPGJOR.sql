-- =====================================================================
-- FIXIT-KASSEOPPGJØR I DET NYE SYSTEMET (idempotent)
--
-- Lagrer oppgjørene fra Fixit-rapporten «Kasseoppgjør» (lastes opp som PDF
-- under Admin → Kasseoppgjør → «Importer fra Fixit»). Tallene brukes til å
-- sammenligne dag for dag med det nye systemet og til å overstyre kort/Vipps
-- i dagsoppgjøret, så kasseoppgjøret viser det som faktisk er riktig.
--
-- Én rad per Fixit-oppgjør (oppgjørsnummeret er unikt). Alle beløp inkl. mva.
-- Admin/eier kan lese og skrive, revisor kan lese. Trygt å kjøre flere ganger.
-- =====================================================================

create or replace function is_admin_or_revisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'eier', 'revisor')
  );
$$;

create table if not exists fixit_settlements (
  nr              int primary key,              -- Fixit-oppgjørsnummer
  settle_date     date    not null,
  treatment_nok   numeric not null default 0,   -- Behandlinger
  products_nok    numeric not null default 0,   -- Varesalg
  total_nok       numeric not null default 0,   -- Sum tot
  cash_nok        numeric not null default 0,   -- Kontant
  bankcard_nok    numeric not null default 0,   -- Bankkort
  creditcard_nok  numeric not null default 0,   -- Kredittkort
  credit_nok      numeric not null default 0,   -- Kreditt
  giftcard_nok    numeric not null default 0,   -- Gavekort
  giro_nok        numeric not null default 0,   -- Giro
  other_nok       numeric not null default 0,   -- Sum tot − betalingskolonner (Vipps)
  imported_at     timestamptz not null default now(),
  imported_by     uuid
);

create index if not exists fixit_settlements_date_idx on fixit_settlements (settle_date);

alter table fixit_settlements enable row level security;

drop policy if exists fixit_settlements_admin_all on fixit_settlements;
create policy fixit_settlements_admin_all on fixit_settlements
  for all using (is_admin()) with check (is_admin());

drop policy if exists fixit_settlements_revisor_les on fixit_settlements;
create policy fixit_settlements_revisor_les on fixit_settlements
  for select using (is_admin_or_revisor());

notify pgrst, 'reload schema';

-- Sjekk
select count(*) as fixit_oppgjor, min(settle_date) as fra, max(settle_date) as til
  from fixit_settlements;
