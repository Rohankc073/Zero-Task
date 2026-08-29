import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../src/theme/tokens';

export default function AlertsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(drawer)/(superadmin)/companies' as any);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="small" color={Colors.primary} />
    </View>
  );
}
