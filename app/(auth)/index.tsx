import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ZeroButton } from '../../src/components/ZeroButton';

export default function AuthLandingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>Z</Text>
          </View>
          <Text style={styles.title}>ZeroTask</Text>
          <Text style={styles.subtitle}>Enterprise Execution Engine</Text>
        </View>

        <View style={styles.actionContainer}>
          <ZeroButton 
            title="Create Account" 
            onPress={() => router.push('/(auth)/register')}
            style={styles.primaryButton}
          />
          <ZeroButton 
            title="Already have an account? Log In" 
            variant="outline"
            onPress={() => router.push('/(auth)/login')}
            style={styles.secondaryButton}
          />
        </View>
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
  logoContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  logoBox: {
    width: 80,
    height: 100,
    backgroundColor: '#0f141a',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#0f141a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  logoText: {
    color: '#e1c37a',
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'serif',
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: '#0f141a',
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  actionContainer: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 20,
  },
  primaryButton: {
    marginBottom: 16,
  },
  secondaryButton: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
});
