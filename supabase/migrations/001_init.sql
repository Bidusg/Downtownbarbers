-- Downtown Barbers — Database Migration
-- Run this in the Supabase SQL Editor

-- ──────────────────────────────────────────────
-- TABLES
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  category TEXT NOT NULL DEFAULT 'hair'
    CHECK (category IN ('hair','beard','facial')),
  active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Barber',
  bio TEXT,
  active BOOLEAN DEFAULT TRUE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '19:00',
  UNIQUE(barber_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','cancelled','completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocked_times (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  all_day BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS admins (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY
);

-- ──────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Public reads
DROP POLICY IF EXISTS "services_public" ON services;
CREATE POLICY "services_public" ON services FOR SELECT USING (true);

DROP POLICY IF EXISTS "barbers_public" ON barbers;
CREATE POLICY "barbers_public" ON barbers FOR SELECT USING (true);

DROP POLICY IF EXISTS "availability_public" ON availability;
CREATE POLICY "availability_public" ON availability FOR SELECT USING (true);

DROP POLICY IF EXISTS "blocked_public" ON blocked_times;
CREATE POLICY "blocked_public" ON blocked_times FOR SELECT USING (true);

-- Bookings: anyone inserts, admin reads all, barber reads own
DROP POLICY IF EXISTS "bookings_insert" ON bookings;
CREATE POLICY "bookings_insert" ON bookings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "bookings_admin_select" ON bookings;
CREATE POLICY "bookings_admin_select" ON bookings FOR SELECT
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

DROP POLICY IF EXISTS "bookings_barber_select" ON bookings;
CREATE POLICY "bookings_barber_select" ON bookings FOR SELECT
  USING (barber_id IN (SELECT id FROM barbers WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "bookings_admin_update" ON bookings;
CREATE POLICY "bookings_admin_update" ON bookings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

-- Admins: self read only
DROP POLICY IF EXISTS "admins_self" ON admins;
CREATE POLICY "admins_self" ON admins FOR SELECT USING (id = auth.uid());

-- ──────────────────────────────────────────────
-- SEED DATA
-- ──────────────────────────────────────────────

INSERT INTO services (name, description, price, duration_minutes, category, sort_order) VALUES
  ('Herreklipp',        'Klassisk herreklipp, vask og styling inkludert',      350, 30, 'hair',   1),
  ('Skin Fade',         'Gradert fade fra huden — vår signatur-tjeneste',       450, 45, 'hair',   2),
  ('Barneklipp',        'For kunder under 12 år',                              250, 20, 'hair',   3),
  ('Skjeggtrimming',    'Forming, trimming og stell av skjegg',                200, 20, 'beard',  4),
  ('Hår + Skjegg',      'Full service: klipp og skjeggpleie i én sesjon',      580, 60, 'beard',  5),
  ('Tradisjonell barbering', 'Varm håndklé, skum og barberblad',               350, 30, 'beard',  6),
  ('Øyenbrynsvoksing',  'Forming og voksing av øyenbryn',                      150, 15, 'facial', 7),
  ('Ansiktsmaske',      'Dyprengjørende ansiktsmaske etter barbering',         250, 20, 'facial', 8)
ON CONFLICT DO NOTHING;

INSERT INTO barbers (name, role) VALUES
  ('Vani',      'Barber'),
  ('Soren',     'Barber'),
  ('Isak',      'Barber'),
  ('Stavros',   'Barber'),
  ('David',     'Master Barber'),
  ('Mehetabel', 'Lærling')
ON CONFLICT DO NOTHING;

-- Availability: Mon–Sat (1–6) for every barber, 09:00–19:00
INSERT INTO availability (barber_id, day_of_week, start_time, end_time)
SELECT b.id, d.dow, '09:00'::time, '19:00'::time
FROM barbers b
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) AS d(dow)
ON CONFLICT (barber_id, day_of_week) DO NOTHING;

-- ──────────────────────────────────────────────
-- AFTER RUNNING: create your first admin
-- ──────────────────────────────────────────────
-- 1. Sign up at /admin/login (or via Supabase Auth dashboard)
-- 2. Find your user ID in Auth > Users
-- 3. Run: INSERT INTO admins (id) VALUES ('your-user-uuid');
