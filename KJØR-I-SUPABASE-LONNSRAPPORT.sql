-- =====================================================================
-- LØNNSRAPPORT – flere lønnsdata per ansatt og måned (idempotent)
--
-- Krever KJØR-I-SUPABASE-LONN-ANSATT.sql (tabellene salary_settings og
-- salary_period). Kjøres etter den. Trygt å kjøre flere ganger.
--
-- salary_settings (per ansatt):
--   tax_percent      skattetrekk i prosent fra skattekortet (0.30 = 30 %)
--   hours_per_month  timer per måned som timesatsen regnes av (162,5)
--   account_number   kontonummer lønnen utbetales til
--
-- salary_period (per ansatt og måned):
--   overtime50_hours   overtid 50 % (timer)
--   overtime100_hours  overtid 100 % (timer)
--   holiday_hours      timer på helligdag (100 % tillegg)
--   correction_nok     korreksjon for perioden (kr, + eller −)
--   tax_nok            fast skattetrekk i kr (tom = prosent fra innstillingene)
--   worked_hours       arbeidede timer (tom = planlagte timer fra turnusen)
-- =====================================================================

do $$
begin
  if to_regclass('public.salary_settings') is null or to_regclass('public.salary_period') is null then
    raise exception 'Kjør KJØR-I-SUPABASE-LONN-ANSATT.sql først (lønnstabellene mangler).';
  end if;
end $$;

alter table salary_settings add column if not exists tax_percent     numeric not null default 0;
alter table salary_settings add column if not exists hours_per_month numeric not null default 162.5;
alter table salary_settings add column if not exists account_number  text;

alter table salary_period add column if not exists overtime50_hours  numeric not null default 0;
alter table salary_period add column if not exists overtime100_hours numeric not null default 0;
alter table salary_period add column if not exists holiday_hours     numeric not null default 0;
alter table salary_period add column if not exists correction_nok    numeric not null default 0;
alter table salary_period add column if not exists tax_nok           numeric;
alter table salary_period add column if not exists worked_hours      numeric;

-- Fornuftige grenser.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'salary_settings_tax_percent_chk') then
    alter table salary_settings add constraint salary_settings_tax_percent_chk
      check (tax_percent >= 0 and tax_percent <= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'salary_settings_hours_chk') then
    alter table salary_settings add constraint salary_settings_hours_chk
      check (hours_per_month > 0);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Sjekk: de nye kolonnene finnes.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('salary_settings', 'salary_period')
   and column_name in ('tax_percent', 'hours_per_month', 'account_number',
                       'overtime50_hours', 'overtime100_hours', 'holiday_hours',
                       'correction_nok', 'tax_nok', 'worked_hours')
 order by table_name, column_name;
