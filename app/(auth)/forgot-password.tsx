import React, { useState } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Colors, Typography, Layout } from '../../src/theme/tokens';
import { PasswordResetService, PasswordResetItem } from '../../src/services/auth/PasswordResetService';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [activeRequest, setActiveRequest] = useState<PasswordResetItem | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultStatus, setResultStatus] = useState<string | null>(null);
  const router = useRouter();

  const handleReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Validation Error', 'Please enter your professional email address.');
      return;
    }

    setLoading(true);
    setResultMessage(null);
    setResultStatus(null);
    setActiveRequest(null);

    try {
      const res = await PasswordResetService.requestPasswordReset(cleanEmail);

      if (res.error) {
        Alert.alert('Request Failed', res.error.message || 'Could not process password reset request.');
        return;
      }

      const data = res.data;
      if (!data) {
        Alert.alert('Error', 'No response received from server.');
        return;
      }

      setResultStatus(data.status);
      setResultMessage(data.message);

      if (data.status === 'SuperAdminExternal') {
        Alert.alert(
          'Administrative Recovery',
          'Super Admin recovery is managed externally. Please contact the Database / Backend Team directly.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Request Submitted',
          data.message,
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process password reset request.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Email Required', 'Please enter your email address to check status.');
      return;
    }

    setCheckingStatus(true);
    try {
      const res = await PasswordResetService.getMyRequestStatus(cleanEmail);
      if (res.error || !res.data) {
        Alert.alert('No Active Request', 'No password reset request found for this email.');
        setActiveRequest(null);
      } else {
        setActiveRequest(res.data);
      }
    } catch (err: any) {
      Alert.alert('Status Check Failed', err.message || 'Could not verify request status.');
    } finally {
      setCheckingStatus(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return Colors.primary;
      case 'Completed':
        return Colors.success;
      case 'Rejected':
        return Colors.danger;
      case 'Expired':
        return Colors.textMuted;
      default:
        return '#d97706'; // Pending amber
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
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Password Recovery</Text>
            <Text style={styles.subtitle}>
              ZeroTask employs hierarchical recovery authorization. Your request will be routed to your designated authority.
            </Text>
          </View>

          {/* Hierarchy Information Box */}
          <View style={styles.hierarchyCard}>
            <View style={styles.hierarchyHeader}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.primary} />
              <Text style={styles.hierarchyTitle}>Recovery Hierarchy</Text>
            </View>
            <Text style={styles.hierarchyText}>
              • <Text style={styles.boldText}>Company Users:</Text> Approved & established by your Company Founder.
            </Text>
            <Text style={styles.hierarchyText}>
              • <Text style={styles.boldText}>Founders:</Text> Approved & established by Super Admin.
            </Text>
            <Text style={styles.hierarchyText}>
              • <Text style={styles.boldText}>Super Admin:</Text> Managed via Database / Backend Team.
            </Text>
          </View>

          <Input
            label="Professional Email Address"
            placeholder="e.g. yourname@company.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View style={styles.actionsContainer}>
            <Button
              title="Request Password Reset"
              onPress={handleReset}
              loading={loading}
            />

            <TouchableOpacity
              style={styles.checkStatusBtn}
              onPress={handleCheckStatus}
              disabled={checkingStatus}
              activeOpacity={0.7}
            >
              {checkingStatus ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="search-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.checkStatusBtnText}>Check Request Status</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Result / Status Card */}
          {resultMessage && (
            <View style={[styles.statusCard, resultStatus === 'SuperAdminExternal' && styles.statusCardAlert]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ionicons
                  name={resultStatus === 'SuperAdminExternal' ? 'alert-circle' : 'information-circle'}
                  size={20}
                  color={resultStatus === 'SuperAdminExternal' ? '#ea580c' : Colors.primary}
                />
                <Text style={styles.statusCardTitle}>
                  {resultStatus === 'SuperAdminExternal' ? 'External Recovery' : 'Request Processed'}
                </Text>
              </View>
              <Text style={styles.statusCardMessage}>{resultMessage}</Text>
            </View>
          )}

          {/* Active Request Details */}
          {activeRequest && (
            <View style={styles.requestDetailCard}>
              <View style={styles.requestDetailHeader}>
                <Text style={styles.requestDetailTitle}>Active Reset Request</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(activeRequest.status) + '1A' }]}>
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(activeRequest.status) }]}>
                    {activeRequest.status}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Email:</Text>
                <Text style={styles.detailValue}>{activeRequest.email}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Requested:</Text>
                <Text style={styles.detailValue}>
                  {new Date(activeRequest.created_at).toLocaleString()}
                </Text>
              </View>
              {activeRequest.rejection_reason && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reason:</Text>
                  <Text style={[styles.detailValue, { color: Colors.danger }]}>
                    {activeRequest.rejection_reason}
                  </Text>
                </View>
              )}

              {activeRequest.status === 'Pending' && (
                <Text style={styles.pendingHint}>
                  Your recovery authority has been notified. Once approved, your new password will be established.
                </Text>
              )}
              {activeRequest.status === 'Completed' && (
                <Text style={[styles.pendingHint, { color: Colors.success }]}>
                  Your password has been reset. You can now log in using your newly assigned password.
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity onPress={() => router.back()} style={styles.returnLoginBtn} activeOpacity={0.7}>
            <Text style={styles.returnLoginText}>Return to Login</Text>
          </TouchableOpacity>
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
    paddingTop: 32,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: {
    marginBottom: 24,
  },
  backBtn: {
    marginBottom: 16,
    alignSelf: 'flex-start',
    padding: 4,
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 28,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  hierarchyCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  hierarchyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  hierarchyTitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  hierarchyText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  boldText: {
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  actionsContainer: {
    marginTop: Layout.spacing.lg,
    gap: 12,
  },
  checkStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '0A',
  },
  checkStatusBtnText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  statusCard: {
    marginTop: 20,
    padding: 14,
    backgroundColor: Colors.primary + '10',
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  statusCardAlert: {
    backgroundColor: '#ea580c10',
    borderColor: '#ea580c30',
  },
  statusCardTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  statusCardMessage: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  requestDetailCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  requestDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  requestDetailTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  pendingHint: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 10,
    lineHeight: 16,
  },
  returnLoginBtn: {
    marginTop: 32,
    alignSelf: 'center',
    padding: 8,
  },
  returnLoginText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
});
