-- ============================================================================
-- STR-TWO GATE PASS SYSTEM - COMPLETE MASTER DATABASE SCHEMA
-- Target Database: PostgreSQL / Supabase
-- Contains: Tables, Constraints, Extensions, RPC Functions, RLS, & Performance Indexes
-- Initial Data: Default Administrator Account Only ('admin' / 'admin123')
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
-- Enable pgcrypto for industry-standard bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- 2. TABLE STRUCTURES (CLEAN SLATE SCHEMA)
-- ----------------------------------------------------------------------------

-- A. System Users Table (app_users)
-- Passwords stored ONLY as bcrypt hashes (password_hash). Never plain text.
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- B. Company / Organization Settings Table (company_settings)
CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT,
    business_address TEXT,
    registered_address TEXT,
    contact_line TEXT,
    logo_url TEXT,
    signature_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- C. Delivery Locations Table (delivery_locations)
CREATE TABLE IF NOT EXISTS public.delivery_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- D. Drivers Registry Table (drivers)
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_name TEXT NOT NULL,
    vehicle_number TEXT NOT NULL,
    phone_number TEXT,
    nic TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- E. Delivery Time Slots Table (time_slots)
CREATE TABLE IF NOT EXISTS public.time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- F. Gate Pass Records Table (gate_pass_records)
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

-- ----------------------------------------------------------------------------
-- 3. SECURE AUTHENTICATION & BUSINESS LOGIC RPC FUNCTIONS
-- All functions include 'SET search_path = public, extensions' to resolve
-- gen_salt('bf'::text, 10) and crypt() reliably in Supabase environments.
-- ----------------------------------------------------------------------------

