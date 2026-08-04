import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DrawerContentScrollView, DrawerItem } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';

function CustomDrawerContent(props: any) {
  const router = useRouter();
  const { profile } = useAuth();
  
  const userRole = profile?.role;
  const isManagement = userRole === 'Founder' || userRole === 'Department Head' || userRole === 'Manager';
  const isFounder = userRole === 'Founder';

  return (
    <View style={{ flex: 1, backgroundColor: '#f7f6f2' }}>
      <View className="bg-[#0f141a] pt-16 pb-8 px-6 rounded-br-3xl">
        <View className="w-16 h-16 rounded-2xl bg-[#e1c37a] items-center justify-center mb-4 shadow-lg">
          <Text className="text-3xl font-serif font-bold text-[#0f141a]">
            {profile?.full_name ? profile.full_name.substring(0,1).toUpperCase() : 'Z'}
          </Text>
        </View>
        <Text className="text-white text-xl font-bold">ZeroTask Workspace</Text>
        <Text className="text-[#e1c37a] text-sm mt-1 font-bold">{userRole || 'Employee'}</Text>
      </View>
      
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 20 }}>
        {/* Custom manual links to the hidden tab screens */}
        <DrawerItem
          label="Activity Feed"
          labelStyle={{ color: '#0f141a', fontWeight: 'bold' }}
          icon={({ color, size }) => <Ionicons name="pulse-outline" size={size} color="#0f141a" />}
          onPress={() => router.push('/activity')}
        />
        <DrawerItem
          label="Calendar"
          labelStyle={{ color: '#0f141a', fontWeight: 'bold' }}
          icon={({ color, size }) => <Ionicons name="calendar-outline" size={size} color="#0f141a" />}
          onPress={() => router.push('/calendar')}
        />
        <DrawerItem
          label="Global Notes"
          labelStyle={{ color: '#0f141a', fontWeight: 'bold' }}
          icon={({ color, size }) => <Ionicons name="document-text-outline" size={size} color="#0f141a" />}
          onPress={() => router.push('/notes' as any)}
        />
        <DrawerItem
          label="Milestones"
          labelStyle={{ color: '#0f141a', fontWeight: 'bold' }}
          icon={({ color, size }) => <Ionicons name="trophy-outline" size={size} color="#0f141a" />}
          onPress={() => router.push('/milestones' as any)}
        />
        {isManagement && (
          <DrawerItem
            label="Approvals"
            labelStyle={{ color: '#0f141a', fontWeight: 'bold' }}
            icon={({ color, size }) => <Ionicons name="checkmark-circle-outline" size={size} color="#0f141a" />}
            onPress={() => router.push('/approvals')}
          />
        )}
        {isManagement && (
          <DrawerItem
            label="Create Task"
            labelStyle={{ color: '#0f141a', fontWeight: 'bold' }}
            icon={({ color, size }) => <Ionicons name="add-circle-outline" size={size} color="#0f141a" />}
            onPress={() => router.push('/create')}
          />
        )}

        
        {isFounder && (
          <>
            <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 16, marginHorizontal: 16 }} />
            <DrawerItem
              label="Dev Mode (Impersonate)"
              labelStyle={{ color: '#0f141a', fontWeight: 'bold' }}
              icon={({ color, size }) => <Ionicons name="build-outline" size={size} color="#0f141a" />}
              onPress={() => router.push('/dev-mode' as any)}
            />
          </>
        )}
      </DrawerContentScrollView>
    </View>
  );
}

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0f141a',
        },
        headerTintColor: '#e1c37a',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        drawerStyle: {
          backgroundColor: '#f7f6f2',
        }
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          title: 'Home',
        }}
      />
    </Drawer>
  );
}
