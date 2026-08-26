import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { InAppNotification } from '../types';

export { InAppNotification };

export function useInAppNotifications() {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      if (data) {
        setNotifications(data as InAppNotification[]);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchNotifications();

    if (!session?.user?.id) return;

    // Subscribe to realtime changes for the current user
    const channelName = `in_app_notifs_${session.user.id}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as InAppNotification, ...prev.filter(n => n.id !== payload.new.id)]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const updated = payload.new as InAppNotification;
          setNotifications((prev) => {
            const exists = prev.some(n => n.id === updated.id);
            if (!exists) return [updated, ...prev];
            return [updated, ...prev.filter(n => n.id !== updated.id)];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          setNotifications((prev) => prev.filter((notif) => notif.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, session?.user?.id]);

  const markAsRead = async (id: string) => {
    try {
      // Optimistically update local state
      setNotifications((prev) =>
        prev.map((notif) => (notif.id === id ? { ...notif, is_read: true } : notif))
      );

      const { error } = await supabase
        .from('in_app_notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error marking notification as read:', err);
      // Optional: rollback local state on failure
    }
  };

  const markAllAsRead = async () => {
    if (!session?.user?.id) return;
    try {
      setNotifications((prev) => prev.map((notif) => ({ ...notif, is_read: true })));

      const { error } = await supabase
        .from('in_app_notifications')
        .update({ is_read: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false);

      if (error) throw error;
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      // Optimistically update local state
      setNotifications((prev) => prev.filter((notif) => notif.id !== id));

      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error deleting notification:', err);
      // Optional: Refetch or rollback state on failure
    }
  };

  const clearAllNotifications = async () => {
    if (!session?.user?.id) return;
    try {
      // Optimistically update local state
      setNotifications([]);

      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('user_id', session.user.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    refetch: fetchNotifications,
  };
}
