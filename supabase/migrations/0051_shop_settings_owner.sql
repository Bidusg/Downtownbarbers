-- =====================================================================
-- 0051 – SHOP-INNSTILLINGER (feature-flags) + EIER-TILGANG
--
--   Foundation for «kan skrus av/på fra admin hvis misbrukt»-funksjonene:
--   rabatt, dra-for-lengde, drop-in uten kunde, familie/venne-rabatt osv.
--   Flaggene lagres som JSON i den eksisterende settings-tabellen under
--   nøkkelen 'shop_flags' (admin skriver; alle kan lese – ikke hemmelig).
--
--   Eier: profiles.is_owner. En eier (Dawit) omgår begrensningene i shop –
--   flaggene gjelder ikke for han. Settes av admin.
--
--   Idempotent. Ingen data røres utover å opprette default-raden.
-- =====================================================================

alter table profiles
  add column if not exists is_owner boolean not null default false;

-- Default-flagg (tomt objekt – koden fyller inn fornuftige standarder).
insert into settings (key, value)
  values ('shop_flags', '{}'::jsonb)
  on conflict (key) do nothing;

-- Hjelpefunksjon: er innlogget bruker eier? (til evt. RLS/RPC senere.)
create or replace function is_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and is_owner = true
  );
$$;
