-- ============================================================================
-- MIGRATION: ADVANCED USER MANAGEMENT & ROLE UPDATES
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/adbbqlbnrrzlzhlbzkhu/sql)
-- ============================================================================

-- 1. Function to update user role safely (Bypasses RLS with SECURITY DEFINER)
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

GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) TO anon, authenticated;

-- 2. Function to update user details (email and role)
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

GRANT EXECUTE ON FUNCTION public.admin_update_user_details(UUID, TEXT, TEXT) TO anon, authenticated;
