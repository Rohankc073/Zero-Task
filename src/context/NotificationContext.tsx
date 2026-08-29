import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { InAppNotification } from '../types';

interface NotificationContextValue {
  notifications: InAppNotification[];
  loading: boolean;
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  refetch: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = session?.user?.id;

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        if (error.message?.includes('JWT issued at future') || error.code === 'PGRST303') {
          // Device clock is slightly ahead of server time: silently retry after 1s
          setTimeout(async () => {
            try {
              const { data: retryData, error: retryErr } = await supabase
                .from('in_app_notifications')
                .select('*')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false });
              if (!retryErr && retryData) {
                setNotifications(retryData as InAppNotification[]);
              }
            } catch {}
          }, 1000);
        } else {
          console.error('Error fetching in_app_notifications:', error.message);
        }
      } else if (data) {
        setNotifications(data as InAppNotification[]);
      }
    } catch (err: any) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();

    if (!userId) return;

    // Realtime channel for instant state syncing across all components
    const channelName = `global_in_app_notifs_${userId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const inserted = payload.new as InAppNotification;
          setNotifications((prev) => [inserted, ...prev.filter((n) => n.id !== inserted.id)]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as InAppNotification;
          setNotifications((prev) => {
            const exists = prev.some((n) => n.id === updated.id);
            if (!exists) return [updated, ...prev];
            return prev.map((n) => (n.id === updated.id ? updated : n));
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
          } else {
            fetchNotifications();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistically update
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, is_read: true } : notif))
    );

    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) {
        console.error('Error marking notification as read in DB:', error.message);
        fetchNotifications();
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;

    setNotifications((prev) => prev.map((notif) => ({ ...notif, is_read: true })));

    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking all notifications as read in DB:', error.message);
        fetchNotifications();
      }
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, [userId, fetchNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== id));

    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting notification in DB:', error.message);
        fetchNotifications();
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  }, [fetchNotifications]);

  const clearAllNotifications = useCallback(async () => {
    if (!userId) return;

    setNotifications([]);

    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('Error clearing notifications in DB:', error.message);
        fetchNotifications();
      }
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  }, [userId, fetchNotifications]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      loading,
      unreadCount,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAllNotifications,
      refetch: fetchNotifications,
    }),
    [
      notifications,
      loading,
      unreadCount,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAllNotifications,
      fetchNotifications,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export function useInAppNotificationsContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useInAppNotificationsContext must be used within a NotificationProvider');
  }
  return context;
}
