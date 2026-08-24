-- Downtown Barbers — Payment fields on bookings
-- Run this in the Supabase SQL Editor.
--
-- Adds the columns used by the admin payment flow (payment_method, paid_at)
-- and the Vipps ePayment integration (payment_provider, payment_status,
-- vipps_reference). Idempotent — safe to run more than once.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('vipps', 'cash'));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_provider TEXT;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'refunded'));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS vipps_reference TEXT;

-- Webhook lookups resolve bookings by Vipps reference.
CREATE INDEX IF NOT EXISTS bookings_vipps_reference_idx
  ON bookings (vipps_reference);
