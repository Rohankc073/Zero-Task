import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from './AuthContext';
import { InAppNotification } from '../types';
import { NotificationService } from '../services/notifications/NotificationService';
import { Colors, Typography, Layout } from '../theme/tokens';



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
  const router = useRouter();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastNotif, setToastNotif] = useState<InAppNotification | null>(null);
  
  const slideAnim = useRef(new Animated.Value(-100)).current;

  const userId = session?.user?.id;

  const isAuthError = (err: any): boolean => {
    if (!err) return false;
    const msg = String(err.message || err || '').toLowerCase();
    const code = String(err.code || '');
    const status = err.status;
    return (
      status === 401 ||
      status === 403 ||
      code === '401' ||
      code === '403' ||
      code === 'HTTP_401' ||
      code === 'HTTP_403' ||
      code === 'NETWORK_ERROR' ||
      code === 'ERR_NETWORK' ||
      msg.includes('credentials') ||
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('not authenticated') ||
      msg.includes('http 401') ||
      msg.includes('fetch failed') ||
      msg.includes('connectexception') ||
      msg.includes('network error')
    );
  };

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await NotificationService.getNotifications({ limit: 100 });

      if (error) {
        if (!isAuthError(error)) {
          console.error('Error fetching in_app_notifications:', error.message);
        }
      } else if (data) {
        setNotifications(data as InAppNotification[]);
      }
    } catch (err: any) {
      if (!isAuthError(err)) {
        console.error('Error fetching notifications:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setToastNotif(null);
    });
  }, [slideAnim]);

  const showToast = useCallback((notif: InAppNotification) => {
    // Clear any existing toast auto-dismiss timer so rapid toasts remain visible ~4-5s
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToastNotif(notif);
    Animated.spring(slideAnim, {
      toValue: Platform.OS === 'ios' ? 50 : 20,
      useNativeDriver: true,
      tension: 40,
      friction: 7,
    }).start();

    toastTimerRef.current = setTimeout(() => {
      dismissToast();
    }, 4500);
  }, [slideAnim, dismissToast]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    fetchNotifications();

    if (!userId) return;

    // Subscribe to real-time notification events via WebSocket
    const unsubscribe = NotificationService.subscribeToNotifications((newNotif) => {
      const inserted = newNotif as InAppNotification;
      // Client-side guard: verify the notification is strictly for current authenticated user
      if (inserted.user_id && inserted.user_id !== userId) {
        return;
      }
      setNotifications((prev) => [inserted, ...prev.filter((n) => n.id !== inserted.id)]);
      showToast(inserted);
    });

    return () => {
      unsubscribe();
    };
  }, [userId, fetchNotifications, showToast]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, is_read: true } : notif))
    );

    try {
      const { error } = await NotificationService.markAsRead(id);

      if (error && !isAuthError(error)) {
        console.error('Error marking notification as read in DB:', error.message);
        fetchNotifications();
      }
    } catch (err: any) {
      if (!isAuthError(err)) {
        console.error('Error marking notification as read:', err);
      }
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;

    setNotifications((prev) => prev.map((notif) => ({ ...notif, is_read: true })));

    try {
      const { error } = await NotificationService.markAllAsRead();

      if (error && !isAuthError(error)) {
        console.error('Error marking all notifications as read in DB:', error.message);
        fetchNotifications();
      }
    } catch (err: any) {
      if (!isAuthError(err)) {
        console.error('Error marking all as read:', err);
      }
    }
  }, [userId, fetchNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== id));

    try {
      const { error } = await NotificationService.deleteNotification(id);

      if (error && !isAuthError(error)) {
        console.error('Error deleting notification in DB:', error.message);
        fetchNotifications();
      }
    } catch (err: any) {
      if (!isAuthError(err)) {
        console.error('Error deleting notification:', err);
      }
    }
  }, [fetchNotifications]);

  const clearAllNotifications = useCallback(async () => {
    if (!userId) return;

    setNotifications([]);

    try {
      const { error } = await NotificationService.clearAllNotifications();

      if (error && !isAuthError(error)) {
        console.error('Error clearing notifications in DB:', error.message);
        fetchNotifications();
      }
    } catch (err: any) {
      if (!isAuthError(err)) {
        console.error('Error clearing notifications:', err);
      }
    }
  }, [userId, fetchNotifications]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  const handleToastPress = useCallback(() => {
    if (toastNotif) {
      markAsRead(toastNotif.id);
      dismissToast();
      const target = toastNotif.action_url || (toastNotif.type === 'chat' ? '/(drawer)/(tabs)/chat' : '/(drawer)/(tabs)/notifications');
      router.push(target as any);
    }
  }, [toastNotif, markAsRead, dismissToast, router]);

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

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {toastNotif && (
        <Animated.View style={[toastStyles.toastContainer, { transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity style={toastStyles.toastCard} onPress={handleToastPress} activeOpacity={0.9}>
            <View style={toastStyles.iconCircle}>
              <Ionicons
                name={toastNotif.type === 'chat' ? 'chatbubble-ellipses' : 'notifications'}
                size={20}
                color="#FFFFFF"
              />
            </View>
            <View style={toastStyles.textContainer}>
              <Text style={toastStyles.titleText} numberOfLines={1}>{toastNotif.title}</Text>
              <Text style={toastStyles.messageText} numberOfLines={2}>
                {toastNotif.message || toastNotif.body || 'New notification received'}
              </Text>
            </View>
            <TouchableOpacity style={toastStyles.closeBtn} onPress={dismissToast}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}
    </NotificationContext.Provider>
  );
};

export function useInAppNotificationsContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useInAppNotificationsContext must be used within a NotificationProvider');
  }
  return context;
}

const toastStyles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 999999,
    elevation: 999,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: Layout.radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    ...Layout.shadow.modal,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: '#F8FAFC',
  },
  messageText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    marginLeft: 8,
  },
});
