-- =====================================================================
-- UTSENDING-VERN: hindrer dobbeltsending i markedsføringskøen.
--
--  * marketing_queue får statusene 'sending' (hentet av en arbeider) og
--    'skipped' (hoppet over, f.eks. kunden har trukket samtykket).
--  * claimed_at settes når en rad hentes. Rader som har stått i 'sending'
--    i over 10 minutter (arbeideren døde) hentes på nytt.
--  * claim_marketing_batch(p_send_id, p_limit) henter og låser neste bolk
--    atomisk (for update skip locked), så to arbeidere aldri får samme rad.
--
-- Idempotent. Koden faller tilbake til gammel logikk hvis denne ikke er kjørt.
-- =====================================================================

alter table marketing_queue add column if not exists claimed_at timestamptz;

-- Utvid status-sjekken (navnet er auto-generert, så finn alle sjekker på status-kolonnen).
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'marketing_queue'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table marketing_queue drop constraint %I', c.conname);
  end loop;
  alter table marketing_queue
    add constraint marketing_queue_status_check
    check (status in ('queued','sending','sent','failed','skipped'));
end $$;

create index if not exists marketing_queue_claim_idx
  on marketing_queue (send_id, status, id);

create or replace function claim_marketing_batch(p_send_id uuid, p_limit int default 100)
returns setof marketing_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select q.id
    from marketing_queue q
    where q.send_id = p_send_id
      and (
        q.status = 'queued'
        or (q.status = 'sending' and q.claimed_at < now() - interval '10 minutes')
      )
    order by q.id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  )
  update marketing_queue m
     set status = 'sending', claimed_at = now()
    from picked
   where m.id = picked.id
  returning m.*;
end $$;

revoke execute on function claim_marketing_batch(uuid, int) from public, anon, authenticated;
grant execute on function claim_marketing_batch(uuid, int) to service_role;

notify pgrst, 'reload schema';
