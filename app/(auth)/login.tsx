import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { ZeroInput } from '../../src/components/ZeroInput';
import { ZeroButton } from '../../src/components/ZeroButton';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert('Login Failed', error.message);
    }
    // Success will be handled by the onAuthStateChange in AuthContext, which triggers router.replace
    setLoading(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f7f6f2]">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center mb-8">
            <View className="w-[60px] h-[80px] bg-[#0f141a] rounded-2xl items-center justify-center mb-8">
              <Text className="text-[#e1c37a] font-serif font-bold text-4xl">V</Text>
            </View>
            <Text className="text-3xl font-bold text-[#0f141a] tracking-tight mb-2">Welcome Back</Text>
            <Text className="text-gray-500 text-base">Sign in to ZeroTask</Text>
          </View>

          <ZeroInput
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <ZeroInput
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <View className="mt-6">
            <ZeroButton 
              title="Sign In" 
              onPress={handleLogin} 
              loading={loading} 
            />
            <TouchableOpacity 
              onPress={() => router.push('/(auth)/forgot-password')} 
              className="py-4 items-center"
            >
              <Text className="text-[#0f141a] font-semibold text-sm">Forgot Password?</Text>
            </TouchableOpacity>
            <ZeroButton 
              title="Create an Account" 
              variant="outline"
              onPress={() => router.push('/(auth)/register')} 
              disabled={loading}
              style={{ marginTop: 8 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
