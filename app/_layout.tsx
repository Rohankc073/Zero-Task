import 'react-native-gesture-handler';
import '../global.css';
import React, { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { GamificationProvider } from '../src/context/GamificationContext';
import { OfflineManager } from '../src/lib/OfflineManager';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { View, ActivityIndicator, LogBox } from 'react-native';

LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

const InitialLayout = () => {
  const { session, isLoading, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  
  usePushNotifications();

  useEffect(() => {
    OfflineManager.init();
    if (isLoading) return;

    const inAuthGroup = (segments[0] as string) === '(auth)';

    if (session && profile) {
      if (profile.is_approved === false) {
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
  }, [session, isLoading, profile, segments]);

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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <BottomSheetModalProvider>
          <InitialLayout />
        </BottomSheetModalProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
