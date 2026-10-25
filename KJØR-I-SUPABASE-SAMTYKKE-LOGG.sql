-- =====================================================================
-- MARKEDSFØRINGSSAMTYKKE – HISTORIKK OG AVMELDING
--   1) Kundekortet kan skille «aldri sagt ja» fra «meldte seg av»:
--      marketing_unsubscribed_at + marketing_unsubscribe_source.
--   2) Hvor samtykket kom fra: marketing_consent_source.
--   3) Full logg over hver endring (marketing_consent_log) – dokumentasjon
--      etter markedsføringsloven § 15. Loggen fylles automatisk av en
--      trigger, uansett hvor endringen kommer fra (booking, kassa, admin,
--      avmeldingslenke, SMS STOPP/START, import).
--   4) Avmeldinger som skjedde FØR denne filen ble kjørt, fylles inn
--      best mulig ut fra det databasen vet.
--
--   Trygt å kjøre flere ganger.
-- =====================================================================
begin;

-- ---------- 1) Kolonner ----------
alter table customers add column if not exists marketing_consent_source text;
alter table customers add column if not exists marketing_unsubscribed_at timestamptz;
alter table customers add column if not exists marketing_unsubscribe_source text;

-- ---------- 2) Logg ----------
create table if not exists marketing_consent_log (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  consent     boolean not null,
  source      text not null,
  changed_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists marketing_consent_log_customer_idx on marketing_consent_log (customer_id, created_at desc);

alter table marketing_consent_log enable row level security;
drop policy if exists marketing_consent_log_admin_read on marketing_consent_log;
create policy marketing_consent_log_admin_read on marketing_consent_log
  for select using (is_admin());
-- Ingen insert/update/delete-policy: bare triggeren (security definer) skriver.

-- ---------- 3) Avmeldinger før loggen fantes ----------
-- Samtykke = nei MED tidspunkt betyr at samtykket ble fjernet (avmelding
-- setter tidspunktet; kunder som aldri har sagt ja har det tomt).
update customers c
   set marketing_unsubscribed_at = c.marketing_consent_at,
       marketing_unsubscribe_source =
         case when exists (select 1 from marketing_queue q
                            where q.customer_id = c.id and q.status = 'sent'
                              and q.sent_at <= c.marketing_consent_at)
              then 'Avmeldt etter markedsførings-e-post (før loggen startet)'
              else 'Samtykke fjernet (før loggen startet)' end
 where c.marketing_consent = false
   and c.marketing_consent_at is not null
   and c.marketing_unsubscribed_at is null;

update customers
   set marketing_consent_source = 'Registrert før loggen startet'
 where marketing_consent = true and marketing_consent_source is null;

-- Startpunkt i loggen (bare første gang).
insert into marketing_consent_log (customer_id, consent, source, created_at)
select c.id, c.marketing_consent,
       case when c.marketing_consent then c.marketing_consent_source else c.marketing_unsubscribe_source end,
       coalesce(c.marketing_unsubscribed_at, c.marketing_consent_at, now())
  from customers c
 where (c.marketing_consent = true or c.marketing_unsubscribed_at is not null)
   and not exists (select 1 from marketing_consent_log l where l.customer_id = c.id);

-- ---------- 4) Trigger: kilde + logg på hver endring ----------
-- Kilden settes av funksjonene under med set_config('dtb.consent_source', …).
-- Mangler den, gjettes den ut fra hvem som er innlogget.
create or replace function consent_source_guess()
returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := nullif(current_setting('dtb.consent_source', true), ''); v_role text;
begin
  if v is not null then return v; end if;
  begin
    if auth.uid() is not null then
      select role::text into v_role from profiles where id = auth.uid();
      return case when v_role in ('admin', 'eier') then 'Admin' when v_role = 'shop' then 'Kassa' else 'Innlogget bruker' end;
    end if;
    if auth.role() = 'anon' then return 'Nettsiden'; end if;
  exception when others then null;
  end;
  return 'System / import';
end $$;

