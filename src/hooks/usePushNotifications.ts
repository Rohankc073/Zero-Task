import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import type * as NotificationsType from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

const Notifications = (() => {
  try {
    return require('expo-notifications') as typeof NotificationsType;
  } catch (error) {
    console.log('Push notifications not available:', error);
    return null;
  }
})();

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export interface PushNotificationState {
  expoPushToken?: NotificationsType.ExpoPushToken;
  notification?: NotificationsType.Notification;
}

export const usePushNotifications = (): PushNotificationState => {
  const { session } = useAuth();
  const router = useRouter();
  const [expoPushToken, setExpoPushToken] = useState<NotificationsType.ExpoPushToken | undefined>();
  const [notification, setNotification] = useState<NotificationsType.Notification | undefined>();

  const notificationListener = useRef<NotificationsType.EventSubscription | null>(null);
  const responseListener = useRef<NotificationsType.EventSubscription | null>(null);

  async function registerForPushNotificationsAsync() {
    if (!Notifications) return undefined;
    let token;
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }

      try {
        token = await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        });
      } catch (err: any) {
        console.log('Push notifications are not supported in Expo Go on Android (requires a custom development build).');
      }
      
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#e1c37a',
      });
    }

    return token;
  }

  useEffect(() => {
    if (!session?.user || !Notifications) return;

    registerForPushNotificationsAsync().then((token) => {
      setExpoPushToken(token);
      
      if (token && session.user.id) {
        // Save token to database in the new user_push_tokens table
        supabase
          .from('user_push_tokens')
          .upsert({ 
            user_id: session.user.id, 
            token: token.data, 
            platform: Platform.OS 
          }, { onConflict: 'user_id,token' })
          .then(({ error }) => {
            if (error) console.error('Error saving push token:', error);
          });
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setNotification(notification);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification response:', response);
      const url = response.notification.request.content.data?.url;
      if (url && typeof url === 'string') {
        router.push(url as any);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [session?.user]);

  return { expoPushToken, notification };
};
