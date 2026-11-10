-- =====================================================================
-- INNKJØPSPRIS PÅ VARER
--
-- Hva dette gjør:
--   Lager tabellen product_costs med innkjøpspris, leverandør og
--   leverandørens varenummer per vare. Brukes i produktadmin (margin) og
--   i rapportsenteret (lagerverdi, bruttofortjeneste).
--
-- Hvorfor egen tabell: «products» kan leses av nettbutikken (anon).
--   Innkjøpsprisen skal IKKE være synlig for kunder, kasse eller anon.
--   Derfor ligger den her, med RLS:
--     - select:  admin, eier og revisor (is_admin_or_revisor())
--     - insert/update/delete: kun admin og eier (is_admin())
--     - ingen tilgang for anon / shop / ansatte / kunder.
--
-- cost_nok = innkjøpspris per enhet EKS. mva (i motsetning til
--   products.price_nok, som er utsalgspris INKL. 25 % mva).
--
-- Krav: tabellen products finnes (KJØR-I-SUPABASE.sql), og rolle-hjelperne
--   is_admin() og is_admin_or_revisor() finnes (KJØR-I-SUPABASE-REVISOR-TILGANG.sql).
-- Trygt å kjøre flere ganger.
-- =====================================================================

-- Vakt: rolle-helperne må finnes fra før (vi redefinerer dem ikke her).
do $$
begin
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.is_admin_or_revisor()') is null then
    raise exception 'Funksjonen is_admin() eller is_admin_or_revisor() mangler. Kjør KJØR-I-SUPABASE-REVISOR-TILGANG.sql først.';
  end if;
end $$;

create table if not exists product_costs (
  product_id   uuid primary key references products(id) on delete cascade,
  cost_nok     numeric(10,2) not null check (cost_nok >= 0),  -- eks. mva, per enhet
  supplier     text,
  supplier_sku text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

comment on column product_costs.cost_nok is
  'Innkjøpspris per enhet EKS. mva (products.price_nok er INKL. 25 % mva).';

alter table product_costs enable row level security;

-- Ingen tilgang for anon (RLS uten policy = ingen rader; fjern også rettigheter).
revoke all on product_costs from anon;

drop policy if exists product_costs_select on product_costs;
create policy product_costs_select on product_costs
  for select using (is_admin_or_revisor());

drop policy if exists product_costs_insert on product_costs;
create policy product_costs_insert on product_costs
  for insert with check (is_admin());

drop policy if exists product_costs_update on product_costs;
create policy product_costs_update on product_costs
  for update using (is_admin()) with check (is_admin());

drop policy if exists product_costs_delete on product_costs;
create policy product_costs_delete on product_costs
  for delete using (is_admin());

grant select, insert, update, delete on product_costs to authenticated;

notify pgrst, 'reload schema';

-- Kontroll: skal vise tabellen, RLS = true og 4 policyer.
select
  to_regclass('public.product_costs') is not null as tabell_finnes,
  (select relrowsecurity from pg_class where oid = 'public.product_costs'::regclass) as rls_pa,
  (select count(*) from pg_policies where tablename = 'product_costs') as antall_policyer;
