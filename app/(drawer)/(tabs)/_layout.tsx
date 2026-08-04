import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useInAppNotifications } from '../../../src/hooks/useInAppNotifications';

export default function TabsLayout() {
  const { session, isLoading, profile } = useAuth();
  const { unreadCount } = useInAppNotifications();

  return (
    <Tabs 
      screenOptions={{
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: '#0f141a',
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarActiveTintColor: '#e1c37a',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Main',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          )
        }} 
      />

      <Tabs.Screen 
        name="tasks" 
        options={{ 
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="chat" 
        options={{ 
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="profile" 
        options={{ 
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="notifications" 
        options={{ 
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#0f141a', color: '#e1c37a' },
        }} 
      />
      
      {/* Hidden Screens inside Tabs to preserve the bottom bar */}
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="approvals" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="notes" options={{ href: null }} />
      <Tabs.Screen name="audit-logs" options={{ href: null }} />
    </Tabs>
  );
}
