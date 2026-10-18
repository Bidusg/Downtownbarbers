-- =====================================================================
-- SMS-logg: hver SMS systemet prøver å sende (bekreftelse, påminnelse,
-- test, markedsføring) lagres her med status, så admin kan se at kundene
-- faktisk får SMS. Vises i admin → Integrasjoner → «SMS-logg».
-- Skrives kun av serveren (service-rollen). Kun admin/eier kan lese.
-- Trygt å kjøre flere ganger.
-- =====================================================================

create table if not exists sms_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  to_number   text,
  kind        text not null default 'annet',   -- bekreftelse | påminnelse | test | markedsføring | annet
  body        text,
  status      text not null,                   -- sendt | feilet | hoppet over
  error       text,
  booking_id  uuid references bookings(id) on delete set null
);

create index if not exists sms_log_created_idx on sms_log (created_at desc);

alter table sms_log enable row level security;

drop policy if exists sms_log_admin_read on sms_log;
create policy sms_log_admin_read on sms_log
  for select using (is_admin());

notify pgrst, 'reload schema';
