import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';

let Notifications: any = null;

const checkIsExpoGo = (): boolean => {
  try {
    if (typeof isRunningInExpoGo === 'function' && isRunningInExpoGo()) {
      return true;
    }
  } catch {}
  try {
    if (Constants.appOwnership === 'expo' || (Constants as any).executionEnvironment === 'storeClient') {
      return true;
    }
  } catch {}
  return false;
};

export const isExpoGo = checkIsExpoGo();

// expo-notifications throws an uncaught error upon import / call in Expo Go on Android for SDK 53+.
// We strictly bypass it when running in Expo Go on Android.
if (!isExpoGo || Platform.OS !== 'android') {
  try {
    Notifications = require('expo-notifications');
    // Set up the global notification handler — controls foreground display behavior.
    if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
  } catch (e) {
    console.warn('[Push] Failed to load expo-notifications:', e);
    Notifications = null;
  }
}

/**
 * Returns the loaded expo-notifications module, or null if unavailable.
 * Use this in hooks/components that need Notifications API access.
 */
export function getNotificationsModule() {
  return Notifications;
}

export interface PushRegistrationResult {
  expoPushToken?: string;
  devicePushToken?: string;
}

/**
 * Registers for push notifications and returns both Expo push token and native device token.
 *
 * This is the SINGLE canonical push token registration function.
 * Do NOT create alternative implementations elsewhere.
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  const result: PushRegistrationResult = {};

  if (!Notifications || (Platform.OS === 'android' && isExpoGo)) {
    console.log('[Push] Push notifications are not supported in Expo Go on Android.');
    return result;
  }

  try {
    // Create/ensure Android notification channel with MAX importance
    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'ZeroTask Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#e1c37a',
        sound: 'default',
      });
    }

    if (Device.isDevice) {
      let finalStatus = 'undetermined';
      if (Notifications.getPermissionsAsync) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        finalStatus = existingStatus;
      }
      if (finalStatus !== 'granted' && Notifications.requestPermissionsAsync) {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('[Push] Notification permission denied.');
        return result;
      }

      // 1. Fetch Expo Push Token (for Expo Push Gateway)
      try {
        if (Notifications.getExpoPushTokenAsync) {
          const projectId = Constants.expoConfig?.extra?.eas?.projectId;
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId,
          });
          result.expoPushToken = tokenData?.data;
          console.log('[Push] Expo Push Token obtained:', result.expoPushToken?.substring(0, 30) + '...');
        }
      } catch (err: any) {
        console.warn('[Push] Failed to get Expo push token:', err?.message || err);
      }

      // 2. Fetch Native Device Token (FCM on Android / APNs on iOS for Direct FCM Dispatch)
      // Only attempted on standalone / production builds, NEVER in Expo Go!
      if (!isExpoGo) {
        try {
          if (Notifications.getDevicePushTokenAsync) {
            const deviceData = await Notifications.getDevicePushTokenAsync();
            if (deviceData?.data && typeof deviceData.data === 'string') {
              const devToken: string = deviceData.data;
              result.devicePushToken = devToken;
              console.log('[Push] Native Device Push Token obtained (' + deviceData.type + '):', devToken.substring(0, 30) + '...');
            }
          }
        } catch (err: any) {
          console.warn('[Push] Failed to get native device token:', err?.message || err);
        }
      }
    } else {
      console.log('[Push] Must use physical device for push notifications.');
    }
  } catch (globalErr) {
    console.warn('[Push] Error in registerForPushNotificationsAsync:', globalErr);
  }

  return result;
}

