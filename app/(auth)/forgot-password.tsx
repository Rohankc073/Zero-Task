import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { ZeroInput } from '../../src/components/ZeroInput';
import { ZeroButton } from '../../src/components/ZeroButton';

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
      // Hit our RPC to check employee status and log request if needed
      const { data, error } = await supabase.rpc('request_password_reset', {
        p_email: email.trim().toLowerCase(),
      });

      if (error) {
        throw error;
      }

      if (data?.direct) {
        // Not an employee, allow standard Supabase auth reset
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim().toLowerCase()
        );
        if (resetError) throw resetError;
        
        Alert.alert('Success', 'Check your email for the reset link.', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        // It's an employee, manager approval workflow triggered
        Alert.alert(
          'Request Sent', 
          data?.message || 'Password reset requested. Please wait for your Manager to approve.',
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
    <SafeAreaView className="flex-1 bg-[#f7f6f2]">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 40 }}>
          <View className="mb-8">
            <TouchableOpacity onPress={() => router.back()} className="mb-4">
              <Ionicons name="arrow-back" size={24} color="#0f141a" />
            </TouchableOpacity>
            <Text className="text-3xl font-bold text-[#0f141a] tracking-tight mb-2">Reset Password</Text>
            <Text className="text-gray-500 text-base">Enter your email to regain access.</Text>
          </View>

          <ZeroInput
            label="Email Address"
            placeholder="Enter your professional email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View className="mt-6">
            <ZeroButton 
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
