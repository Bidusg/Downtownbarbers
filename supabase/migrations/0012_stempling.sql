-- =====================================================================
-- STEMPLINGSSYSTEM (vakt/pause via 4-sifret PIN på shop-skjermen)
--   - pin_hash på staff (4-sifret kode, hashet med pgcrypto)
--   - shift_events: logg av alle handlinger (start/pause/resume/end)
--   - RPC-er (SECURITY DEFINER) så delt shop-konto kan registrere
--     på vegne av valgt ansatt etter PIN-verifisering.
-- Timer regnes ut fra loggen. Forsinkelser kobles på når turnus finnes.
-- =====================================================================

create extension if not exists pgcrypto;

alter table staff add column if not exists pin_hash text;

create table if not exists shift_events (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references staff(id) on delete cascade,
  event_type text not null check (event_type in ('start','pause','resume','end')),
  created_at timestamptz not null default now(),
  note text
);
create index if not exists idx_shift_events_staff on shift_events(staff_id, created_at);

alter table shift_events enable row level security;
-- Ingen direkte tilgang; all interaksjon går via SECURITY DEFINER-RPC-ene under.

-- --- Ansatte som skal vises på stemplingsskjermen (aktive) ---
create or replace function active_staff_for_clock()
returns table (id uuid, full_name text, photo_url text, has_pin boolean)
language sql security definer set search_path = public as $$
  select id, full_name, photo_url, (pin_hash is not null)
  from staff where active order by full_name;
$$;
grant execute on function active_staff_for_clock() to anon, authenticated;

-- --- Admin setter/endrer PIN for en ansatt (4 siffer) ---
create or replace function set_staff_pin(p_staff uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN må være 4 siffer';
  end if;
  update staff set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_staff;
end $$;
grant execute on function set_staff_pin(uuid, text) to authenticated;

-- --- Nåværende status for en ansatt: 'off' | 'on' | 'paused' ---
create or replace function current_shift_status(p_staff uuid)
returns text
language sql security definer set search_path = public as $$
  select case
    when e.event_type in ('start','resume') then 'on'
    when e.event_type = 'pause' then 'paused'
    else 'off'
  end
  from shift_events e
  where e.staff_id = p_staff
    and e.created_at >= (now() at time zone 'Europe/Oslo')::date
  order by e.created_at desc
  limit 1;
$$;
grant execute on function current_shift_status(uuid) to anon, authenticated;

-- --- Verifiser PIN og returner status (for kontekstuelle knapper) ---
-- Returnerer 'off'|'on'|'paused', eller 'ERR:no_pin'|'ERR:wrong_pin'.
create or replace function verify_pin_status(p_staff uuid, p_pin text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  select pin_hash into v_hash from staff where id = p_staff and active;
  if v_hash is null then return 'ERR:no_pin'; end if;
  if crypt(p_pin, v_hash) <> v_hash then return 'ERR:wrong_pin'; end if;
  return coalesce(current_shift_status(p_staff), 'off');
end $$;
grant execute on function verify_pin_status(uuid, text) to anon, authenticated;

-- --- Registrer en handling etter PIN-verifisering ---
-- Returnerer ny status, eller feilkode-tekst med prefiks 'ERR:'.
create or replace function record_shift_event(p_staff uuid, p_pin text, p_type text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_status text;
begin
  select pin_hash into v_hash from staff where id = p_staff and active;
  if v_hash is null then return 'ERR:no_pin'; end if;
  if crypt(p_pin, v_hash) <> v_hash then return 'ERR:wrong_pin'; end if;

  v_status := coalesce(current_shift_status(p_staff), 'off');

  -- Gyldige overganger
  if p_type = 'start'  and v_status <> 'off'    then return 'ERR:already_on'; end if;
  if p_type = 'pause'  and v_status <> 'on'     then return 'ERR:not_on'; end if;
  if p_type = 'resume' and v_status <> 'paused' then return 'ERR:not_paused'; end if;
  if p_type = 'end'    and v_status  = 'off'    then return 'ERR:not_on'; end if;
  if p_type not in ('start','pause','resume','end') then return 'ERR:bad_type'; end if;

  insert into shift_events (staff_id, event_type) values (p_staff, p_type);

  return coalesce(current_shift_status(p_staff), 'off');
end $$;
grant execute on function record_shift_event(uuid, text, text) to anon, authenticated;

-- --- Dagens økter (for oversikt på shop): sum timer + status per ansatt ---
create or replace function shift_summary_today()
returns table (staff_id uuid, full_name text, status text, worked_minutes int)
language sql security definer set search_path = public as $$
  with ev as (
    select e.staff_id, e.event_type, e.created_at,
           lead(e.created_at) over (partition by e.staff_id order by e.created_at) as next_at
    from shift_events e
    where e.created_at >= (now() at time zone 'Europe/Oslo')::date
  ),
  worked as (
    select staff_id,
      sum(extract(epoch from (coalesce(next_at, now()) - created_at))/60)
        filter (where event_type in ('start','resume')) as mins
    from ev group by staff_id
  )
  select s.id, s.full_name,
         coalesce(current_shift_status(s.id),'off'),
         coalesce(round(w.mins)::int, 0)
  from staff s
  left join worked w on w.staff_id = s.id
  where s.active
  order by s.full_name;
$$;
grant execute on function shift_summary_today() to anon, authenticated;
