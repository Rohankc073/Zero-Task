import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Layout } from '../../src/theme/tokens';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleReset = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('request_password_reset', {
        p_email: email.trim().toLowerCase(),
      });

      if (error) {
        throw error;
      }

      if (data?.direct) {
        Alert.alert(
          'Notice', 
          data.message,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          'Request Sent', 
          data?.message || 'Password reset requested. Please wait for approval.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }

    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>Enter your email to regain access.</Text>
          </View>

          <Input
            label="Email Address"
            placeholder="Enter your professional email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View style={styles.footer}>
            <Button 
              title="Request Reset" 
              onPress={handleReset} 
              loading={loading} 
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Layout.spacing.xl,
    paddingTop: 40,
  },
  header: {
    marginBottom: 32,
  },
  backBtn: {
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
  },
  footer: {
    marginTop: Layout.spacing.lg,
  },
});
