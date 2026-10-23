-- =====================================================================
-- Bilder av arbeidet (portefølje) per barber
--
-- Admin laster opp bilder av klipp under Ansatte → «Bilder av arbeidet».
-- Bildene vises:
--   • i e-poster der barberen er fremhevet («Ny barber») – 4 bilder i
--     rutenett + knapp til hele galleriet,
--   • på en egen side per barber (/barbere/<navn>) med sveipbar karusell.
-- Bildene er offentlige (som profilbildene). Kun admin kan endre.
-- Trygt å kjøre flere ganger.
-- =====================================================================

create table if not exists staff_portfolio (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  image_url   text not null,
  caption     text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists staff_portfolio_staff_idx on staff_portfolio (staff_id, sort_order);

alter table staff_portfolio enable row level security;

drop policy if exists staff_portfolio_public_read on staff_portfolio;
create policy staff_portfolio_public_read on staff_portfolio
  for select using (true);

drop policy if exists staff_portfolio_admin_all on staff_portfolio;
create policy staff_portfolio_admin_all on staff_portfolio
  for all using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';
