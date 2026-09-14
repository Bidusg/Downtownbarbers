-- =====================================================================
-- 0023 – MARKEDSFØRING (DM), samtykke-først
--   E-post-/SMS-markedsføring krever forhåndssamtykke (markedsføringsloven
--   §15). Vi lagrer samtykke per kunde, sender bare til de som har sagt ja,
--   og hver utsending har en avmeldingslenke (via portal_token fra 0022).
-- Idempotent.
-- =====================================================================

alter table customers add column if not exists marketing_consent boolean not null default false;
alter table customers add column if not exists marketing_consent_at timestamptz;

create table if not exists marketing_sends (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  body            text,
  channel         text not null default 'email',
  segment         text,
  recipient_count int not null default 0,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists marketing_sends_created_idx on marketing_sends (created_at desc);

alter table marketing_sends enable row level security;
drop policy if exists marketing_sends_admin_all on marketing_sends;
create policy marketing_sends_admin_all on marketing_sends
  for all using (is_admin()) with check (is_admin());

-- Avmelding via portal_token (offentlig, security definer). Slår av samtykke.
create or replace function marketing_unsubscribe(p_token uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  update customers
     set marketing_consent = false, marketing_consent_at = now()
   where portal_token = p_token
   returning full_name into v_name;
  return v_name;
end $$;
grant execute on function marketing_unsubscribe(uuid) to anon, authenticated;
