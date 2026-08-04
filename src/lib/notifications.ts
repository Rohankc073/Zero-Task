import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

let Notifications: any = null;
const isExpoGo = Constants.appOwnership === 'expo';

// expo-notifications throws an uncaught error upon import in Expo Go on Android for SDK 53+.
// We dynamically require it only if we're safely allowed to.
if (!isExpoGo || Platform.OS !== 'android') {
  try {
    Notifications = require('expo-notifications');
    // Set up background handler for notifications
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn('Failed to load expo-notifications', e);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  let token;

  if (!Notifications) {
    console.log('Push notifications are not supported in Expo Go on Android.');
    return undefined;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e1c37a',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return undefined;
    }
    // Learn more about projectId: https://docs.expo.dev/push-notifications/push-notifications-setup/#configure-projectid
    token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Expo Push Token:', token);
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
