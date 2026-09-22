-- =====================================================================
-- 0064 — NETTSIDE-CMS (etappe 2): «Håndverket»-blokkene redigerbare
--   Forsidens Håndverket-seksjon var tre hardkodede blokker (bilde + tittel
--   + tekst). Nå styres de fra admin – legg til, rediger tekst, omordne,
--   skjul/slett. Bruker samme offentlige 'site'-bøtte som 0063 (bilder under
--   craft/-prefiks).
--   Idempotent.
-- =====================================================================

create table if not exists site_craft (
  id          uuid primary key default gen_random_uuid(),
  image_path  text not null,                  -- sti i 'site'-bøtta
  title       text not null default '',
  body        text,
  sort_order  int not null default 0,         -- rekkefølge (lav = først)
  active      boolean not null default true,  -- inaktive vises kun i forhåndsvisning
  created_at  timestamptz not null default now()
);

create index if not exists site_craft_order_idx
  on site_craft (sort_order, created_at);

alter table site_craft enable row level security;

-- Offentlig lesing (forsiden er offentlig), admin full tilgang.
drop policy if exists site_craft_read on site_craft;
create policy site_craft_read on site_craft
  for select using (true);

drop policy if exists site_craft_admin_all on site_craft;
create policy site_craft_admin_all on site_craft
  for all using (is_admin()) with check (is_admin());
