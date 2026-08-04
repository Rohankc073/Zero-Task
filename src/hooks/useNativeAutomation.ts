import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SystemAlert } from '../types';
import { useAuth } from '../context/AuthContext';

export function useNativeAutomation() {
  const { profile } = useAuth();
  const [activeAlert, setActiveAlert] = useState<SystemAlert | null>(null);
  
  // Realtime subscription for system alerts
  useEffect(() => {
    if (!profile) return;

    const channel = supabase.channel('system_alerts_realtime')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'system_alerts'
        },
        (payload) => {
          const newAlert = payload.new as SystemAlert;
          // Filter by department (or global if department_id is null)
          if (!newAlert.department_id || newAlert.department_id === profile.department_id || profile.role === 'Founder') {
            setActiveAlert(newAlert);
            // Auto dismiss after 5 seconds
            setTimeout(() => {
              setActiveAlert(null);
            }, 5000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  // Invokes the sync-calendar edge function
  const dispatchCalendarSync = useCallback(async (taskId: string, userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-calendar', {
        body: { taskId, userId }
      });
      
      if (error) {
        console.error('Edge Function Error:', error);
        return { success: false, error };
      }
      return { success: true, data };
    } catch (error) {
      console.error('Failed to invoke edge function:', error);
      return { success: false, error };
    }
  }, []);
  
  // Helper to log a milestone and broadcast it automatically
  const logMilestone = useCallback(async (milestoneType: 'Early Completion' | 'Streak' | 'High Priority Close', points: number) => {
    if (!profile) return;
    
    // Insert milestone
    const { error: milestoneError } = await supabase.from('task_milestones').insert({
      user_id: profile.id,
      milestone_type: milestoneType,
      points
    });
    
    if (!milestoneError) {
      // Broadcast alert
      await supabase.from('system_alerts').insert({
        department_id: profile.department_id,
        message: `${profile.full_name || 'An employee'} just achieved a ${milestoneType} milestone (+${points} pts)!`,
        type: 'Milestone'
      });
    }
  }, [profile]);

  return {
    activeAlert,
    dispatchCalendarSync,
    logMilestone
  };
}