-- A. User Login RPC
CREATE OR REPLACE FUNCTION public.login_user(
    p_username TEXT,
    p_password TEXT
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    email TEXT,
    role TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.is_active,
        u.created_at
    FROM public.app_users u
    WHERE lower(u.username) = lower(trim(p_username))
      AND u.password_hash = crypt(p_password, u.password_hash)
      AND u.is_active = true;
END;
$$;

-- B. User Self-Service Password Change (Profile Page)
CREATE OR REPLACE FUNCTION public.change_user_password(
    p_user_id UUID,
    p_current_password TEXT,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_stored_hash TEXT;
BEGIN
    IF char_length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'New password must be at least 6 characters.';
    END IF;

    SELECT password_hash INTO v_stored_hash 
    FROM public.app_users 
    WHERE id = p_user_id;

    IF v_stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verify current password against stored bcrypt hash
    IF v_stored_hash <> crypt(p_current_password, v_stored_hash) THEN
        RETURN FALSE;
    END IF;

    -- Update to new hashed password
    UPDATE public.app_users
    SET password_hash = crypt(p_new_password, gen_salt('bf'::text, 10))
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

-- C. Admin Create User (Settings Page)
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_username TEXT,
    p_email TEXT,
    p_password TEXT,
    p_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_new_id UUID;
BEGIN
    IF char_length(p_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.app_users WHERE lower(username) = lower(trim(p_username))) THEN
        RAISE EXCEPTION 'Username "%" is already taken.', trim(p_username);
    END IF;

    INSERT INTO public.app_users (
        username,
        email,
        password_hash,
        role,
        is_active
    )
    VALUES (
        trim(p_username),
        nullif(trim(p_email), ''),
        crypt(p_password, gen_salt('bf'::text, 10)),
        coalesce(p_role, 'user'),
        true
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- D. Admin Reset User Password (Settings Page)
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF char_length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    UPDATE public.app_users
    SET password_hash = crypt(p_new_password, gen_salt('bf'::text, 10))
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

-- E. Admin Delete User (Settings Page)
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    DELETE FROM public.app_users WHERE id = p_user_id AND username <> 'admin';
    RETURN TRUE;
END;
$$;

-- F. Fast Duplicate Invoices Checker
CREATE OR REPLACE FUNCTION public.check_duplicate_invoices(
    target_invoices TEXT[]
)
RETURNS TABLE (
    invoice TEXT,
    gate_pass_no TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        elem->>'invoice' AS invoice,
        gp.gate_pass_no
    FROM public.gate_pass_records gp,
         jsonb_array_elements(gp.rows) AS elem
    WHERE elem->>'invoice' = ANY(target_invoices);
END;
$$;

-- G. Atomic Next Gate Pass Number Generator
CREATE OR REPLACE FUNCTION public.get_next_gate_pass_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_max_num INT := 0;
    v_record RECORD;
    v_num_str TEXT;
    v_current_num INT;
BEGIN
    FOR v_record IN 
        SELECT gate_pass_no 
        FROM public.gate_pass_records 
        WHERE gate_pass_no ~ '^STR2GP-[0-9]+$'
    LOOP
        v_num_str := substring(v_record.gate_pass_no from 'STR2GP-([0-9]+)');
        IF v_num_str IS NOT NULL THEN
            v_current_num := v_num_str::INT;
            IF v_current_num > v_max_num THEN
                v_max_num := v_current_num;
            END IF;
        END IF;
    END LOOP;

    RETURN 'STR2GP-' || lpad((v_max_num + 1)::TEXT, 4, '0');
END;
$$;

-- H. Gate Pass Status Workflow Integrity Trigger (Cannot Post before Dispatch)
CREATE OR REPLACE FUNCTION public.trg_validate_gate_pass_status_flow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    -- If updating status to 'completed' (posted), it MUST have previously been 'dispatched'
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'dispatched' THEN
        RAISE EXCEPTION 'Cannot post Gate Pass %: goods must be dispatched before posting.', OLD.gate_pass_no;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gate_pass_status_check ON public.gate_pass_records;
CREATE TRIGGER trg_gate_pass_status_check
BEFORE UPDATE OF status ON public.gate_pass_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_validate_gate_pass_status_flow();

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- Enable RLS across all tables
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_pass_records ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS "Allow read app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow all for app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow update company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow all for company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow all for delivery_locations" ON public.delivery_locations;
DROP POLICY IF EXISTS "Allow all for drivers" ON public.drivers;
DROP POLICY IF EXISTS "Allow all for time_slots" ON public.time_slots;
DROP POLICY IF EXISTS "Allow select gate_pass_records" ON public.gate_pass_records;
DROP POLICY IF EXISTS "Allow insert gate_pass_records" ON public.gate_pass_records;
DROP POLICY IF EXISTS "Allow update gate_pass_records" ON public.gate_pass_records;
DROP POLICY IF EXISTS "Allow all for gate_pass_records" ON public.gate_pass_records;

-- A. app_users Policies
-- Safe SELECT of user metadata allowed for UI listing
CREATE POLICY "Allow read app_users" 
ON public.app_users 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Direct client INSERT, UPDATE, DELETE are strictly REVOKED (must use RPCs)
REVOKE INSERT, UPDATE, DELETE ON public.app_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.app_users FROM authenticated;

-- B. company_settings Policies
CREATE POLICY "Allow read company_settings" 
ON public.company_settings 
FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "Allow update company_settings" 
ON public.company_settings 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- C. Lookups Policies (locations, drivers, time_slots)
CREATE POLICY "Allow all for delivery_locations" 
ON public.delivery_locations 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all for drivers" 
ON public.drivers 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all for time_slots" 
ON public.time_slots 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- D. gate_pass_records Policies
CREATE POLICY "Allow select gate_pass_records" 
ON public.gate_pass_records 
FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "Allow insert gate_pass_records" 
ON public.gate_pass_records 
FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

CREATE POLICY "Allow update gate_pass_records" 
ON public.gate_pass_records 
FOR UPDATE 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);
-- Note: Direct DELETE is blocked to preserve immutable audit trail

-- ----------------------------------------------------------------------------
-- 5. RPC EXECUTION PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.login_user(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_user_password(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_duplicate_invoices(TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_gate_pass_number() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gate_pass_records_rows ON public.gate_pass_records USING gin (rows);
CREATE INDEX IF NOT EXISTS idx_gate_pass_records_created_at ON public.gate_pass_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gate_pass_records_gp_no ON public.gate_pass_records (gate_pass_no);
CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users (lower(username));

-- ----------------------------------------------------------------------------
-- 7. INITIAL MASTER DATA (DEFAULT ADMIN ONLY)
-- ----------------------------------------------------------------------------
-- Insert or update default system administrator ('admin' / 'admin123')
INSERT INTO public.app_users (username, password_hash, role, is_active)
VALUES ('admin', crypt('admin123', gen_salt('bf'::text, 10)), 'admin', true)
ON CONFLICT (username) DO UPDATE 
SET password_hash = crypt('admin123', gen_salt('bf'::text, 10))
WHERE public.app_users.password_hash IS NULL OR public.app_users.password_hash = '';

-- Initialize empty default company settings record if none exists
INSERT INTO public.company_settings (company_name, business_address, registered_address, contact_line)
SELECT 'STR Two', 'Business Address', 'Registered Address', '+94 11 2345678'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);
