import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { HelpAccordion } from '../src/components/HelpAccordion';
import { ZeroButton } from '../src/components/ZeroButton';
import { useAuth } from '../src/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const helpCenterData = [
  // GETTING STARTED
  {
    id: 'intro-1',
    question: 'What is ZeroTask?',
    answer: 'ZeroTask is your internal workspace for tracking execution, managing projects, and communicating with your department. It keeps everyone aligned on what needs to be done right now.'
  },
  {
    id: 'intro-2',
    question: 'How do I navigate the app?',
    answer: 'At the bottom of your screen, you have five main tabs: Home (your dashboard and Focus Mode), Tasks (your complete task list), Chat (for team communication), Calendar (for your schedule), and Profile (for your account settings).'
  },
  
  // TASKS
  {
    id: 'tasks-1',
    question: 'How do I create and assign tasks?',
    answer: 'Tap the "+" button on the Tasks screen. You can set a title, description, priority, and deadline. When assigning the task, you can select one or multiple people from your department or organization. Everyone assigned will see the task in their own list.'
  },
  {
    id: 'tasks-2',
    question: 'How do I track task progress?',
    answer: 'Open any task to view its details. You can update the status between "To Do", "In Progress", and "Done". You can also leave comments or attach files. If you attach a file, only you (and Founders) have permission to delete it.'
  },

  // ASSIGNMENT & ROLES
  {
    id: 'roles-1',
    question: 'How do assignment permissions work?',
    answer: 'ZeroTask uses a strict hierarchy. Founders can assign tasks to anyone. Department Heads can assign tasks to anyone except Founders. Managers can assign tasks to Employees within their department. Employees focus on executing their assigned work.'
  },
  {
    id: 'roles-2',
    question: 'Why can\'t I assign a task to a specific person?',
    answer: 'The assignment list automatically groups users by department and filters out people you do not have permission to assign work to. For example, a Manager cannot assign work to a Department Head or Founder.'
  },

  // CHAT
  {
    id: 'chat-1',
    question: 'How does the Chat system work?',
    answer: 'There are two main chat channels: General Chat (visible to the entire organization) and Department Chat. Your Department Chat is secure and only visible to members of your specific department and Founders.'
  },

  // ALERTS
  {
    id: 'alerts-1',
    question: 'What do the in-app alerts mean?',
    answer: 'The app automatically sends you an alert when someone assigns a task to you. You might also see banner alerts on your dashboard for pending approvals if you are a manager or above.'
  },

  // PROJECTS & MILESTONES
  {
    id: 'projects-1',
    question: 'What are Projects and Milestones?',
    answer: 'Projects group related tasks together. A task can belong to a project and be associated with a specific milestone. This helps managers track overall completion progress.'
  },

  // PROFILE
  {
    id: 'profile-1',
    question: 'How do I manage my account?',
    answer: 'Navigate to the Profile tab. From there, you can view your assigned role and department, edit your display name, change your password, or securely sign out of your account.'
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
            Welcome to ZeroTask Support. Browse our frequently asked questions below to learn how to use the app, manage tasks, and communicate with your team.
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
