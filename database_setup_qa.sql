-- =======================================================
-- STR-TWO GATE PASS SYSTEM - QA DATABASE SCHEMA SETUP
-- Target Database: QA Supabase (adbbqlbnrrzlzhlbzkhu)
-- Run this in QA Supabase Dashboard -> SQL Editor
-- =======================================================

-- 1. APP USERS TABLE
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    plain_password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. COMPANY SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT,
    business_address TEXT,
    registered_address TEXT,
    contact_line TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. DELIVERY LOCATIONS TABLE
CREATE TABLE IF NOT EXISTS public.delivery_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. DRIVERS TABLE
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_name TEXT NOT NULL,
    vehicle_number TEXT NOT NULL,
    phone_number TEXT,
    nic TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TIME SLOTS TABLE
CREATE TABLE IF NOT EXISTS public.time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. GATE PASS RECORDS TABLE
CREATE TABLE IF NOT EXISTS public.gate_pass_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gate_pass_no TEXT NOT NULL UNIQUE,
    date TEXT,
    time TEXT,
    location TEXT,
    vehicle_number TEXT,
    driver_name TEXT,
    phone_number TEXT,
    nic TEXT,
    customer_name TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'issued',
    rows JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_mtrs NUMERIC DEFAULT 0,
    total_value NUMERIC DEFAULT 0,
    total_cartons NUMERIC DEFAULT 0,
    invoice_count INT DEFAULT 0
);

-- =======================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =======================================================
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_pass_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for app_users" ON public.app_users;
CREATE POLICY "Allow all for app_users" ON public.app_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for company_settings" ON public.company_settings;
CREATE POLICY "Allow all for company_settings" ON public.company_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for delivery_locations" ON public.delivery_locations;
CREATE POLICY "Allow all for delivery_locations" ON public.delivery_locations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for drivers" ON public.drivers;
CREATE POLICY "Allow all for drivers" ON public.drivers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for time_slots" ON public.time_slots;
CREATE POLICY "Allow all for time_slots" ON public.time_slots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for gate_pass_records" ON public.gate_pass_records;
CREATE POLICY "Allow all for gate_pass_records" ON public.gate_pass_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =======================================================
-- INITIAL DEFAULT DATA FOR QA
-- =======================================================
INSERT INTO public.app_users (username, plain_password, role, is_active)
VALUES ('admin', 'admin123', 'admin', true)
ON CONFLICT (username) DO NOTHING;

INSERT INTO public.time_slots (label, is_active)
VALUES 
    ('08:00 AM - 10:00 AM', true),
    ('10:00 AM - 12:00 PM', true),
    ('01:00 PM - 03:00 PM', true),
    ('03:00 PM - 05:00 PM', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (company_name, business_address, registered_address, contact_line)
SELECT 'STR Two', 'Business Address', 'Registered Address', '+94 11 2345678'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);
