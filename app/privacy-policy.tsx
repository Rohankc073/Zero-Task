import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const privacyPolicyData = [
  {
    id: 'intro',
    heading: '1. Introduction & Scope',
    body: 'ZeroTask is a proprietary operational and project management platform. This internal Privacy Policy governs the processing, storage, and internal routing of data generated within the application. Because this platform is deployed strictly for internal team execution without public-facing subscriptions or external tracking, our data practices are solely focused on maintaining workflow integrity, security, and project synchronization.'
  },
  {
    id: 'collection',
    heading: '2. Information We Collect',
    body: 'We collect minimal personal data required for operational security and role-based access control. This includes your professional email address, your designated hierarchical role (Founder, Department Head, Manager, or Employee), and your active session tokens. We also store operational data, including but not limited to: task descriptions, project deadlines, meeting notes, action items, and internal comments. We do not collect granular device telemetry, location data, or advertising identifiers.'
  },
  {
    id: 'automation',
    heading: '3. Infrastructure & Automation Processing',
    body: 'To maintain the high-velocity operational efficiency required by our teams, ZeroTask relies on specialized external automation frameworks. Our core backend utilizes n8n to process, aggregate, and route workflow data securely across our internal databases. By utilizing this platform, you acknowledge that project data and workflow states are parsed through these secure, designated architectural channels to ensure real-time synchronization and automation execution.'
  },
  {
    id: 'security',
    heading: '4. Data Security & Access Controls',
    body: 'Data is strictly siloed and protected by advanced Row Level Security (RLS) policies within our database infrastructure. Access to specific tasks, projects, and user registration requests is strictly governed by your assigned role. We utilize enterprise-grade encryption for data at rest and in transit. This system is designed specifically to meet the stringent data protection expectations of high-performance tech industry operations.'
  },
  {
    id: 'retention',
    heading: '5. Data Retention & Workspace Deletion',
    body: 'Operational data is retained indefinitely to preserve project history, analytics, and audit trails for management review. If your employment or contract is terminated, your authentication access will be immediately revoked by a Founder or Department Head. However, the tasks, comments, and project histories associated with your account will remain in the system to ensure business continuity. If you have questions regarding data governance, please contact administration.'
  }
];

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen 
        options={{
          title: 'Privacy Policy',
          headerStyle: { backgroundColor: '#f7f6f2' },
          headerTintColor: '#0f141a',
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#0f141a" />
            </TouchableOpacity>
          )
        }} 
      />
      
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        
        <Text style={styles.documentHeader}>Internal Privacy & Data Governance</Text>
        <Text style={styles.effectiveDate}>Effective Date: July 30, 2026</Text>

        {privacyPolicyData.map((item) => (
          <View key={item.id} style={styles.sectionContainer}>
            <Text style={styles.heading}>{item.heading}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        ))}

        <View style={styles.endMarkerContainer}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
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
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  documentHeader: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f141a',
    marginBottom: 4,
  },
  effectiveDate: {
    fontSize: 14,
    fontStyle: 'italic',
    color: 'rgba(15, 20, 26, 0.6)',
    marginBottom: 32,
  },
  sectionContainer: {
    marginBottom: 28,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f141a',
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(15, 20, 26, 0.85)',
    textAlign: 'left',
  },
  endMarkerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e1c37a',
  },
});
