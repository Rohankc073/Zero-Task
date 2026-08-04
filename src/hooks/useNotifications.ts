import { useEffect, useState } from 'react';
import { ToastAndroid, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';

export function useNotifications() {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session?.user) return;

    // Fetch initial unread count
    const fetchUnreadCount = async () => {
      const { count, error } = await supabase
        .from('in_app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false);

      if (!error && count !== null) {
        setUnreadCount(count);
      }
    };
    fetchUnreadCount();

    // Subscribe to new notifications
    const subscription = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setUnreadCount((prev) => prev + 1);

          // Show an in-app toast or alert (For Android we use ToastAndroid for simplicity)
          if (Platform.OS === 'android') {
            ToastAndroid.showWithGravity(
              `${newNotification.title}: ${newNotification.body}`,
              ToastAndroid.LONG,
              ToastAndroid.TOP
            );
          } else {
            // For iOS, could use a custom toast component or Alert
            // Alert.alert(newNotification.title, newNotification.body);
            console.log('New Notification:', newNotification.title, newNotification.body);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [session?.user?.id]);

  return { unreadCount, setUnreadCount };
}
