-- =====================================================================
-- 0015 – AI AUTOMATISK OPPFØLGING (rebooking / vinn-tilbake)
--   followups:        logg over sendte oppfølginger (unngår spam).
--   due_followups():  kunder som er «modne» for en ny-time-påminnelse:
--                     - siste besøk eldre enn p_weeks uker
--                     - ingen kommende booking
--                     - ingen oppfølging sendt de siste p_weeks ukene
--                     - har e-post
--   mark_followup_sent(): logger en sendt oppfølging.
-- Kjøres av /api/cron/followups + admin «send nå» (SECURITY DEFINER).
-- Idempotent: trygg å kjøre flere ganger.
-- =====================================================================

create table if not exists followups (
  id           uuid primary key default uuid_generate_v4(),
  customer_id  uuid not null references customers(id) on delete cascade,
  kind         text not null default 'rebooking',
  sent_at      timestamptz not null default now()
);
create index if not exists idx_followups_customer on followups(customer_id, sent_at);

alter table followups enable row level security;

do $$ begin
  create policy followups_admin_all on followups
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy followups_shop_read on followups
    for select using (is_shop_or_admin());
exception when duplicate_object then null; end $$;

-- --- Kunder som er klare for oppfølging ---
create or replace function due_followups(p_weeks int default 6)
returns table (
  customer_id  uuid,
  full_name    text,
  email        text,
  last_service text,
  last_barber  text,
  last_visit   timestamptz,
  weeks_since  int
)
language sql security definer set search_path = public as $$
  with last_booking as (
    select b.customer_id, max(b.start_at) as last_visit
    from bookings b
    where b.status in ('confirmed','completed')
      and b.start_at <= now()
    group by b.customer_id
  ),
  future as (
    select distinct customer_id
    from bookings
    where status in ('pending','confirmed') and start_at > now()
  )
  select
    c.id,
    c.full_name,
    c.email,
    ls.name,
    lst.full_name,
    lb.last_visit,
    (extract(epoch from (now() - lb.last_visit)) / 604800)::int
  from last_booking lb
  join customers c on c.id = lb.customer_id
  left join lateral (
    select b.service_id, b.staff_id
    from bookings b
    where b.customer_id = lb.customer_id and b.start_at = lb.last_visit
    limit 1
  ) lastb on true
  left join services ls on ls.id = lastb.service_id
  left join staff lst on lst.id = lastb.staff_id
  where c.email is not null and trim(c.email) <> ''
    and lb.last_visit < now() - make_interval(weeks => p_weeks)
    and lb.customer_id not in (select customer_id from future)
    and not exists (
      select 1 from followups f
      where f.customer_id = lb.customer_id
        and f.sent_at > now() - make_interval(weeks => p_weeks)
    )
  order by lb.last_visit asc;
$$;
grant execute on function due_followups(int) to anon, authenticated;

-- --- Logg en sendt oppfølging ---
create or replace function mark_followup_sent(p_customer uuid, p_kind text default 'rebooking')
returns void
language sql security definer set search_path = public as $$
  insert into followups (customer_id, kind)
  values (p_customer, coalesce(nullif(trim(p_kind), ''), 'rebooking'));
$$;
grant execute on function mark_followup_sent(uuid, text) to anon, authenticated;
