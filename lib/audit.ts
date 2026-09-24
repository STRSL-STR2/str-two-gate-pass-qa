import { supabase } from "@/lib/supabase";

export interface LogAuditParams {
  action: string;
  entity_type: 'gate_pass' | 'user' | 'master_data' | 'system' | 'company';
  entity_id?: string | null;
  details?: Record<string, any>;
  performed_by?: string | null;
}

/**
 * Centrally records an immutable audit log entry into public.audit_logs.
 * Non-blocking, fails gracefully without breaking user actions.
 */
export async function logAuditActivity({
  action,
  entity_type,
  entity_id,
  details = {},
  performed_by
}: LogAuditParams): Promise<void> {
  try {
    const actor = performed_by || 'System';
    await supabase.from('audit_logs').insert([{
      action,
      entity_type,
      entity_id: entity_id || null,
      details: details || {},
      performed_by: actor
    }]);
  } catch (err) {
    console.warn("Audit log recording error:", err);
  }
}
