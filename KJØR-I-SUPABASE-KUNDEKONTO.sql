-- =====================================================================
-- Kundekonto: innlogging med engangskode + varig innlogging
--
-- 1) SIKKERHET: portal_token_for_email var åpen for alle (anon). Med den
--    kunne hvem som helst som kjente en kundes e-post hente lenken til
--    kundens Min side. Nå kan bare serveren (service-role) bruke den.
-- 2) Ny tabell for engangskoder (6 siffer, gyldig 10 min, maks 5 forsøk).
--    Bare serveren leser/skriver den – ingen tilgang fra nettleseren.
--
-- Kundene får IKKE egne brukere i Supabase Auth. Innloggingen er en sikker
-- informasjonskapsel på kundens enhet, så kasse-/admin-funksjonene er ikke
-- tilgjengelige for kunder.
-- Krever SUPABASE_SERVICE_ROLE_KEY i Vercel. Trygt å kjøre flere ganger.
-- =====================================================================

revoke execute on function portal_token_for_email(text) from public, anon, authenticated;
grant execute on function portal_token_for_email(text) to service_role;

create table if not exists customer_login_codes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists customer_login_codes_customer_idx
  on customer_login_codes (customer_id, created_at desc);

alter table customer_login_codes enable row level security;
-- Ingen policyer: kun service-role (serveren) kommer til.
revoke all on customer_login_codes from anon, authenticated;

-- Rydd gamle koder (kalles av serveren innimellom).
create or replace function purge_customer_login_codes()
returns void language sql security definer set search_path = public as $$
  delete from customer_login_codes where created_at < now() - interval '2 days';
$$;
revoke execute on function purge_customer_login_codes() from public, anon, authenticated;
grant execute on function purge_customer_login_codes() to service_role;

notify pgrst, 'reload schema';
