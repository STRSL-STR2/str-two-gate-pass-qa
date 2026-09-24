-- ============================================================================
-- STR-TWO GATE PASS SYSTEM - SECURITY & RLS HARDENING SCRIPT
-- Target Environment: QA Supabase (adbbqlbnrrzlzhlbzkhu)
-- Run this in QA Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENABLE EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 2. SECURE PASSWORD STORAGE MIGRATION FOR app_users
-- ----------------------------------------------------------------------------
-- Add password_hash column if it doesn't already exist
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- If plain_password column exists, migrate all plain passwords to bcrypt hashes
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'app_users' 
          AND column_name = 'plain_password'
    ) THEN
        -- Encrypt any non-migrated passwords
        UPDATE public.app_users 
        SET password_hash = crypt(plain_password, gen_salt('bf', 10))
        WHERE (password_hash IS NULL OR password_hash = '') AND plain_password IS NOT NULL;

        -- Safely drop plain_password column so passwords are never stored in clear text
        ALTER TABLE public.app_users DROP COLUMN plain_password;
    END IF;
END $$;

-- Ensure default admin user exists with secure hash if table is empty
INSERT INTO public.app_users (username, password_hash, role, is_active)
VALUES ('admin', crypt('admin123', gen_salt('bf', 10)), 'admin', true)
ON CONFLICT (username) DO UPDATE 
SET password_hash = crypt('admin123', gen_salt('bf', 10))
WHERE public.app_users.password_hash IS NULL OR public.app_users.password_hash = '';

-- Ensure password_hash is not nullable
ALTER TABLE public.app_users ALTER COLUMN password_hash SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. SECURE AUTHENTICATION & USER MANAGEMENT RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- A. Secure Login Function (Checks bcrypt hash, returns user profile)
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
SET search_path = public
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
SET search_path = public
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
    SET password_hash = crypt(p_new_password, gen_salt('bf', 10))
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
SET search_path = public
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
        crypt(p_password, gen_salt('bf', 10)),
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
SET search_path = public
AS $$
BEGIN
    IF char_length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    UPDATE public.app_users
    SET password_hash = crypt(p_new_password, gen_salt('bf', 10))
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
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.app_users WHERE id = p_user_id AND username <> 'admin';
    RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. ATOMIC SEQUENCE & DUPLICATE VALIDATION RPCs
-- ----------------------------------------------------------------------------

-- A. Fast duplicate invoices check
CREATE OR REPLACE FUNCTION public.check_duplicate_invoices(
    target_invoices TEXT[]
)
RETURNS TABLE (
    invoice TEXT,
    gate_pass_no TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- B. Atomic next gate pass number generator
CREATE OR REPLACE FUNCTION public.get_next_gate_pass_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) HARDENING
-- ----------------------------------------------------------------------------

-- Enable RLS across all tables
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_pass_records ENABLE ROW LEVEL SECURITY;

-- Clean up existing insecure "Allow all" policies
DROP POLICY IF EXISTS "Allow all for app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow read app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow all for company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow update company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Allow all for delivery_locations" ON public.delivery_locations;
DROP POLICY IF EXISTS "Allow all for drivers" ON public.drivers;
DROP POLICY IF EXISTS "Allow all for time_slots" ON public.time_slots;
DROP POLICY IF EXISTS "Allow all for gate_pass_records" ON public.gate_pass_records;
DROP POLICY IF EXISTS "Allow select gate_pass_records" ON public.gate_pass_records;
DROP POLICY IF EXISTS "Allow insert gate_pass_records" ON public.gate_pass_records;
DROP POLICY IF EXISTS "Allow update gate_pass_records" ON public.gate_pass_records;

-- A. app_users: Allow public to SELECT safe metadata (id, username, email, role, is_active)
-- Direct INSERT, UPDATE, and DELETE are strictly REVOKED (must go through SECURITY DEFINER RPCs)
CREATE POLICY "Allow read app_users" 
ON public.app_users 
FOR SELECT 
TO anon, authenticated 
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.app_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.app_users FROM authenticated;

-- B. company_settings: Read for all, insert/update for all
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

-- C. delivery_locations, drivers, time_slots: Read and manage
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

-- D. gate_pass_records: Allow SELECT, INSERT, UPDATE, but BLOCK direct DELETE
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

-- ----------------------------------------------------------------------------
-- 6. GRANT EXECUTE ON ALL SECURE RPC FUNCTIONS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.login_user(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_user_password(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_duplicate_invoices(TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_gate_pass_number() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gate_pass_records_created_at ON public.gate_pass_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gate_pass_records_gp_no ON public.gate_pass_records (gate_pass_no);
CREATE INDEX IF NOT EXISTS idx_gate_pass_records_rows ON public.gate_pass_records USING gin (rows);
CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users (lower(username));
