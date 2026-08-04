import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ZeroButton } from '../../src/components/ZeroButton';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';

export default function DevModeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  // Fallback redirect for unauthorized access
  useEffect(() => {
    if (profile && profile.role !== 'Founder') {
      router.replace('/');
    }
  }, [profile, router]);

  const impersonate = async (email: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: 'zerotask123',
      });

      if (error) throw error;
      
      Alert.alert('Impersonation Successful', `You are now logged in as ${email}.`);
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Impersonation Failed', error.message || 'Could not sign in with dummy account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="build" size={32} color="#0f141a" />
        <Text style={styles.title}>Developer Impersonation Tool</Text>
        <Text style={styles.subtitle}>
          Use these buttons to instantly switch between role tiers for testing purposes.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <ZeroButton
          title="Impersonate Department Head"
          onPress={() => impersonate('depthead@zerotask.internal')}
          loading={loading}
          style={styles.button}
        />
        
        <ZeroButton
          title="Impersonate Manager"
          onPress={() => impersonate('manager@zerotask.internal')}
          loading={loading}
          style={styles.button}
        />
        
        <ZeroButton
          title="Impersonate Employee"
          onPress={() => impersonate('employee@zerotask.internal')}
          loading={loading}
          style={styles.button}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  header: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#e1c37a',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f141a',
    marginTop: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#0f141a',
    opacity: 0.8,
    marginTop: 8,
    textAlign: 'center',
  },
  buttonContainer: {
    padding: 16,
    gap: 16,
  },
  button: {
    marginBottom: 16,
  }
});
