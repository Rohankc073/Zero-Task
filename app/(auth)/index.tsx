import React from 'react';
import { Redirect } from 'expo-router';

export default function AuthLandingScreen() {
  return <Redirect href="/(auth)/login" />;
}

