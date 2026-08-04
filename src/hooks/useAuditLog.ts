import { supabase } from '../lib/supabase';
import { AuditActionType } from '../types';
import { useAuth } from '../context/AuthContext';

export function useAuditLog() {
  const { session } = useAuth();

  const logAction = async (action_type: AuditActionType, description: string) => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase.from('audit_logs').insert({
        user_id: session.user.id,
        action_type,
        description
      });

      if (error) {
        console.error('Failed to log audit action:', error.message);
      }
    } catch (err) {
      console.error('Failed to log audit action:', err);
    }
  };

  return { logAction };
}
