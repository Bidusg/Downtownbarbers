-- =====================================================================
-- NETTSIDE-INNSTILLINGER (admin styrer forsidens innhold/utseende)
--   Én rad (id=1). Offentlig lesbar; kun admin kan endre.
-- =====================================================================
create table if not exists site_settings (
  id int primary key default 1,
  name text not null default 'Downtown Barbers',
  slogan text not null default 'Der presisjon møter stil',
  established text not null default '2018',
  hero_title text not null default 'Klipp skarpt.',
  hero_italic text not null default 'Se enda skarpere ut.',
  intro text not null default 'Freshe klipper, skarpe fades og ekspert grooming – midt i hjertet av Oslo.',
  about_text text not null default 'Premium håndverk midt i Oslo sentrum. Presis, erfaren, rolig – vi tar hånd om detaljene før du rekker å spørre, i stolen som i speilet.',
  cta_title text not null default 'Klar for en skarpere fade?',
  cta_text text not null default 'Velg tjeneste, barber og tid på sekunder.',
  phone text not null default '+47 463 58 764',
  address text not null default 'Osterhaus'' gate 10, 0183 Oslo',
  email text,
  opening_hours jsonb not null default '[
    {"day":"Mandag–Fredag","hours":"09:00 – 19:00"},
    {"day":"Lørdag","hours":"09:00 – 18:00"},
    {"day":"Søndag","hours":"Stengt"}
  ]'::jsonb,
  accent_hex text not null default '#F47721',
  show_rating boolean not null default true,
  rating_value numeric(2,1) not null default 4.5,
  rating_count int not null default 6,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

insert into site_settings (id) values (1) on conflict (id) do nothing;

alter table site_settings enable row level security;

drop policy if exists site_settings_read on site_settings;
create policy site_settings_read on site_settings for select using (true);

drop policy if exists site_settings_admin_update on site_settings;
create policy site_settings_admin_update on site_settings for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
