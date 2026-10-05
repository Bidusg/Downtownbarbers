-- =====================================================================
-- MARKEDSFØRING: KØBASERT UTSENDING (idempotent)
--   Før: alle e-poster ble sendt synkront i én forespørsel, maks 500 stk,
--   og mottakerlista var i praksis kappet på 1000 (PostgREST). Nå legges
--   alle mottakerne i en kø med én gang (skjermen svarer umiddelbart), og
--   en bakgrunnsjobb sender i bolker (Resend batch-API, 100 per kall) til
--   køen er tom. Fremdrift vises i admin.
-- =====================================================================

alter table marketing_sends add column if not exists status text not null default 'done';
alter table marketing_sends add column if not exists total int not null default 0;
alter table marketing_sends add column if not exists failed int not null default 0;
alter table marketing_sends add column if not exists finished_at timestamptz;
alter table marketing_sends add column if not exists last_error text;

create table if not exists marketing_queue (
  id          bigserial primary key,
  send_id     uuid not null references marketing_sends(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  email       text,
  phone       text,
  token       uuid,
  status      text not null default 'queued' check (status in ('queued','sent','failed')),
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists marketing_queue_send_status_idx on marketing_queue (send_id, status, id);

alter table marketing_queue enable row level security;
drop policy if exists marketing_queue_admin_all on marketing_queue;
create policy marketing_queue_admin_all on marketing_queue
  for all using (is_admin()) with check (is_admin());

-- Gamle utsendinger: marker som ferdige med riktig total.
update marketing_sends set total = recipient_count where total = 0 and status = 'done';
