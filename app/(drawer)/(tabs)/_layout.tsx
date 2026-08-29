import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useInAppNotifications } from '../../../src/hooks/useInAppNotifications';
import { Colors, Layout, Typography } from '../../../src/theme/tokens';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Center FAB tab button
function CenterTabButton({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={styles.centerFab}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.centerFabInner}>
        <Ionicons name="add" size={28} color={Colors.textInverse} />
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const { session, isLoading, profile } = useAuth();
  const { unreadCount } = useInAppNotifications();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const safeBottom = Platform.OS === 'android' ? Math.max(insets.bottom, 10) : Math.max(insets.bottom, 6);
  const tabPaddingBottom = safeBottom;
  const tabHeight = 54 + safeBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabHeight,
            paddingBottom: tabPaddingBottom,
          }
        ],
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarHideOnKeyboard: true,
      }}
    >
      {/* Dashboard */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* Tasks */}
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'checkbox' : 'checkbox-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* Center Create button */}
      <Tabs.Screen
        name="create"
        options={{
          title: '',
          tabBarButton: (props) => (
            <CenterTabButton
              {...props}
              onPress={() => router.push('/create' as any)}
            />
          ),
        }}
      />

      {/* Chat */}
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* Meetings (Calendar) */}
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Meetings',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* ── Hidden screens (no tab link) ── */}
      <Tabs.Screen name="profile"        options={{ href: null }} />
      <Tabs.Screen name="projects"       options={{ href: null }} />
      <Tabs.Screen name="notifications"  options={{ href: null }} />
      <Tabs.Screen name="approvals"      options={{ href: null }} />
      <Tabs.Screen name="notes"          options={{ href: null }} />
      <Tabs.Screen name="current-users"  options={{ href: null }} />
      <Tabs.Screen name="activity"       options={{ href: null }} />
      <Tabs.Screen name="department"     options={{ href: null }} />
      <Tabs.Screen name="reports"        options={{ href: null }} />
      <Tabs.Screen name="team-access"    options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    elevation: 0,
    shadowOpacity: 0,
    paddingTop: 4,
  },
  tabLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 10,
    marginTop: 1,
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  tabItem: {
    paddingHorizontal: 0,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerFab: {
    top: -18,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  centerFabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
