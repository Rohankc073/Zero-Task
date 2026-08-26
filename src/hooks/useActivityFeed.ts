import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AuditLog } from '../types';

export function useActivityFeed() {
  const [activities, setActivities] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Relational fetch: audit_logs joined with public.users
  const fetchActivities = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      setError(null);

      let { data, error: fetchError } = await supabase
        .from('audit_logs')
        .select(`
          id,
          user_id,
          action_type,
          description,
          created_at,
          user:users (
            id,
            full_name,
            avatar_url,
            role
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      // Fallback if PostgREST schema cache fails to recognize FK relationship (PGRST200)
      if (fetchError && (fetchError.code === 'PGRST200' || fetchError.message?.includes('relationship') || fetchError.details?.includes('relationship'))) {
        const { data: rawLogs, error: rawError } = await supabase
          .from('audit_logs')
          .select('id, user_id, action_type, description, created_at')
          .order('created_at', { ascending: false })
          .limit(50);

        if (rawError) {
          fetchError = rawError;
        } else if (rawLogs) {
          const userIds = Array.from(new Set(rawLogs.map((item) => item.user_id).filter(Boolean)));

          let userMap: Record<string, any> = {};
          if (userIds.length > 0) {
            const { data: usersData } = await supabase
              .from('users')
              .select('id, full_name, avatar_url, role')
              .in('id', userIds as string[]);

            if (usersData) {
              userMap = usersData.reduce((acc, u) => {
                acc[u.id] = u;
                return acc;
              }, {} as Record<string, any>);
            }
          }

          data = rawLogs.map((log) => ({
            ...log,
            user: log.user_id ? userMap[log.user_id] : undefined,
          })) as any;

          fetchError = null;
        }
      }

      if (fetchError) {
        console.error('Error fetching audit logs feed:', fetchError);
        setError(fetchError.message);
      } else {
        setActivities((data as unknown as AuditLog[]) || []);
      }
    } catch (err: any) {
      console.error('Exception fetching activity feed:', err);
      setError(err.message || 'Failed to fetch activity feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActivities(false);
  }, [fetchActivities]);

  // Real-time Supabase subscription engine
  useEffect(() => {
    fetchActivities(true);

    // Subscribe to INSERT events on audit_logs table
    const channel = supabase
      .channel('public:audit_logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
        },
        async (payload) => {
          const newRow = payload.new as Partial<AuditLog>;
          if (!newRow.id || !newRow.user_id) return;

          // Fetch relational user information for the incoming real-time payload
          let userDetails = undefined;
          try {
            const { data: userData } = await supabase
              .from('users')
              .select('id, full_name, avatar_url, role')
              .eq('id', newRow.user_id)
              .maybeSingle();

            if (userData) {
              userDetails = userData;
            }
          } catch (e) {
            console.error('Error fetching user info for real-time audit entry:', e);
          }

          const fullAuditItem: AuditLog = {
            id: newRow.id,
            user_id: newRow.user_id,
            action_type: newRow.action_type || 'TASK_UPDATE',
            description: newRow.description || '',
            created_at: newRow.created_at || new Date().toISOString(),
            user: userDetails,
          };

          // Merge and push seamlessly to top of feed
          setActivities((prev) => {
            // Prevent duplicate entries if already present
            if (prev.some((item) => item.id === fullAuditItem.id)) {
              return prev;
            }
            return [fullAuditItem, ...prev];
          });
        }
      )
      .subscribe();

    // Cleanup subscription on unmount to prevent memory leaks
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActivities]);

  // Single deletion with optimistic UI update
  const deleteActivity = useCallback(async (id: string) => {
    setActivities((prev) => prev.filter((item) => item.id !== id));

    try {
      const { error: delError } = await supabase
        .from('audit_logs')
        .delete()
        .eq('id', id);

      if (delError) {
        console.error('Error deleting activity log:', delError.message);
        fetchActivities(false);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exception deleting activity log:', err);
      fetchActivities(false);
      return false;
    }
  }, [fetchActivities]);

  // Batch deletion with optimistic UI update
  const deleteBatchActivities = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return true;

    const idSet = new Set(ids);
    setActivities((prev) => prev.filter((item) => !idSet.has(item.id)));

    try {
      const { error: delError } = await supabase
        .from('audit_logs')
        .delete()
        .in('id', ids);

      if (delError) {
        console.error('Error deleting batch activity logs:', delError.message);
        fetchActivities(false);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exception deleting batch activity logs:', err);
      fetchActivities(false);
      return false;
    }
  }, [fetchActivities]);

  return {
    activities,
    loading,
    refreshing,
    error,
    refetch: fetchActivities,
    handleRefresh,
    deleteActivity,
    deleteBatchActivities,
  };
}
