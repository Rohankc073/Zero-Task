import 'react-native-gesture-handler';
import '../global.css';
import React, { useEffect } from 'react';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { GamificationProvider } from '../src/context/GamificationContext';
import { OfflineManager } from '../src/lib/OfflineManager';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { useFonts } from 'expo-font';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'Cannot connect to Expo CLI',
]);

const InitialLayout = () => {
  const { session, isLoading, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  
  usePushNotifications();

  useEffect(() => {
    OfflineManager.init();
    if (isLoading || !navigationState?.key) return;

    const inAuthGroup = (segments[0] as string) === '(auth)';

    if (session && profile) {
      if (profile.is_approved === false && profile.role !== 'Founder') {
        // Allow them to stay on register to see the success modal, or pending screen
        if (segments[1] !== 'pending' && segments[1] !== 'register') {
          router.replace('/(auth)/pending' as any);
        }
      } else if (profile.role === 'Founder' && !profile.onboarding_completed) {
        if ((segments[1] as string) !== 'onboarding') {
          router.replace('/(auth)/onboarding' as any);
        }
      } else {
        // Approved users go straight to the app, but only if they are not already in it
        if (inAuthGroup || (segments.length as number) === 0) {
          router.replace('/(drawer)/(tabs)' as any);
        }
      }
    } else if (!session && !inAuthGroup) {
      // Redirect to landing if unauthenticated and trying to access app
      router.replace('/(auth)' as any);
    }
  }, [session, isLoading, profile, segments, navigationState?.key]);

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  return (
    <GamificationProvider>
      <Slot />
    </GamificationProvider>
  );
};

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationProvider } from '../src/context/NotificationContext';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    JetBrainsMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NotificationProvider>
            <BottomSheetModalProvider>
              <InitialLayout />
            </BottomSheetModalProvider>
          </NotificationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
