-- =====================================================================
-- 0036 – Admin behandler fravaerssøknader (leave_requests, 0035)
--   Én SECURITY DEFINER-RPC som lar admin godkjenne/avslå en søknad.
--   Ved godkjenning opprettes et faktisk fravær (absences) for perioden,
--   slik at det slår inn i turnus/booking. Alt idempotent.
--   Ingen RLS løsnes: RPC-en er is_admin()-gatet.
-- =====================================================================

create or replace function decide_leave_request(
  p_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r leave_requests;
begin
  if not is_admin() then
    raise exception 'Kun admin kan behandle søknader.';
  end if;

  select * into r from leave_requests where id = p_id for update;
  if not found then
    raise exception 'Søknaden finnes ikke.';
  end if;
  if r.status <> 'pending' then
    raise exception 'Søknaden er allerede behandlet.';
  end if;

  update leave_requests
     set status      = case when p_approve then 'approved' else 'declined' end,
         decided_by  = auth.uid(),
         decided_at  = now()
   where id = p_id;

  -- Godkjent søknad blir et registrert fravær (slår inn i turnus/booking).
  if p_approve then
    insert into absences (staff_id, from_date, to_date, reason)
    values (
      r.staff_id,
      r.from_date,
      r.to_date,
      coalesce(nullif(trim(r.note), ''), initcap(r.kind))
    );
  end if;
end $$;
grant execute on function decide_leave_request(uuid, boolean) to authenticated;
