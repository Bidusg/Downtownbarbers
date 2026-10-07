-- =====================================================================
-- KJØR-I-SUPABASE-TEKSTER.sql
--   Overstyr hvilken som helst fast tekst på nettsiden (norsk + engelsk)
--   fra admin. Mangler en rad (eller feltet er tomt) → dagens innebygde
--   tekst brukes (fallback), så ingenting endres før eieren skriver noe.
--   Speiler RLS fra site_craft (0064): alle kan lese, kun admin/eier skriver.
--   Idempotent.
-- =====================================================================

create table if not exists site_texts (
  key        text primary key,
  no         text,
  en         text,
  updated_at timestamptz not null default now()
);

alter table site_texts enable row level security;

drop policy if exists site_texts_read on site_texts;
create policy site_texts_read on site_texts
  for select using (true);

drop policy if exists site_texts_admin_all on site_texts;
create policy site_texts_admin_all on site_texts
  for all using (is_admin()) with check (is_admin());
