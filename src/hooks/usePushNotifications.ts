import { useState, useEffect, useRef, useCallback } from 'react';
import type * as NotificationsType from 'expo-notifications';
import { Platform } from 'react-native';
import { NotificationService } from '../services/notifications/NotificationService';
import { useAuth } from '../context/AuthContext';
import * as Haptics from 'expo-haptics';
import { useRouter, useRootNavigationState } from 'expo-router';
import { registerForPushNotificationsAsync, getNotificationsModule } from '../lib/notifications';

// Get the notifications module (may be null in Expo Go on Android)
const Notifications = getNotificationsModule() as typeof NotificationsType | null;

export interface PushNotificationState {
  expoPushToken?: string;
  notification?: NotificationsType.Notification;
}

export const usePushNotifications = (): PushNotificationState => {
  const { session } = useAuth();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] = useState<NotificationsType.Notification | undefined>();

  const notificationListener = useRef<NotificationsType.EventSubscription | null>(null);
  const responseListener = useRef<NotificationsType.EventSubscription | null>(null);
  const tokenListener = useRef<NotificationsType.EventSubscription | null>(null);
  const coldStartHandled = useRef(false);

  // Safely navigate to a notification's target URL
  const navigateToNotification = useCallback((url: string) => {
    if (!url || typeof url !== 'string') return;
    try {
      router.push(url as any);
    } catch (err) {
      console.warn('[Push] Navigation error:', err);
    }
  }, [router]);

  // Register token with backend
  const registerTokenWithBackend = useCallback(async (token: string, platform: string = 'unknown') => {
    if (!token || !session?.user?.id) return;
    try {
      const { error } = await NotificationService.registerPushToken(token, platform);
      if (error) {
        console.error('[Push] Error saving push token:', error);
      } else {
        console.log(`[Push] Token (${platform}) registered with backend successfully.`);
      }
    } catch (err) {
      console.error('[Push] Failed to register token with backend:', err);
    }
  }, [session?.user?.id]);

  // Main setup effect — runs when user session is available
  useEffect(() => {
    if (!session?.user || !Notifications) return;

    // 1. Register for push notifications and store tokens (Expo + FCM)
    registerForPushNotificationsAsync()
      .then((res) => {
        const { expoPushToken: expToken, devicePushToken: devToken } = res || {};
        if (expToken) {
          setExpoPushToken(expToken);
          registerTokenWithBackend(expToken, 'expo');
        }
        if (devToken && devToken !== expToken && typeof devToken === 'string') {
          registerTokenWithBackend(devToken, Platform.OS);
        }
      })
      .catch((err) => {
        console.warn('[Push] Error in registerForPushNotificationsAsync:', err);
      });

    // 2. Foreground notification received listener
    try {
      if (typeof Notifications.addNotificationReceivedListener === 'function') {
        notificationListener.current = Notifications.addNotificationReceivedListener((notif) => {
          setNotification(notif);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        });
      }
    } catch (err) {
      console.warn('[Push] Error registering notification listener:', err);
    }

    // 3. Notification tap/response listener (works while app is running)
    try {
      if (typeof Notifications.addNotificationResponseReceivedListener === 'function') {
        responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
          console.log('[Push] Notification response received:', response.notification?.request?.content?.title);
          const data = response.notification?.request?.content?.data;
          const url = data?.action_url || data?.url;
          if (url && typeof url === 'string') {
            // Wait for navigation to be ready before routing
            if (navigationState?.key) {
              navigateToNotification(url);
            } else {
              // Defer navigation until navigation is ready
              const checkInterval = setInterval(() => {
                if (navigationState?.key) {
                  clearInterval(checkInterval);
                  navigateToNotification(url);
                }
              }, 100);
              // Safety timeout — don't wait forever
              setTimeout(() => clearInterval(checkInterval), 5000);
            }
          }
        });
      }
    } catch (err) {
      console.warn('[Push] Error registering response listener:', err);
    }

    // 4. Push token refresh listener — re-register if token changes
    try {
      if (typeof Notifications.addPushTokenListener === 'function') {
        tokenListener.current = Notifications.addPushTokenListener((tokenEvent) => {
          const newToken = tokenEvent?.data;
          if (newToken && typeof newToken === 'string') {
            console.log('[Push] Token refreshed, re-registering...');
            setExpoPushToken(newToken);
            registerTokenWithBackend(newToken, 'expo');
          }
        });
      }
    } catch (err) {
      console.warn('[Push] Error registering token listener:', err);
    }

    return () => {
      try {
        if (notificationListener.current?.remove) notificationListener.current.remove();
        if (responseListener.current?.remove) responseListener.current.remove();
        if (tokenListener.current?.remove) tokenListener.current.remove();
      } catch {}
    };
  }, [session?.user, registerTokenWithBackend, navigateToNotification, navigationState?.key]);

  // 5. Cold-start handler — recover notification response when app was terminated
  useEffect(() => {
    if (!Notifications || !navigationState?.key || coldStartHandled.current) return;

    coldStartHandled.current = true;

    if (typeof Notifications.getLastNotificationResponseAsync === 'function') {
      Notifications.getLastNotificationResponseAsync()
        .then((response: NotificationsType.NotificationResponse | null) => {
          if (response) {
            const data = response.notification?.request?.content?.data;
            const url = data?.action_url || data?.url;
            if (url && typeof url === 'string') {
              console.log('[Push] Cold-start notification detected, navigating to:', url);
              setTimeout(() => navigateToNotification(url), 300);
            }
          }
        })
        .catch((err: any) => {
          console.warn('[Push] Error reading last notification response:', err);
        });
    }
  }, [navigationState?.key, navigateToNotification]);

  return { expoPushToken, notification };
};
