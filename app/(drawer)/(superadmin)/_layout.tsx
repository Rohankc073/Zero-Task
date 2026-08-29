import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '../../../src/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SuperAdminTabsLayout() {
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
      {/* Operational Dashboard */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'speedometer' : 'speedometer-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />

      {/* Primary Workspace: Companies */}
      <Tabs.Screen
        name="companies"
        options={{
          title: 'Companies',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'business' : 'business-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />

      {/* Secondary Workspace: Founders */}
      <Tabs.Screen
        name="founders"
        options={{
          title: 'Founders',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />

      {/* Tertiary Workspace: Current Users Directory */}
      <Tabs.Screen
        name="current-users"
        options={{
          title: 'Users',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />

      {/* Super Admin Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />

      {/* Hidden Sub-screens (No tab links) */}
      <Tabs.Screen
        name="company/[id]"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="audit" options={{ href: null }} />
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
});

