-- =====================================================================
-- 0052 — EIER-ROLLE (RLS) + SHOP-INNSTILLINGER (FEATURE-FLAGS)
--
--   Forutsetter 0051 (enum-verdien 'eier' lagt til user_role).
--
--   To grunnmurs-biter for shop-en:
--
--   1) EIER-ROLLE. Dawit (eier) skal ha full tilgang overalt – som admin –
--      OG ingen shop-begrensninger/flagg skal gjelde for han. Vi lar rollen
--      'eier' telle som admin i RLS ved å utvide is_admin() og
--      is_shop_or_admin(). En egen is_owner() brukes til eier-spesifikk
--      bypass i app-laget (flagg-sjekker i kassa). Sammenligningene bruker
--      role::text slik at funksjonene lages trygt uansett om 'eier' allerede
--      er «committet» i enumet (ingen enum-coercion ved CREATE).
--
--   2) SHOP-FLAGS. Ett sted (settings-nøkkelen 'shop_flags') styrer av/på for
--      funksjoner som kan misbrukes: rabatt, familie/venne-rabatt (+ sats),
--      drop-in uten kunde, dra-for-lengde. Bygget som én gjenbrukbar
--      settings-struktur slik at nye brytere blir trivielle senere.
--      get_shop_flags() flettes alltid mot standardverdier (så manglende
--      nøkler får default), og er lesbar for innlogget kasse (security
--      definer) – settings-tabellen selv forblir admin-only.
--
--   Idempotent.
-- =====================================================================

-- --- 1) Eier teller som admin i RLS ----------------------------------
-- role::text unngår enum-coercion ved CREATE (trygt selv om 'eier' nettopp
-- er lagt til enumet i samme økt).
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'eier')
  );
$$;

create or replace function is_shop_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'shop', 'eier')
  );
$$;

-- Eier-spesifikk sjekk (brukes til bypass av shop-flagg i app-laget).
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role::text = 'eier'
  );
$$;

-- --- 2) Shop-flags i settings ----------------------------------------
-- Standardverdier valgt for å bevare dagens oppførsel: rabatt og drop-in
-- uten kunde er PÅ i dag → default true. Familie/venne-rabatt og
-- dra-for-lengde er nye → default av.
insert into settings (key, value)
values (
  'shop_flags',
  jsonb_build_object(
    'discount_enabled', true,
    'friend_family_discount_enabled', false,
    'friend_family_discount_pct', 20,
    'dropin_without_customer_enabled', true,
    'drag_for_length_enabled', false
  )
)
on conflict (key) do nothing;

-- Les shop-flags, flettet mot standard (manglende nøkler fylles). Security
-- definer + grant til authenticated slik at kassa (shop-rolle) kan lese uten
-- direkte tilgang til settings-tabellen.
create or replace function get_shop_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select
    jsonb_build_object(
      'discount_enabled', true,
      'friend_family_discount_enabled', false,
      'friend_family_discount_pct', 20,
      'dropin_without_customer_enabled', true,
      'drag_for_length_enabled', false
    )
    || coalesce((select value from settings where key = 'shop_flags'), '{}'::jsonb);
$$;
grant execute on function get_shop_flags() to authenticated;

-- Lagre shop-flags. Kun admin/eier (is_admin dekker begge). Fletter patch
-- inn i eksisterende verdi slik at delvise oppdateringer er trygge.
create or replace function set_shop_flags(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb;
begin
  if not is_admin() then
    raise exception 'Ikke tilgang';
  end if;
  insert into settings (key, value)
    values ('shop_flags', coalesce(p_patch, '{}'::jsonb))
  on conflict (key) do update
    set value = settings.value || coalesce(p_patch, '{}'::jsonb)
  returning value into v_new;
  return v_new;
end $$;
grant execute on function set_shop_flags(jsonb) to authenticated;
