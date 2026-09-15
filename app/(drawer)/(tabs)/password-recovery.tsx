import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { isFounder, isSuperAdmin } from '../../../src/utils/permissions';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import {
  PasswordResetService,
  PasswordResetItem,
} from '../../../src/services/auth/PasswordResetService';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Avatar } from '../../../src/components/ui/Avatar';

type StatusFilter = 'Pending' | 'Approved' | 'Completed' | 'Rejected';

export default function PasswordRecoveryScreen() {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);
  const router = useRouter();
  const { profile } = useAuth();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Pending');
  const [items, setItems] = useState<PasswordResetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Review & Reset Modal
  const [selectedItem, setSelectedItem] = useState<PasswordResetItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Reject reason
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Access validation: Only Founders and Super Admins
  useEffect(() => {
    if (profile && !isFounder(profile) && !isSuperAdmin(profile)) {
      Alert.alert('Access Denied', 'Only authorized administrators can access password recovery.');
      router.replace('/(drawer)/(tabs)/tasks');
    }
  }, [profile, router]);

  const loadRequests = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const res = await PasswordResetService.listRequests(statusFilter);
      if (res.data) {
        setItems(res.data);
      }
    } catch (err: any) {
      console.error('Error loading password reset requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const pendingCount = items.filter((i) => i.status === 'Pending').length;

  const handleOpenReview = (item: PasswordResetItem) => {
    setSelectedItem(item);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setModalVisible(true);
  };

  const handleCompleteReset = async () => {
    if (!selectedItem) return;

    if (!newPassword.trim()) {
      Alert.alert('Validation Error', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Password Policy', 'Password must be at least 8 characters in length.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }

    Alert.alert(
      'Confirm Password Reset',
      `Establish new password for ${selectedItem.requester_name || selectedItem.email}?\n\nAll existing sessions will be revoked immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Reset',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const res = await PasswordResetService.completeReset(
                selectedItem.id,
                newPassword.trim()
              );

              if (res.error) {
                Alert.alert('Reset Failed', res.error.message || 'Could not complete password reset.');
                return;
              }

              Alert.alert('Success', 'Password reset completed successfully. All prior sessions have been revoked.');
              setModalVisible(false);
              loadRequests();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to complete reset.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = async () => {
    if (!selectedItem) return;

    setProcessing(true);
    try {
      const res = await PasswordResetService.rejectRequest(
        selectedItem.id,
        rejectReason.trim() || undefined
      );

      if (res.error) {
        Alert.alert('Reject Failed', res.error.message || 'Could not reject request.');
        return;
      }

      Alert.alert('Request Rejected', 'The password reset request has been rejected.');
      setRejectModalVisible(false);
      setModalVisible(false);
      setRejectReason('');
      loadRequests();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reject request.');
    } finally {
      setProcessing(false);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      {/* Status Filter Tabs */}
      <View style={styles.tabsContainer}>
        {(['Pending', 'Approved', 'Completed', 'Rejected'] as StatusFilter[]).map((tab) => {
          const isActive = statusFilter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setStatusFilter(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
              {tab === 'Pending' && pendingCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Request List */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRequests(); }} />}
      >
        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading recovery requests...</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="shield-checkmark-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No {statusFilter.toLowerCase()} requests</Text>
            <Text style={styles.emptySubtitle}>
              {statusFilter === 'Pending'
                ? 'All password reset requests have been processed.'
                : `No requests currently marked as ${statusFilter.toLowerCase()}.`}
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.requestCard}>
              <View style={styles.cardHeader}>
                <View style={styles.userInfoRow}>
                  <Avatar name={item.requester_name || item.email} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.userName}>{item.requester_name || 'Team Member'}</Text>
                    <Text style={styles.userRole}>
                      {item.requester_role || 'User'}
                      {item.department_name ? ` · ${item.department_name}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={[styles.statusPill, { backgroundColor: getStatusColor(item.status) + '1A' }]}>
                  <Text style={[styles.statusPillText, { color: getStatusColor(item.status) }]}>
                    {item.status}
                  </Text>
                </View>
              </View>

              <View style={styles.cardMetaRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="mail-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.metaEmail}>{item.email}</Text>
                </View>
                <Text style={styles.metaDate}>
                  {new Date(item.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>

              {item.rejection_reason && (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonLabel}>Rejection Reason:</Text>
                  <Text style={styles.reasonText}>{item.rejection_reason}</Text>
                </View>
              )}

              {/* Action CTA */}
              {(item.status === 'Pending' || item.status === 'Approved') && (
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.reviewBtn}
                    onPress={() => handleOpenReview(item)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="key-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.reviewBtnText}>Review & Set Password</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Review & Password Establishment Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalContainer, { paddingTop: safeTop }]}>
          <ZeroTaskHeader
            title="Password Recovery Review"
            showClose
            onClose={() => setModalVisible(false)}
            showDrawer={false}
          />

          {selectedItem && (
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ padding: 20 }}>
              {/* User Identity Card */}
              <View style={styles.identityCard}>
                <Avatar name={selectedItem.requester_name || selectedItem.email} size={48} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.identityName}>{selectedItem.requester_name || 'Team Member'}</Text>
                  <Text style={styles.identityRole}>
                    {selectedItem.requester_role}
                    {selectedItem.department_name ? ` · ${selectedItem.department_name}` : ''}
                  </Text>
                  <Text style={styles.identityEmail}>{selectedItem.email}</Text>
                </View>
              </View>

              {/* Security Warning Notice */}
              <View style={styles.warningNotice}>
                <Ionicons name="warning-outline" size={20} color="#ea580c" />
                <Text style={styles.warningText}>
                  Setting a new password will immediately revoke all existing sessions, tokens, and access on all devices for this user.
                </Text>
              </View>

              {/* Password Setting Form */}
              <Text style={styles.formSectionTitle}>Establish New Password</Text>

              <Text style={styles.inputLabel}>New Password (Min. 8 characters)</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter secure temporary password"
                  placeholderTextColor={Colors.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Confirm New Password</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Re-enter new password"
                  placeholderTextColor={Colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.securityNote}>
                Passwords are never stored in plaintext and are hashed via bcrypt server-side before persisting.
              </Text>

              {/* Action Buttons */}
              <View style={styles.modalActionButtons}>
                <TouchableOpacity
                  style={styles.completeBtn}
                  onPress={handleCompleteReset}
                  disabled={processing}
                  activeOpacity={0.8}
                >
                  {processing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.completeBtnText}>Approve & Set Password</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => setRejectModalVisible(true)}
                  disabled={processing}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close-circle-outline" size={18} color={Colors.danger} style={{ marginRight: 6 }} />
                  <Text style={styles.rejectBtnText}>Reject Request</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Rejection Reason Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={styles.rejectModalOverlay}>
          <View style={styles.rejectModalContent}>
            <Text style={styles.rejectModalTitle}>Reject Reset Request</Text>
            <Text style={styles.rejectModalSubtitle}>Provide an optional reason for the rejection:</Text>
            <TextInput
              style={styles.rejectInput}
              placeholder="e.g. Unverified identity, Duplicate request..."
              placeholderTextColor={Colors.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.rejectModalActions}>
              <TouchableOpacity
                style={styles.rejectCancelBtn}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.rejectCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectConfirmBtn}
                onPress={handleReject}
                disabled={processing}
              >
                <Text style={styles.rejectConfirmText}>Confirm Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  tabBadge: {
    backgroundColor: '#ea580c',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  requestCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  userRole: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  metaEmail: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
  },
  metaDate: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  reasonBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 4,
  },
  reasonLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.danger,
  },
  reasonText: {
    fontSize: 12,
    color: Colors.danger,
    marginTop: 2,
  },
  cardActions: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
  },
  reviewBtnText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: '#fff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.canvas,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  modalScroll: {
    flex: 1,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  identityName: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  identityRole: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
    marginTop: 2,
  },
  identityEmail: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  warningNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff7ed',
    padding: 12,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: '#ffedd5',
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: '#9a3412',
    lineHeight: 16,
  },
  formSectionTitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.regular,
  },
  eyeBtn: {
    padding: 6,
  },
  securityNote: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    lineHeight: 15,
    marginBottom: 24,
  },
  modalActionButtons: {
    gap: 10,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Layout.radius.md,
  },
  completeBtnText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
  },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    paddingVertical: 12,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  rejectBtnText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.danger,
  },
  rejectModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rejectModalContent: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: 20,
  },
  rejectModalTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  rejectModalSubtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  rejectInput: {
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 13,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  rejectModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rejectCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Layout.radius.sm,
  },
  rejectCancelText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  rejectConfirmBtn: {
    backgroundColor: Colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Layout.radius.sm,
  },
  rejectConfirmText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
  },
});
