import 'react-native-gesture-handler';
import '../global.css';
import React, { useEffect } from 'react';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { GamificationProvider } from '../src/context/GamificationContext';
import { OfflineManager } from '../src/lib/OfflineManager';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { TaskDraftService } from '../src/services/tasks/TaskDraftService';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { useFonts } from 'expo-font';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const fullMsg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a || ''))).join(' ');
  const lower = fullMsg.toLowerCase();
  if (
    fullMsg.includes("Can't perform a React state update on a component") ||
    lower.includes("connectexception") ||
    lower.includes("fetch failed") ||
    lower.includes("network request failed") ||
    lower.includes("bad gateway") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("econnrefused") ||
    lower.includes("network_error") ||
    fullMsg.includes("Error fetching users") ||
    fullMsg.includes("Error fetching companies") ||
    fullMsg.includes("Error fetching eligible assignees") ||
    fullMsg.includes("fetchVoiceNotes notice") ||
    fullMsg.includes("Encountered two children with the same key")
  ) {
    return;
  }
  originalConsoleError(...args);
};

LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'Cannot connect to Expo CLI',
  "Can't perform a React state update on a component that hasn't mounted yet",
  'Clock sync warning',
  'JWT issued at future',
  'setLayoutAnimationEnabledExperimental is currently a no-op',
  'Push notifications are not supported in Expo Go',
  'Refresh token expired or revoked',
  'Could not validate credentials',
  'Error fetching in_app_notifications',
  'Error fetching users',
  'Error fetching companies for selector',
  'Error fetching companies',
  'Error fetching eligible assignees',
  '[CreateTaskModal] Error fetching eligible assignees',
  'fetchVoiceNotes notice',
  'ConnectException',
  'fetch failed',
  'Bad Gateway',
  '502: Bad Gateway',
  'HTTP 502',
  'HTTP_502',
  '[SuperAdmin Dashboard]',
  'Not authenticated',
  'Encountered two children with the same key',
]);

const InitialLayout = () => {
  const { session, isLoading, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  
  usePushNotifications();

  useEffect(() => {
    OfflineManager.init();
    TaskDraftService.clearAllUserDrafts().catch(() => {});
    if (isLoading || !navigationState?.key) return;

    const inAuthGroup = (segments[0] as string) === '(auth)';

    if (session && profile) {
      if (profile.role === 'Super Admin') {
        const isInTabs = (segments[0] as string) === '(drawer)' && (segments[1] as string) === '(tabs)';
        
        if (inAuthGroup || (segments.length as number) === 0) {
          router.replace('/(drawer)/(superadmin)/dashboard' as any);
        } else if (isInTabs) {
          const tabRoute = segments[2] as string;
          if (tabRoute === 'profile') {
            router.replace('/(drawer)/(superadmin)/profile' as any);
          } else if (tabRoute === 'approvals' || tabRoute === 'activity' || tabRoute === 'index') {
            router.replace('/(drawer)/(superadmin)/dashboard' as any);
          }
          // Allow other tabs like tasks, calendar, chat, notes, reports
        }
      } else if (profile.is_approved === false && profile.role !== 'Founder') {
        // Allow them to stay on the pending screen
        if (segments[1] !== 'pending') {
          router.replace('/(auth)/pending' as any);
        }
      } else {
        // Approved users go straight to the app, but only if they are not already in it
        if (inAuthGroup || (segments.length as number) === 0) {
          router.replace('/(drawer)/(tabs)' as any);
        }
      }
    } else if (!session && !inAuthGroup) {
      // Redirect directly to login if unauthenticated
      router.replace('/(auth)/login' as any);
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
      SplashScreen.hideAsync().catch(() => {});
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
