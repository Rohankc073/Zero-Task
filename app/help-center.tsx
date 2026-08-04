import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { HelpAccordion } from '../src/components/HelpAccordion';
import { ZeroButton } from '../src/components/ZeroButton';
import { useAuth } from '../src/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const helpCenterData = [
  {
    id: '1',
    question: 'How does the role-based approval system work?',
    answer: 'ZeroTask utilizes a strict, tiered hierarchy designed for secure environments. New users cannot instantly access the workspace. When someone registers, their request is routed based on the requested role. Employees must be approved by Managers or Department Heads. Managers must be approved by Department Heads or Founders. Founders have full system oversight. If a request is rejected, that email address is strictly locked out for 24 hours.'
  },
  {
    id: '2',
    question: 'How do I update the status of my assigned tasks?',
    answer: 'You can update the status of your tasks directly from the home screen or your profile by tapping the task card. Once opened, you can change the status from \'To Do\' to \'In Progress\' or \'Completed\', which automatically syncs across the workspace for your managers to review.'
  },
  {
    id: '3',
    question: 'How do the background automations integrate with my tasks?',
    answer: 'Our infrastructure leverages robust n8n backend workflows to automatically sync your operational data. When external conditions are met in our central systems, the backend automatically provisions, updates, or closes tasks within this application. This ensures your project timelines remain perfectly synchronized without requiring manual data entry.'
  },
  {
    id: '4',
    question: 'I am not receiving in-app registration alerts. What should I do?',
    answer: 'First, navigate to your Profile tab and ensure that the "In-App Alerts" and "Push Notifications" toggles are actively switched on. Second, verify your account role; only Founders, Department Heads, and Managers receive routing alerts for new user registrations. If the issue persists, ensure you have granted the ZeroTask application notification permissions within your device\'s native OS settings.'
  },
  {
    id: '5',
    question: 'How do I escalate an issue to the administration?',
    answer: 'If you encounter a critical system error, require a role elevation, or need a project reassigned urgently, please utilize the direct support contact button located at the bottom of this page. Include your exact error code or a detailed description of the workflow blockage.'
  }
];

export default function HelpCenter() {
  const { session } = useAuth();
  const router = useRouter();

  const handleContactSupport = () => {
    const userName = session?.user?.email ? session.user.email.split('@')[0] : 'User';
    // User name from profile would be better but we only have session here, which has email.
    // Wait, the prompt says "fetch the authenticated user's name from the global state or Supabase session".
    const subject = `ZeroTask Internal Support Request - ${userName}`;
    const url = `mailto:support@zerotask.internal?subject=${encodeURIComponent(subject)}`;
    Linking.openURL(url).catch(err => console.error('Error opening email client:', err));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen 
        options={{
          title: 'Help Center',
          headerStyle: { backgroundColor: '#0f141a' },
          headerTintColor: '#e1c37a',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#e1c37a" />
            </TouchableOpacity>
          )
        }} 
      />
      <ScrollView contentContainerStyle={styles.container}>
        
        <View style={styles.introSection}>
          <Text style={styles.introText}>
            Welcome to ZeroTask Support. Browse our frequently asked questions below to understand your workspace, automated workflows, and account permissions.
          </Text>
        </View>

        <View style={styles.faqList}>
          {helpCenterData.map((item) => (
            <HelpAccordion 
              key={item.id} 
              question={item.question} 
              answer={item.answer} 
            />
          ))}
        </View>

        <View style={styles.divider} />
        
        <View style={styles.supportSection}>
          <Text style={styles.supportTitle}>Still need assistance?</Text>
          <ZeroButton 
            title="Contact Administration" 
            onPress={handleContactSupport} 
            className="w-full mt-4"
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  container: {
    padding: 24,
    paddingBottom: 40,
  },
  introSection: {
    paddingVertical: 24,
    marginBottom: 8,
  },
  introText: {
    fontSize: 16,
    color: '#0f141a',
    lineHeight: 24,
    textAlign: 'center',
  },
  faqList: {
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#e1c37a',
    marginVertical: 32,
  },
  supportSection: {
    alignItems: 'center',
  },
  supportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 16,
  },
});
