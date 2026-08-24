-- =====================================================================
-- Timepåminnelser (e-post + SMS ~24t før).
--   reminder_sent_at: settes når påminnelse er sendt (unngår duplikater).
--   due_reminders():  bookinger som skal ha påminnelse nå (innen 24t,
--                     bekreftet/venter, ikke allerede påminnet).
--   mark_reminder_sent(): markerer en booking som påminnet.
-- Kjøres av /api/cron/reminders (Vercel Cron) via anon-nøkkel, derfor
-- SECURITY DEFINER så RLS ikke blokkerer.
-- =====================================================================

alter table bookings add column if not exists reminder_sent_at timestamptz;

create or replace function due_reminders()
returns table (
  id uuid,
  start_at timestamptz,
  customer_name text,
  email text,
  phone text,
  service_name text,
  barber_name text
)
language sql security definer set search_path = public as $$
  select
    b.id,
    b.start_at,
    c.full_name,
    c.email,
    c.phone,
    s.name,
    st.full_name
  from bookings b
  join customers c on c.id = b.customer_id
  left join services s on s.id = b.service_id
  left join staff st on st.id = b.staff_id
  where b.reminder_sent_at is null
    and b.status in ('pending','confirmed')
    and b.start_at > now()
    and b.start_at <= now() + interval '24 hours';
$$;
grant execute on function due_reminders() to anon, authenticated;

create or replace function mark_reminder_sent(p_booking uuid)
returns void
language sql security definer set search_path = public as $$
  update bookings set reminder_sent_at = now() where id = p_booking;
$$;
grant execute on function mark_reminder_sent(uuid) to anon, authenticated;
