-- =====================================================================
-- 0063 — NETTSIDE-CMS (etappe 1): redigerbare bilder for forsiden
--   Dawit kan legge til / bytte / omordne bilder i hero-karusellen og
--   galleriet fra admin – uten kodeendring. Tekst styres allerede av
--   site_settings (0013); dette dekker BILDENE, som til nå var hardkodet.
--
--   Bilder ligger i en OFFENTLIG 'site'-bøtte (forsiden er offentlig, så
--   den trenger vanlige public URL-er – samme mønster som 'staff-files'
--   i 0005). Metadata (seksjon, rekkefølge, aktiv, alt-tekst) i site_images.
--
--   Idempotent.
-- =====================================================================

-- Offentlig Storage-bøtte for nettside-bilder.
insert into storage.buckets (id, name, public)
values ('site', 'site', true)
on conflict (id) do nothing;

-- Kun admin kan laste opp / endre / slette; alle kan lese (offentlig forside).
drop policy if exists "site_admin_insert" on storage.objects;
create policy "site_admin_insert" on storage.objects
  for insert with check (bucket_id = 'site' and public.is_admin());

drop policy if exists "site_admin_update" on storage.objects;
create policy "site_admin_update" on storage.objects
  for update using (bucket_id = 'site' and public.is_admin())
  with check (bucket_id = 'site' and public.is_admin());

drop policy if exists "site_admin_delete" on storage.objects;
create policy "site_admin_delete" on storage.objects
  for delete using (bucket_id = 'site' and public.is_admin());

drop policy if exists "site_public_read" on storage.objects;
create policy "site_public_read" on storage.objects
  for select using (bucket_id = 'site');

-- Metadata for forsidens bilder.
create table if not exists site_images (
  id          uuid primary key default gen_random_uuid(),
  section     text not null check (section in ('hero', 'gallery')),
  kind        text not null check (kind in ('image', 'video')) default 'image',
  path        text not null,                 -- sti i 'site'-bøtta
  alt         text,                          -- alt-tekst (galleri)
  sort_order  int not null default 0,        -- rekkefølge i seksjonen (lav = først)
  active      boolean not null default true, -- inaktive vises kun i forhåndsvisning
  created_at  timestamptz not null default now()
);

create index if not exists site_images_section_order_idx
  on site_images (section, sort_order, created_at);

alter table site_images enable row level security;

-- Offentlig lesing (forsiden er offentlig), admin full tilgang.
drop policy if exists site_images_read on site_images;
create policy site_images_read on site_images
  for select using (true);

drop policy if exists site_images_admin_all on site_images;
create policy site_images_admin_all on site_images
  for all using (is_admin()) with check (is_admin());
