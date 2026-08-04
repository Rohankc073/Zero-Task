import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { ZeroButton } from '../../src/components/ZeroButton';
import { useRouter } from 'expo-router';

export default function PendingApprovalScreen() {
  const { refreshProfile, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRefresh = async () => {
    setLoading(true);
    await refreshProfile();
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: profileData } = await supabase
        .from('users')
        .select('is_approved, role')
        .eq('id', session.user.id)
        .single();
        
      if (profileData) {
        if (profileData.is_approved) {
          Alert.alert('Approved!', 'Your account has been approved. Welcome!');
          router.replace('/(drawer)/(tabs)' as any);
        } else {
          Alert.alert(
            'Status: Pending', 
            `Your account for the role of ${profileData.role} is still waiting for team approval.`
          );
        }
      } else {
        Alert.alert('Error', 'Could not fetch your profile data. Please wait a moment or sign out and back in.');
      }
    } else {
      Alert.alert(
        'Sign In Required', 
        'Your registration is under review. Please check your email for a confirmation link, or sign in to refresh your status.',
        [
          { text: 'Close', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.replace('/(auth)' as any) }
        ]
      );
    }
    
    setLoading(false);
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="time" size={64} color="#e1c37a" />
        </View>
        
        <Text style={styles.title}>Approval Pending</Text>
        
        <Text style={styles.message}>
          Your account has been created for the role of <Text style={styles.bold}>{profile?.role || 'Pending'}</Text>.
        </Text>

        <Text style={styles.message}>
          {profile?.role === 'Employee' && 'Your account is currently pending approval from your Manager or Department Head.'}
          {profile?.role === 'Manager' && 'Your account is currently pending approval from your Department Head or the Founder.'}
          {profile?.role === 'Department Head' && 'Your account is currently pending approval from the Founder.'}
          {(!profile?.role || profile?.role === 'Founder') && 'Your account requires team approval before you can access the system.'}
        </Text>

        <Text style={styles.submessage}>
          Check back later or click the button below to refresh your status.
        </Text>

        <View style={styles.buttonContainer}>
          <ZeroButton 
            title="Check Status" 
            onPress={handleRefresh} 
            loading={loading}
          />
        </View>

        <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out and return to login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#0f141a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#444',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  submessage: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  bold: {
    fontWeight: 'bold',
    color: '#0f141a',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  },
  signOutButton: {
    marginTop: 24,
    padding: 10,
  },
  signOutText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 14,
  }
});
