-- ============================================================================
-- GPMS: CONSOLIDATED DATABASE MIGRATION SCRIPT
-- Project: Gate Pass Management System
-- Target: Run in Supabase SQL Editor (https://supabase.com/dashboard)
-- Safe to re-run: Uses IF NOT EXISTS, OR REPLACE, and exception guards.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUDIT & ACTIVITY LOGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    performed_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for audit_logs" ON public.audit_logs;
CREATE POLICY "Allow all for audit_logs" 
ON public.audit_logs 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2. USER ROLES CONSTRAINT UPDATE (SUPPORT 'super_admin')
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
    ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check 
        CHECK (role IN ('super_admin', 'admin', 'user', 'viewer'));
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- Upgrade default 'admin' account to 'super_admin' if exists
UPDATE public.app_users 
SET role = 'super_admin' 
WHERE username = 'admin' AND role <> 'super_admin';

-- ----------------------------------------------------------------------------
-- 3. ADMIN USER CREATION FUNCTION (RPC)
-- ----------------------------------------------------------------------------
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

    IF p_role NOT IN ('super_admin', 'admin', 'user', 'viewer') THEN
        p_role := 'user';
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

-- ----------------------------------------------------------------------------
-- 4. ADMIN USER ROLE & DETAILS UPDATE FUNCTIONS (RPC)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
    p_user_id UUID,
    p_new_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_new_role NOT IN ('super_admin', 'admin', 'user', 'viewer') THEN
        RAISE EXCEPTION 'Invalid role: %', p_new_role;
    END IF;

    UPDATE public.app_users
    SET role = p_new_role
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_details(
    p_user_id UUID,
    p_email TEXT,
    p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_role NOT IN ('super_admin', 'admin', 'user', 'viewer') THEN
        RAISE EXCEPTION 'Invalid role: %', p_role;
    END IF;

    UPDATE public.app_users
    SET 
        email = nullif(trim(p_email), ''),
        role = p_role
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. NEW GATE PASS NUMBER GENERATION FUNCTION (STR2GP-YY-MMM-NNNN)
-- Sequence resets to 0001 each year; does NOT reset on month change.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_gate_pass_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_year TEXT := to_char(now(), 'YY');
    v_month TEXT := upper(to_char(now(), 'Mon'));
    v_pattern TEXT := '^STR2GP-' || v_year || '-[A-Z]{3}-([0-9]+)$';
    v_max_num INT := 0;
    v_record RECORD;
    v_num_str TEXT;
    v_current_num INT;
BEGIN
    FOR v_record IN 
        SELECT gate_pass_no 
        FROM public.gate_pass_records 
        WHERE gate_pass_no ~ v_pattern
    LOOP
        v_num_str := substring(v_record.gate_pass_no from ('^STR2GP-' || v_year || '-[A-Z]{3}-([0-9]+)$'));
        IF v_num_str IS NOT NULL THEN
            v_current_num := v_num_str::INT;
            IF v_current_num > v_max_num THEN
                v_max_num := v_current_num;
            END IF;
        END IF;
    END LOOP;

    RETURN 'STR2GP-' || v_year || '-' || v_month || '-' || lpad((v_max_num + 1)::TEXT, 4, '0');
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC EXECUTION PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_details(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_gate_pass_number() TO anon, authenticated;