create or replace function customers_consent_before()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_src text;
begin
  if tg_op = 'UPDATE' and new.marketing_consent is not distinct from old.marketing_consent then
    return new;
  end if;
  if tg_op = 'INSERT' and not coalesce(new.marketing_consent, false) then
    return new;
  end if;
  v_src := consent_source_guess();
  if new.marketing_consent then
    -- Behold kilde som settes i samme oppdatering (f.eks. Fixit-samtykket).
    if tg_op = 'INSERT' or new.marketing_consent_source is not distinct from old.marketing_consent_source
       or new.marketing_consent_source is null then
      new.marketing_consent_source := v_src;
    end if;
    new.marketing_unsubscribed_at := null;
    new.marketing_unsubscribe_source := null;
  else
    new.marketing_unsubscribed_at := now();
    new.marketing_unsubscribe_source := v_src;
  end if;
  return new;
end $$;

create or replace function customers_consent_after()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if tg_op = 'UPDATE' and new.marketing_consent is not distinct from old.marketing_consent then
    return null;
  end if;
  if tg_op = 'INSERT' and not coalesce(new.marketing_consent, false) then
    return null;
  end if;
  begin
    v_uid := auth.uid();
  exception when others then v_uid := null;
  end;
  insert into marketing_consent_log (customer_id, consent, source, changed_by)
  values (new.id, new.marketing_consent,
          coalesce(case when new.marketing_consent then new.marketing_consent_source else new.marketing_unsubscribe_source end, 'Ukjent'),
          v_uid);
  return null;
end $$;

drop trigger if exists customers_consent_before_trg on customers;
create trigger customers_consent_before_trg
  before insert or update of marketing_consent on customers
  for each row execute function customers_consent_before();

drop trigger if exists customers_consent_after_trg on customers;
create trigger customers_consent_after_trg
  after insert or update of marketing_consent on customers
  for each row execute function customers_consent_after();

-- ---------- 5) Funksjonene som endrer samtykke: oppgi kilden ----------
create or replace function marketing_unsubscribe(p_token uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  perform set_config('dtb.consent_source', 'Avmeldingslenke i e-post', true);
  update customers
     set marketing_consent = false, marketing_consent_at = now()
   where portal_token = p_token
   returning full_name into v_name;
  return v_name;
end $$;

create or replace function set_marketing_consent_for_booking(p_booking uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('dtb.consent_source', 'Krysset av ved booking på nettsiden', true);
  update customers c
     set marketing_consent    = true,
         marketing_consent_at = now()
    from bookings b
   where b.id = p_booking
     and c.id = b.customer_id
     and c.marketing_consent is distinct from true;
end $$;

create or replace function sms_set_consent_by_phone(p_phone text, p_consent boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare v_key text; v_count int;
begin
  v_key := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
  if length(v_key) < 8 then
    return 0;
  end if;
  perform set_config('dtb.consent_source', case when p_consent then 'SMS-svar START' else 'SMS-svar STOPP' end, true);
  update customers
     set marketing_consent = p_consent,
         marketing_consent_at = now()
   where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = v_key;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Admin på kundekortet (med navnet på den som gjorde det).
create or replace function admin_set_marketing_consent(p_customer uuid, p_consent boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_who text;
begin
  if not is_admin() then raise exception 'Ikke tilgang'; end if;
  select coalesce(nullif(trim(full_name), ''), email) into v_who from profiles where id = auth.uid();
  perform set_config('dtb.consent_source',
    case when p_consent then 'Registrert av admin' else 'Fjernet av admin' end
      || coalesce(' (' || v_who || ')', ''), true);
  update customers
     set marketing_consent = p_consent, marketing_consent_at = now()
   where id = p_customer;
end $$;
revoke execute on function admin_set_marketing_consent(uuid, boolean) from public, anon;
grant  execute on function admin_set_marketing_consent(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Rapport
do $$
declare n_unsub int; n_mail int;
begin
  select count(*) into n_unsub from customers where marketing_unsubscribed_at is not null;
  select count(*) into n_mail from customers
   where marketing_unsubscribe_source like 'Avmeldt etter markedsførings-e-post%';
  raise notice 'Avmeldte kunder: % (hvorav % etter en markedsførings-e-post).', n_unsub, n_mail;
end $$;

commit;
