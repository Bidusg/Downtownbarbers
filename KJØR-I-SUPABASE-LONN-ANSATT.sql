-- =====================================================================
-- KJØR-I-SUPABASE-LONN-ANSATT.sql  (idempotent)
--
-- Lønnsside PER ANSATT under Revisor (modellert etter Timma + Fixit-slipp).
-- Gir revisor/eier/admin mulighet til å se og justere all lønnsinfo per
-- ansatt og per periode (måned), med live beregning i appen.
--
--   1) salary_settings     – lønnsinnstillinger PER ANSATT (satser, hvilke
--                            tillegg/provisjoner er på, prosenter, terskler).
--                            Fornuftige STANDARDVERDIER slik at en ansatt
--                            UTEN lagret rad får defaults i appen.
--   2) salary_period       – periode-input per ansatt/måned: timer for
--                            kveld/lørdag/søndag/sykefravær/ferie.
--   3) salary_period_lines – manuelle trekk/tillegg per ansatt/måned
--                            (f.eks. «tilbakebetaling lån» −2000,
--                            «forskudd lønn» −2000). Negativt = trekk.
--   4) monthly_revenue_split_by_staff(år, mnd) – tjeneste- vs. varesalg
--                            (inkl. mva) per ansatt, for split-provisjon.
--                            Samme rolle-gate som monthly_gross_by_staff.
--
-- RLS: kun admin/eier/revisor (is_admin_or_revisor()). Følger samme mønster
-- som resten av prosjektet (is_admin(), monthly_gross_by_staff).
-- =====================================================================

-- --- 0) Rolle-helper (admin/eier/revisor) ----------------------------
create or replace function is_admin_or_revisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'eier', 'revisor')
  );
$$;

-- --- 1) Lønnsinnstillinger per ansatt --------------------------------
create table if not exists salary_settings (
  staff_id                  uuid primary key references staff(id) on delete cascade,
  -- Fastlønn: null → bruk staff.base_salary_nok (ellers app-standard).
  base_salary_override_nok  numeric,
  -- Provisjonsmodell: 'terskel' = dagens bekreftede modell (40 % over 72 000
  -- eks. mva). 'split' = Timma-stil (egen sats for tjeneste/vare/markedsplass).
  commission_model          text    not null default 'terskel'
                              check (commission_model in ('terskel', 'split')),
  commission_rate           numeric not null default 0.40,
  commission_threshold_nok  numeric not null default 72000,
  commission_ex_vat         boolean not null default true,
  -- Split-modell (kun når commission_model = 'split')
  service_rate              numeric not null default 0.40,
  product_rate              numeric not null default 0.10,
  marketplace_rate          numeric not null default 0.40,
  enable_marketplace        boolean not null default false,
  -- Bonus / tillegg (timebasert; timer legges inn i salary_period)
  enable_evening            boolean not null default false,
  evening_from              time    not null default '19:00',
  evening_rate_nok          numeric not null default 45,
  enable_saturday           boolean not null default false,
  saturday_from             time    not null default '15:00',
  saturday_rate_nok         numeric not null default 45,
  enable_sunday             boolean not null default false,
  sunday_rate_nok           numeric not null default 45,
  -- Lønninger (Timma-kortet): feriebonus/ferielønn/sykefravær
  enable_vacation_pay       boolean not null default false,
  vacation_pay_rate         numeric not null default 0.12,
  enable_holiday_bonus      boolean not null default false,
  holiday_bonus_nok         numeric not null default 0,
  enable_sick_pay           boolean not null default false,
  sick_rate_nok             numeric not null default 0,
  updated_at                timestamptz not null default now(),
  updated_by                uuid
);

alter table salary_settings enable row level security;
drop policy if exists salary_settings_rw on salary_settings;
create policy salary_settings_rw on salary_settings
  for all using (is_admin_or_revisor()) with check (is_admin_or_revisor());

-- --- 2) Periode-input (timer) per ansatt/måned -----------------------
create table if not exists salary_period (
  staff_id        uuid not null references staff(id) on delete cascade,
  period          text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),  -- YYYY-MM
  evening_hours   numeric not null default 0,
  saturday_hours  numeric not null default 0,
  sunday_hours    numeric not null default 0,
  sick_hours      numeric not null default 0,
  vacation_hours  numeric not null default 0,
  note            text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  primary key (staff_id, period)
);

alter table salary_period enable row level security;
drop policy if exists salary_period_rw on salary_period;
create policy salary_period_rw on salary_period
  for all using (is_admin_or_revisor()) with check (is_admin_or_revisor());

-- --- 3) Manuelle trekk/tillegg per ansatt/måned ----------------------
create table if not exists salary_period_lines (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  period      text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),  -- YYYY-MM
  label       text not null,
  amount_nok  numeric not null,  -- negativt = trekk, positivt = tillegg
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid
);
create index if not exists salary_period_lines_staff_period_idx
  on salary_period_lines (staff_id, period);

alter table salary_period_lines enable row level security;
drop policy if exists salary_period_lines_rw on salary_period_lines;
create policy salary_period_lines_rw on salary_period_lines
  for all using (is_admin_or_revisor()) with check (is_admin_or_revisor());

-- --- 4) Tjeneste- vs. varesalg (inkl. mva) per ansatt ----------------
-- Revisor har ikke direkte lesetilgang til sales/sale_items; hentes via
-- SECURITY DEFINER-rutine med samme rolle-gate som monthly_gross_by_staff.
-- price_nok antas inkl. mva (samme forutsetning som sales.total_nok). Kun
-- tjenestelinjer finnes i dag; varesalg blir 0 inntil varelinjer føres.
create or replace function monthly_revenue_split_by_staff(p_year int, p_month int)
returns table (staff_id uuid, service_nok numeric, product_nok numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select role::text from profiles where id = auth.uid())
       not in ('admin', 'eier', 'revisor') then
    raise exception 'Kun admin/eier/revisor har tilgang.';
  end if;
  return query
    select s.staff_id,
           coalesce(sum(i.price_nok) filter (where i.kind <> 'product'), 0)::numeric,
           coalesce(sum(i.price_nok) filter (where i.kind =  'product'), 0)::numeric
      from sale_items i
      join sales s on s.id = i.sale_id
     where s.staff_id is not null
       and s.sold_at >= make_date(p_year, p_month, 1)
       and s.sold_at <  (make_date(p_year, p_month, 1) + interval '1 month')
     group by s.staff_id;
end $$;
grant execute on function monthly_revenue_split_by_staff(int, int) to authenticated;
