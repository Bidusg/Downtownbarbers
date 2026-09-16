-- =====================================================================
-- 0032 – DRIFTSMELDINGER / INTERNE VARSLER
--   Interne beskjeder som vises som banner i admin-/kasse-/ansatt-
--   panelene. Meldinger kan være interne, så lesing er begrenset til
--   innloggede med butikk- eller admin-rolle (is_shop_or_admin()).
--   Kun admin kan opprette, endre og slette.
-- Idempotent.
-- =====================================================================

create table if not exists notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  level       text not null default 'info',      -- 'info' | 'warning' | 'critical'
  audience    text not null default 'all',       -- 'all' | 'admin' | 'shop' | 'ansatt'
  active      boolean not null default true,
  starts_at   timestamptz,                        -- null = fra nå
  ends_at     timestamptz,                        -- null = uten slutt
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists notices_active_audience_idx on notices (active, audience);

alter table notices enable row level security;

-- Admin har full tilgang.
drop policy if exists notices_admin_all on notices;
create policy notices_admin_all on notices
  for all using (is_admin()) with check (is_admin());

-- Lesing per rolle: hver rolle ser sine egne meldinger + 'all'. Admin ser
-- alt. Admin-interne meldinger lekker ALDRI til andre roller (aldri
-- using(true) – meldinger kan være interne). NB: ansatt-rollen heter 'staff'
-- i user_role-enumet, mens audience-verdien er 'ansatt'.
drop policy if exists notices_shop_read on notices;
drop policy if exists notices_role_read on notices;
create policy notices_role_read on notices
  for select using (
    is_admin()
    or (current_role_name() = 'shop'  and audience in ('all', 'shop'))
    or (current_role_name() = 'staff' and audience in ('all', 'ansatt'))
  );
