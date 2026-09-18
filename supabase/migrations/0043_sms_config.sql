-- =====================================================================
-- 0043 – SMS-leverandørkonfig (admin-redigerbar, som review_config)
--
--   SMS-laget (src/lib/sms.ts) var kun env-styrt (SMS_PROVIDER, tokens …).
--   Denne tabellen lar admin koble til / bytte SMS-leverandør fra
--   /admin/integrasjoner uten å redigere env i Vercel – samme mønster som
--   review_config (0030): singleton, KUN admin (RLS), nøkler leses
--   server-side med service-role, aldri av besøkende. sms.ts faller
--   tilbake til env når rad/nøkkel mangler, så eksisterende oppsett virker.
--
--   Idempotent.
-- =====================================================================
create table if not exists sms_config (
  id                  int primary key default 1,
  provider            text,            -- gatewayapi | sveve | twilio | generic | '' (auto)
  sender              text,            -- avsendernavn, f.eks. "Downtown"
  gatewayapi_token    text,
  sveve_user          text,
  sveve_password      text,
  twilio_account_sid  text,
  twilio_auth_token   text,
  twilio_from         text,
  generic_api_url     text,
  generic_api_key     text,
  enabled             boolean not null default true,
  updated_at          timestamptz not null default now(),
  constraint sms_config_singleton check (id = 1)
);
insert into sms_config (id) values (1) on conflict (id) do nothing;

alter table sms_config enable row level security;
-- Kun admin. Ingen public/anon read – nøklene skal aldri kunne leses av
-- besøkende. Server-koden bruker service-role for utsending.
drop policy if exists sms_config_admin_all on sms_config;
create policy sms_config_admin_all on sms_config
  for all using (is_admin()) with check (is_admin());
