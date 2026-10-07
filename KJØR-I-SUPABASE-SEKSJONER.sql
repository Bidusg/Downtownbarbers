-- =====================================================================
-- KJØR-I-SUPABASE-SEKSJONER.sql
--   Av/på per seksjon på forsiden. Admin kan skru av en seksjon, og da
--   forsvinner den fra forsiden OG fra navbar. Mangler en rad → seksjonen
--   vises (standard på). Speiler RLS fra site_craft (0064): alle kan lese,
--   kun admin/eier kan skrive. Idempotent.
-- =====================================================================

create table if not exists site_section_flags (
  key        text primary key,
  visible    boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table site_section_flags enable row level security;

drop policy if exists site_section_flags_read on site_section_flags;
create policy site_section_flags_read on site_section_flags
  for select using (true);

drop policy if exists site_section_flags_admin_all on site_section_flags;
create policy site_section_flags_admin_all on site_section_flags
  for all using (is_admin()) with check (is_admin());
