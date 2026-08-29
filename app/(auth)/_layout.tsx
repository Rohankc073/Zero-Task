import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f7f6f2' } }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
