-- =====================================================================
-- 0028 — Avvik/fravær per dato (overstyrer turnusen)
--   Turnusen (0025) er en fast ukemal. I virkeligheten trengs unntak for
--   enkeltdatoer: en barber er syk/på ferie, tar fri deler av dagen, eller
--   jobber en ekstravakt utenom sin vanlige turnus. Denne tabellen holder
--   slike avvik per barber per dato, og available_slots tar hensyn til dem.
--
--   kind:
--     'off'   = fravær. start_time/end_time NULL → HELE dagen fri.
--               Satt → fri kun i den perioden (f.eks. tannlege 13–15).
--     'extra' = ekstravakt. start_time/end_time må være satt → åpner booking
--               i den perioden selv om barberen normalt ikke jobber da.
--   Alt klippes uansett mot salongens åpningstider (0026): stengt dag =
--   stengt for alle, også ekstravakter.
-- Idempotent.
-- =====================================================================

create table if not exists staff_exceptions (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  date        date not null,
  kind        text not null default 'off',   -- 'off' | 'extra'
  start_time  time,                            -- NULL (for 'off') = hele dagen
  end_time    time,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists staff_exceptions_lookup_idx
  on staff_exceptions (staff_id, date);

alter table staff_exceptions enable row level security;
drop policy if exists staff_exceptions_admin_all on staff_exceptions;
create policy staff_exceptions_admin_all on staff_exceptions
  for all using (is_admin()) with check (is_admin());
drop policy if exists staff_exceptions_shop_read on staff_exceptions;
create policy staff_exceptions_shop_read on staff_exceptions
  for select using (is_shop_or_admin());

-- available_slots: salong-åpningstid ∩ turnus, med avvik per dato.
--   1) Stengt salongdag → ingen tider.
--   2) Heldags fravær → ingen tider.
--   3) Per 15-min slot: må være innenfor turnus (eller ekstravakt denne
--      datoen), og ikke overlappe et delvis fravær; ikke opptatt/fortid.
create or replace function available_slots(
  p_barber text, p_service text, p_date date
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid; v_dur int;
  v_step interval := '15 minutes';
  v_dow int; v_parity int; v_has_turnus boolean;
  v_open time; v_close time;
  v_full_off boolean;
  slot time; slot_end_t time;
  slot_start timestamptz; slot_end timestamptz;
  in_work boolean;
  res text[] := '{}';
begin
  select id into v_staff from staff where full_name = p_barber and active limit 1;
  if v_staff is null then return res; end if;
  select duration_min into v_dur from services where name = p_service limit 1;
  v_dur := coalesce(v_dur, 30);

  v_dow := extract(dow from p_date);

  -- 1) Salongens åpningstid (0026). Stengt → ingen tider.
  select open_t, close_t into v_open, v_close from salon_hours(v_dow);
  if v_open is null or v_close is null then return res; end if;

  -- 2) Heldags fravær denne datoen → stengt. Gjelder både et heldags-avvik
  --    (staff_exceptions) OG et registrert fravær i datointervall (absences,
  --    fra /admin/fravaer). Sistnevnte blokkerte tidligere IKKE booking.
  select
    exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date
        and e.kind = 'off' and e.start_time is null
    )
    or exists (
      select 1 from absences a
      where a.staff_id = v_staff
        and p_date between a.from_date and a.to_date
    )
  into v_full_off;
  if v_full_off then return res; end if;

  v_parity := turnus_week_parity(p_date);
  select exists(select 1 from staff_hours where staff_id = v_staff) into v_has_turnus;

  slot := v_open;
  while slot + make_interval(mins => v_dur) <= v_close loop
    slot_end_t := slot + make_interval(mins => v_dur);

    -- a) Innenfor barberens turnus? (uten turnus: hele åpningstiden)
    if v_has_turnus then
      in_work := exists (
        select 1 from staff_hours h
        where h.staff_id = v_staff
          and h.weekday = v_dow
          and h.week_parity in (0, v_parity)
          and slot >= h.start_time and slot_end_t <= h.end_time
      );
    else
      in_work := true;
    end if;

    -- b) Ekstravakt kan åpne slots utenfor vanlig turnus (denne datoen).
    if not in_work then
      in_work := exists (
        select 1 from staff_exceptions e
        where e.staff_id = v_staff and e.date = p_date and e.kind = 'extra'
          and e.start_time is not null and e.end_time is not null
          and slot >= e.start_time and slot_end_t <= e.end_time
      );
    end if;

    -- c) Delvis fravær fjerner slots som overlapper fri-perioden.
    if in_work and exists (
      select 1 from staff_exceptions e
      where e.staff_id = v_staff and e.date = p_date and e.kind = 'off'
        and e.start_time is not null and e.end_time is not null
        and slot < e.end_time and slot_end_t > e.start_time
    ) then
      in_work := false;
    end if;

    if in_work then
      slot_start := (p_date + slot) at time zone 'Europe/Oslo';
      slot_end := slot_start + make_interval(mins => v_dur);
      if slot_start > now() and not exists (
        select 1 from bookings b
        where b.staff_id = v_staff
          and b.status in ('pending','confirmed','completed')
          and b.start_at < slot_end and b.end_at > slot_start
      ) then
        res := res || to_char(slot, 'HH24:MI');
      end if;
    end if;

    slot := slot + v_step;
  end loop;

  return res;
end $$;
grant execute on function available_slots(text, text, date) to anon, authenticated;
