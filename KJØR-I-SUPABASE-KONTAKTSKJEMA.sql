-- =====================================================================
-- Kontaktskjema på nettsiden («Send oss en melding»)
--
-- Meldinger fra skjemaet lagres her og vises i admin → Henvendelser.
-- Salongen får også en e-post (samme mottaker som booking-varslingen).
-- Bare admin/eier kan lese meldingene. Nettsiden lagrer via serveren,
-- så anonyme har ingen tilgang til tabellen.
--
-- Trygt å kjøre flere ganger.
-- =====================================================================

create table if not exists contact_messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text,
  phone       text,
  topic       text not null default 'sporsmal',
  message     text not null,
  callback    boolean not null default false,
  lang        text,
  ip_hash     text,
  status      text not null default 'ny',
  handled_at  timestamptz,
  handled_by  uuid
);

do $$ begin
  alter table contact_messages
    add constraint contact_messages_status_check check (status in ('ny', 'behandlet'));
exception when duplicate_object then null; end $$;

create index if not exists contact_messages_created_idx on contact_messages (created_at desc);
create index if not exists contact_messages_ip_idx on contact_messages (ip_hash, created_at desc);

alter table contact_messages enable row level security;

drop policy if exists contact_messages_admin on contact_messages;
create policy contact_messages_admin on contact_messages
  for all to authenticated
  using (is_admin()) with check (is_admin());

revoke all on contact_messages from anon;

notify pgrst, 'reload schema';
