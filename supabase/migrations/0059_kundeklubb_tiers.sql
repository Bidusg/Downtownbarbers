-- =====================================================================
-- 0059 — KUNDEKLUBB: helt datadrevne nivåer (legg til / slett / omordne)
--   Forutsetter 0034 (membership_tiers + customer_membership) og 0052
--   (is_admin() dekker eier).
--
--   FØR: tre faste nivåer (id 1/2/3), admin kunne bare justere terskler.
--   NÅ:  admin kan legge til nye topp-nivåer (f.eks. Platinum), slette
--        nivåer og endre rekkefølgen — uten kodeendring. Rangen styres av
--        en egen sort_order-kolonne (høyere = bedre nivå), akkurat som
--        staff_levels (nivå-motoren fra 0053). id beholdes som stabil PK.
--
--   NIVÅ-REGEL uendret: kunden får det HØYESTE nivået (etter sort_order) der
--       spend >= min_spend  ELLER  visits >= min_visits. Finnes ingen match
--       (ingen 0/0-nivå), faller vi tilbake til det laveste definerte nivået,
--       så en kunde alltid har et nivå.
--
--   Idempotent.
-- =====================================================================

-- ---------- Rang-kolonne (sort_order) ----------
alter table membership_tiers
  add column if not exists sort_order int not null default 0;

-- Backfill: gi eksisterende nivåer en rang fra id-en sin (1/2/3 → 1/2/3),
-- slik at rekkefølgen er identisk med før. Rører bare rader som ennå ikke
-- har fått en rang (default 0), så admin sine egne omordninger bevares.
update membership_tiers set sort_order = id where sort_order = 0;

-- ---------- Nivå-utledning: ranger på sort_order i stedet for id ----------
-- Ellers byte-identisk med 0034: samme grunnlag (forbruk + fullførte besøk),
-- samme ELLER-regel, samme «neste nivå»-beregning — bare rangert på sort_order
-- så nye/omordnede nivåer havner riktig.
create or replace function customer_membership(p_customer uuid)
returns table(
  tier_id        smallint,
  tier_name      text,
  benefit        text,
  color          text,
  spend          numeric,
  visits         int,
  next_tier_name text,
  next_min_spend numeric,
  next_min_visits int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_spend  numeric;
  v_visits int;
  v_tier   membership_tiers;
  v_next   membership_tiers;
begin
  select coalesce(sum(total_nok), 0) into v_spend
    from sales where customer_id = p_customer;
  select count(*) into v_visits
    from bookings where customer_id = p_customer and status = 'completed';

  -- HØYESTE nivå (etter sort_order) der spend >= min_spend ELLER visits >= min_visits.
  select * into v_tier
    from membership_tiers
   where v_spend >= min_spend or v_visits >= min_visits
   order by sort_order desc, id desc
   limit 1;

  -- Sikkerhetsnett: ingen terskel matcher → laveste definerte nivå.
  if v_tier.id is null then
    select * into v_tier from membership_tiers order by sort_order asc, id asc limit 1;
  end if;

  -- Neste nivå = laveste nivå med høyere sort_order enn det oppnådde.
  select * into v_next
    from membership_tiers
   where sort_order > v_tier.sort_order
   order by sort_order asc, id asc
   limit 1;

  return query select
    v_tier.id, v_tier.name, v_tier.benefit, v_tier.color,
    v_spend, coalesce(v_visits, 0),
    v_next.name, v_next.min_spend, v_next.min_visits;
end $$;

grant execute on function customer_membership(uuid) to authenticated;

-- ---------- Legg til nytt nivå (atomisk id + sort_order) ----------
-- id og sort_order tildeles som max+1, så et nytt nivå blir det nye toppnivået
-- (admin kan omordne etterpå). Security definer + is_admin()-vakt: kun admin/
-- eier kan opprette. Returnerer den nye raden.
create or replace function membership_tier_add(
  p_name       text,
  p_min_spend  numeric,
  p_min_visits int,
  p_benefit    text,
  p_color      text
)
returns membership_tiers
language plpgsql security definer set search_path = public as $$
declare
  v_id    smallint;
  v_order int;
  v_row   membership_tiers;
begin
  if not is_admin() then
    raise exception 'Kun admin kan legge til nivå';
  end if;

  select coalesce(max(id), 0) + 1        into v_id    from membership_tiers;
  select coalesce(max(sort_order), 0) + 1 into v_order from membership_tiers;

  insert into membership_tiers (id, name, min_spend, min_visits, benefit, color, sort_order)
  values (
    v_id,
    coalesce(nullif(trim(p_name), ''), 'Nytt nivå'),
    greatest(coalesce(p_min_spend, 0), 0),
    greatest(coalesce(p_min_visits, 0), 0),
    nullif(trim(p_benefit), ''),
    nullif(trim(p_color), ''),
    v_order
  )
  returning * into v_row;

  return v_row;
end $$;

grant execute on function membership_tier_add(text, numeric, int, text, text) to authenticated;

-- ---------- Slett nivå (nekt hvis det er det siste) ----------
-- Det må alltid finnes minst ett nivå, ellers har ingen kunder et nivå.
create or replace function membership_tier_delete(p_id smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_admin() then
    raise exception 'Kun admin kan slette nivå';
  end if;

  select count(*) into v_count from membership_tiers;
  if v_count <= 1 then
    raise exception 'Kan ikke slette det siste nivået';
  end if;

  delete from membership_tiers where id = p_id;
end $$;

grant execute on function membership_tier_delete(smallint) to authenticated;

-- ---------- Omordne nivå (bytt rang med naboen i ønsket retning) ----------
-- p_dir: 'up' = høyere rang (bedre nivå), 'down' = lavere rang. Bytter
-- sort_order med det nærmeste nivået i den retningen. No-op om det ikke finnes
-- en nabo (allerede øverst/nederst). Ingen unik-constraint på sort_order, så
-- byttet er trygt.
create or replace function membership_tier_move(p_id smallint, p_dir text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    membership_tiers;
  v_other membership_tiers;
begin
  if not is_admin() then
    raise exception 'Kun admin kan omordne nivå';
  end if;

  select * into v_me from membership_tiers where id = p_id;
  if v_me.id is null then
    return;
  end if;

  if p_dir = 'up' then
    select * into v_other
      from membership_tiers
     where sort_order > v_me.sort_order
     order by sort_order asc, id asc
     limit 1;
  elsif p_dir = 'down' then
    select * into v_other
      from membership_tiers
     where sort_order < v_me.sort_order
     order by sort_order desc, id desc
     limit 1;
  else
    return;
  end if;

  if v_other.id is null then
    return; -- allerede ytterst
  end if;

  update membership_tiers set sort_order = v_other.sort_order where id = v_me.id;
  update membership_tiers set sort_order = v_me.sort_order    where id = v_other.id;
end $$;

grant execute on function membership_tier_move(smallint, text) to authenticated;
