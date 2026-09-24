-- ============================================================================
-- MIGRATION: SUPER ADMIN & AUDIT LOGS TABLE
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/adbbqlbnrrzlzhlbzkhu/sql)
-- ============================================================================

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    performed_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for high performance querying & pagination
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

-- 3. Row Level Security (RLS) for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for audit_logs" ON public.audit_logs;
CREATE POLICY "Allow all for audit_logs" 
ON public.audit_logs 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 4. Update app_users role check constraint to include 'super_admin'
DO $$
BEGIN
    ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
    ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check 
        CHECK (role IN ('super_admin', 'admin', 'user', 'viewer'));
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 5. Upgrade default 'admin' account to 'super_admin'
UPDATE public.app_users 
SET role = 'super_admin' 
WHERE username = 'admin';

-- 6. Update admin_create_user RPC function to support super_admin
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
