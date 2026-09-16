-- =====================================================================
-- 0034 – KUNDEKLUBB: automatiske medlemsnivåer (Bronse/Sølv/Gull)
--   Nivået UTLEDES av hvor mye/ofte kunden har handlet — ingen poeng,
--   ingen betaling, ingen manuell tildeling. Terskler er konfigurerbare
--   av admin (livstidsforbruk i kr og antall fullførte besøk).
--
--   Grunnlag (gjenbruker eksisterende mønster fra analytics/portalen):
--     • forbruk  = sum(sales.total_nok)         for kundens customer_id
--     • besøk    = antall bookings status='completed'  for kunden
--
--   NIVÅ-REGEL: kunden får det HØYESTE nivået der
--       spend >= min_spend  ELLER  visits >= min_visits.
--   (Bronse har 0/0 og kvalifiserer alltid, så et nivå finnes alltid.)
-- Idempotent.
-- =====================================================================

-- ---------- Tabell: konfigurerbare nivåer ----------
create table if not exists membership_tiers (
  id         smallint primary key,           -- 1=Bronse, 2=Sølv, 3=Gull (høyere = bedre)
  name       text not null,
  min_spend  numeric not null default 0,      -- livstidsforbruk i kr for å nå nivået
  min_visits int not null default 0,          -- antall fullførte besøk for å nå nivået
  benefit    text,                            -- fritekst medlemsgode for nivået
  color      text                             -- valgfri hex til merket (f.eks. #CD7F32)
);

-- Seed tre standardnivåer. on conflict do nothing => trygg reseed / beholder
-- admin sine justerte terskler ved ny kjøring.
insert into membership_tiers (id, name, min_spend, min_visits, benefit, color) values
  (1, 'Bronse', 0,    0,  'Medlem i kundeklubben — samler forbruk og besøk automatisk.',      '#CD7F32'),
  (2, 'Sølv',   3000, 5,  '10% på produkter i butikken.',                                     '#C0C0C0'),
  (3, 'Gull',   8000, 12, '15% på produkter + prioritert booking i høysesong.',               '#E6B325')
on conflict (id) do nothing;

-- ---------- RLS: terskler/navn/goder er ikke sensitivt, men kun admin skriver ----------
alter table membership_tiers enable row level security;

drop policy if exists membership_tiers_admin_all on membership_tiers;
create policy membership_tiers_admin_all on membership_tiers
  for all using (is_admin()) with check (is_admin());

-- Lesing greit for innloggede (admin/shop/ansatt). Anonyme «min side»-besøkende
-- trenger ikke direkte lesetilgang — de går via security-definer-funksjonen under.
drop policy if exists membership_tiers_read on membership_tiers;
create policy membership_tiers_read on membership_tiers
  for select to authenticated using (true);

-- ---------- Nivå-utledning for ÉN kunde (security definer) ----------
-- Returnerer kundens oppnådde nivå + grunnlaget (forbruk/besøk) og hva som
-- kreves for neste nivå. Tar én kunde-id og returnerer KUN aggregat for den
-- kunden (ingen PII, ingen andre kunders data), så den kan grantes til anon
-- for den token-baserte «min side».
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
  -- Grunnlag: livstidsforbruk (inkl. mva) og antall fullførte besøk.
  select coalesce(sum(total_nok), 0) into v_spend
    from sales where customer_id = p_customer;
  select count(*) into v_visits
    from bookings where customer_id = p_customer and status = 'completed';

  -- HØYESTE nivå der spend >= min_spend ELLER visits >= min_visits.
  select * into v_tier
    from membership_tiers
   where v_spend >= min_spend or v_visits >= min_visits
   order by id desc
   limit 1;

  -- Sikkerhetsnett: hvis ingen terskel matcher (bør ikke skje pga Bronse 0/0),
  -- fall tilbake til laveste definerte nivå.
  if v_tier.id is null then
    select * into v_tier from membership_tiers order by id asc limit 1;
  end if;

  -- Neste nivå = laveste nivå med høyere id enn det oppnådde (null om toppnivå).
  select * into v_next
    from membership_tiers
   where id > v_tier.id
   order by id asc
   limit 1;

  return query select
    v_tier.id, v_tier.name, v_tier.benefit, v_tier.color,
    v_spend, coalesce(v_visits, 0),
    v_next.name, v_next.min_spend, v_next.min_visits;
end $$;

-- Kun authenticated: eneste direkte kaller er kundekortet (innlogget admin).
-- Anonyme «min side»-besøkende går utelukkende via _by_token-wrapperen under,
-- så vi unngår at hvem som helst kan slå opp aggregat på en vilkårlig kunde-id.
grant execute on function customer_membership(uuid) to authenticated;

-- ---------- Token-basert oppslag for «min side» ----------
-- «Min side» kjenner bare portal_token (ikke kunde-id). Denne wrapperen slår
-- opp kundens egen id fra tokenet og returnerer samme aggregat, slik at siden
-- aldri trenger å håndtere en rå kunde-id på klienten.
create or replace function customer_membership_by_token(p_token uuid)
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
declare v_id uuid;
begin
  select id into v_id from customers where portal_token = p_token limit 1;
  if v_id is null then
    return;
  end if;
  return query select * from customer_membership(v_id);
end $$;

grant execute on function customer_membership_by_token(uuid) to anon, authenticated;
