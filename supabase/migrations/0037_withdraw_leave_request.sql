-- =====================================================================
-- 0037 – Ansatt trekker tilbake egen ventende fravaerssøknad (0035).
--   SECURITY DEFINER-RPC: sletter KUN en 'pending'-søknad som tilhører
--   innlogget ansatt (via current_staff_id() fra 0035). Ingen RLS løsnes.
-- Idempotent.
-- =====================================================================

create or replace function withdraw_leave_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
begin
  v_staff := current_staff_id();
  if v_staff is null then
    raise exception 'Ingen ansattprofil er koblet til kontoen din.';
  end if;

  delete from leave_requests
   where id = p_id
     and staff_id = v_staff
     and status = 'pending';

  if not found then
    raise exception 'Fant ingen ventende søknad å trekke tilbake.';
  end if;
end $$;
grant execute on function withdraw_leave_request(uuid) to authenticated;
