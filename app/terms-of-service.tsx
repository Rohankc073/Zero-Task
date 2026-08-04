import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ZeroButton } from '../src/components/ZeroButton';

const termsOfServiceData = [
  {
    id: '1',
    heading: '1. Acceptance & Internal Scope',
    body: 'These Internal Terms of Service ("Terms") govern your access to and use of the ZeroTask platform. By submitting a registration request and subsequently accessing the workspace, you agree to be bound by these Terms. ZeroTask is exclusively deployed as an internal operational tool for designated team members and authorized personnel. This platform is not intended for public commercial use, and your access is contingent upon your continued employment, contract status, or explicit authorization by the platform Founders or Department Heads.'
  },
  {
    id: '2',
    heading: '2. Zero-Cost Infrastructure & Commercial Use',
    body: 'ZeroTask is provided to authorized internal personnel entirely free of charge. There are no in-app purchases, recurring subscription tiers, or hidden paywalls within this mobile application. You are strictly prohibited from attempting to resell, sublicense, or otherwise commercialize access to this platform or its underlying automation infrastructure. All intellectual property, workflow architectures, and project data remain the exclusive property of the organization.'
  },
  {
    id: '3',
    heading: '3. Role-Based Access & Registration Governance',
    body: 'Access to ZeroTask is governed by a strict, tiered hierarchy: Founder, Department Head, Manager, and Employee. You agree to accurately request the role assigned to your real-world organizational position. Registration requests are subject to manual review by authorized management. If your registration request is rejected by administration, your email address will be subjected to an automatic 24-hour system lockout. You agree not to attempt to circumvent this security measure by utilizing alternative email addresses or submitting automated requests.'
  },
  {
    id: '4',
    heading: '4. Automation Infrastructure',
    body: 'ZeroTask relies heavily on interconnected backend systems to maintain operational velocity. By utilizing this platform, you acknowledge and agree that your tasks, project statuses, and internal communications may be processed, routed, and triggered via n8n automation workflows.'
  },
  {
    id: '5',
    heading: '5. Account Suspension & Termination',
    body: 'Founders and Department Heads reserve the right to suspend, demote, or permanently terminate your access to the ZeroTask platform at any time, with or without prior notice, for conduct that violates these Terms or compromises the security of the operational environment. Upon termination, you will immediately lose access to the platform, but any tasks, comments, and project histories generated during your tenure will be retained indefinitely to ensure uninterrupted business continuity.'
  },
  {
    id: '6',
    heading: '6. Limitation of Liability',
    body: 'To the maximum extent permitted by applicable law, the organization and platform administrators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses, resulting from your access to or inability to access the ZeroTask platform, or any conduct or content of any third party on the platform.'
  }
];

export default function TermsOfService() {
  const router = useRouter();
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen 
        options={{
          title: 'Terms of Service',
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
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.documentHeader}>Internal Terms of Service</Text>
        <Text style={styles.effectiveDate}>Last Updated: July 30, 2026</Text>

        {termsOfServiceData.map((item) => (
          <View key={item.id} style={styles.sectionContainer}>
            <Text style={styles.heading}>{item.heading}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        <ZeroButton
          title={hasAcknowledged ? "Terms Acknowledged" : "I Acknowledge These Terms"}
          onPress={() => setHasAcknowledged(true)}
          disabled={hasAcknowledged}
          style={{ backgroundColor: hasAcknowledged ? 'rgba(15, 20, 26, 0.5)' : '#0f141a' }}
          textStyle={{ color: hasAcknowledged ? '#f7f6f2' : '#e1c37a' }}
          className="w-full"
        />

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
    paddingTop: 32,
    paddingBottom: 48,
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
    marginBottom: 40,
  },
  sectionContainer: {
    marginBottom: 32,
  },
  heading: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: 'rgba(15, 20, 26, 0.85)',
    textAlign: 'left',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(15, 20, 26, 0.1)',
    marginVertical: 32,
  }
});
