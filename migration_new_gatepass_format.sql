-- ============================================================================
-- MIGRATION: NEW GATE PASS NUMBER FORMAT (YEARLY RESET)
-- Format: STR2GP-{YY}-{MMM}-{NNNN}  (e.g., STR2GP-26-JAN-0001, STR2GP-26-OCT-0002)
-- Number sequence resets to 0001 upon new YEAR.
-- Number sequence continues sequentially across months within the same year.
-- ============================================================================

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
    -- Scan existing gate passes for the CURRENT YEAR
    FOR v_record IN 
        SELECT gate_pass_no 
        FROM public.gate_pass_records 
        WHERE gate_pass_no ~ v_pattern
    LOOP
        -- Extract numeric sequence suffix
        v_num_str := substring(v_record.gate_pass_no from ('^STR2GP-' || v_year || '-[A-Z]{3}-([0-9]+)$'));
        IF v_num_str IS NOT NULL THEN
            v_current_num := v_num_str::INT;
            IF v_current_num > v_max_num THEN
                v_max_num := v_current_num;
            END IF;
        END IF;
    END LOOP;

    -- Return formatted number (resets to 0001 each year, continues across months)
    RETURN 'STR2GP-' || v_year || '-' || v_month || '-' || lpad((v_max_num + 1)::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_gate_pass_number() TO anon, authenticated;
