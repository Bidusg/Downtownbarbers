-- =====================================================================
-- 0053 – TRIPLETEX BILAGSLOGG (duplikatsperre)
--
--   Loggfører hvilke dagsbilag som FAKTISK er postet til Tripletex, med
--   bilags-id-en Tripletex ga tilbake. Primærnøkkel på datoen gjør at samme
--   dag ikke kan postes to ganger: cron-jobben sjekker loggen før den poster,
--   og en unik dato hindrer dobbeltføring selv ved samtidig kjøring.
--
--   Kun ekte posteringer logges (ikke dry-run), så loggen aldri blokkerer en
--   dato som ennå ikke er sendt inn. Skrives av service-rollen (cron/route);
--   admin kan lese for revisjon/oversikt.
--
--   Idempotent.
-- =====================================================================

create table if not exists tripletex_voucher_log (
  voucher_date  date primary key,
  voucher_id    bigint,
  amount_gross  numeric,
  sales_count   integer,
  posted_at     timestamptz not null default now()
);

alter table tripletex_voucher_log enable row level security;

-- Service-rollen (cron) omgår RLS. Admin kan lese loggen.
drop policy if exists tripletex_voucher_log_admin_read on tripletex_voucher_log;
create policy tripletex_voucher_log_admin_read on tripletex_voucher_log
  for select using (is_admin());
