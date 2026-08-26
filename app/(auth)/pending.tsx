import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/ui/Button';
import { useRouter } from 'expo-router';
import { Colors, Typography, Layout } from '../../src/theme/tokens';

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
          <Ionicons name="time-outline" size={48} color={Colors.primary} />
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
          <Button 
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
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.spacing.xl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1.5,
    borderColor: Colors.borderDefault,
    ...Layout.shadow.card,
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 28,
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  submessage: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  bold: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
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
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    textDecorationLine: 'underline',
  }
});
