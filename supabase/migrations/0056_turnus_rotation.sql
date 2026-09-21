-- =====================================================================
-- 0056 — GENERELL UKE-ROTASJON (A/B/C/D… med valgfritt antall uker)
--
--   Generaliserer A/B-turnusen til et rotasjonsmønster med N uker. Mønsteret
--   defineres én gang (antall uker + en anker-mandag der uke 1 starter);
--   systemet regner ut hvilken uke-indeks (1..N) som gjelder for enhver dato,
--   framover i tid – uten årsskifte-glitch (teller uker fra ankeret, ikke
--   ISO-ukenummer).
--
--   staff_hours.week_parity brukes uendret: 0 = hver uke, 1..N = uke-indeks.
--   available_slots er uendret (bruker turnus_week_parity + week_parity in
--   (0, v_parity), som funker for enhver N).
--
--   Bakoverkompatibelt: seeder rotasjons-config med N=2 og en anker-mandag som
--   REPRODUSERER dagens A/B (utledet fra den eksisterende turnus_anchor), så
--   ingen eksisterende vakter forskyves. Idempotent.
-- =====================================================================

-- Seed rotasjons-config. Bruker den EKSISTERENDE (0025) turnus_week_parity til
-- å finne en anker-mandag som er «uke A» i dag, slik at N=2 gir nøyaktig samme
-- A/B som før. (Kjøres før funksjonen redefineres nedenfor.)
insert into settings (key, value)
select
  'turnus_rotation',
  jsonb_build_object(
    'weeks', 2,
    'anchor', to_char(
      case
        when turnus_week_parity(date_trunc('week', current_date)::date) = 1
          then date_trunc('week', current_date)::date
        else date_trunc('week', current_date)::date - 7
      end,
      'YYYY-MM-DD'
    )
  )
on conflict (key) do nothing;

-- Generalisert uke-indeks (1..N) for en dato. Teller hele uker fra
-- anker-mandagen; faller tilbake til den gamle A/B-logikken hvis config mangler.
create or replace function turnus_week_parity(p_date date)
returns int
language sql stable security definer set search_path = public as $$
  with cfg as (
    select
      coalesce((value->>'weeks')::int, 2) as n,
      (value->>'anchor')::date as anchor
    from settings where key = 'turnus_rotation'
  ),
  legacy as (
    select coalesce((value->>'a_is_even')::boolean, true) as a_is_even
    from settings where key = 'turnus_anchor'
  )
  select case
    when (select anchor from cfg) is not null and coalesce((select n from cfg), 2) >= 1 then
      (
        (
          ( floor(
              (date_trunc('week', p_date)::date - (select anchor from cfg))::numeric / 7
            )::int
            % (select n from cfg)
          ) + (select n from cfg)
        ) % (select n from cfg)
      ) + 1
    else
      case
        when extract(week from p_date)::int % 2 = 0
          then case when (select a_is_even from legacy) then 1 else 2 end
        else case when (select a_is_even from legacy) then 2 else 1 end
      end
  end;
$$;
grant execute on function turnus_week_parity(date) to anon, authenticated;
