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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { format } from 'date-fns';

import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { isFounder, isSuperAdmin, isExecutiveOrAdmin, canAccessApprovals } from '../../../src/utils/permissions';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import {
  ApprovalService,
  UnifiedApprovalItem,
  ApprovalStatusTab,
  ApprovalCategory,
} from '../../../src/services/approvals/ApprovalService';
import { ApprovalDetailModal } from '../../../src/components/approvals/ApprovalDetailModal';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';

export default function ApprovalsScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();

  const [statusTab, setStatusTab] = useState<ApprovalStatusTab>('pending');
  const [categoryFilter, setCategoryFilter] = useState<ApprovalCategory>('all');
  const [items, setItems] = useState<UnifiedApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected item for detailed modal
  const [selectedItem, setSelectedItem] = useState<UnifiedApprovalItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Password reset modal state
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [activePasswordItem, setActivePasswordItem] = useState<UnifiedApprovalItem | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  // Access validation: Employees have no approval inbox
  useEffect(() => {
    if (profile && profile.role === 'Employee') {
      router.replace('/');
    }
  }, [profile, router]);

  const loadApprovals = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const data = await ApprovalService.fetchApprovalInbox(profile, statusTab);
      setItems(data);
    } catch (err: any) {
      console.error('Error loading approval inbox:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, statusTab]);

  useFocusEffect(
    useCallback(() => {
      loadApprovals();
    }, [loadApprovals])
  );

  // Real-time Postgres subscriptions for instant multi-approver updates
  useEffect(() => {
    const channel = supabase
      .channel('approval_center_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_approvals' }, () => {
        loadApprovals();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phone_change_requests' }, () => {
        loadApprovals();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => {
        loadApprovals();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'password_resets' }, () => {
        loadApprovals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadApprovals]);

  const onRefresh = () => {
    setRefreshing(true);
    loadApprovals();
  };

  // Filter items based on active category
  const filteredItems = items.filter((item) => {
    if (categoryFilter === 'all') return true;
    return item.category === categoryFilter;
  });

  // Calculate counts per category
  const categoryCounts = {
    all: items.length,
    meetings: items.filter((i) => i.category === 'meetings').length,
    phones: items.filter((i) => i.category === 'phones').length,
    tasks: items.filter((i) => i.category === 'tasks').length,
    access: items.filter((i) => i.category === 'access').length,
  };

  const handleQuickApprove = (item: UnifiedApprovalItem) => {
    Alert.alert(
      'Approve Request',
      `Approve this ${item.type === 'meeting' ? 'meeting request' : item.type === 'phone' ? 'phone number change' : 'request'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setLoading(true);
            const res = await ApprovalService.processDecision(item, 'Approved');
            if (res.success) {
              Alert.alert('Approved', res.message || 'Request approved successfully.');
              loadApprovals();
            } else {
              Alert.alert('Error', res.error || 'Failed to approve request.');
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleQuickReject = (item: UnifiedApprovalItem) => {
    setSelectedItem(item);
    setDetailModalVisible(true);
  };

  const handlePasswordSubmit = async () => {
    if (!tempPassword || tempPassword.length < 7) {
      Alert.alert('Invalid Password', 'Temporary password must be at least 7 characters.');
      return;
    }
    if (!activePasswordItem) return;

    setSubmittingPassword(true);
    try {
      const { error } = await supabase.rpc('manager_reset_employee_password', {
        p_request_id: activePasswordItem.id,
        p_new_password: tempPassword,
      });
      if (error) throw error;

      Alert.alert('Password Updated', 'Temporary password has been set. Share it securely with the team member.');
      setPasswordModalVisible(false);
      setTempPassword('');
      setActivePasswordItem(null);
      loadApprovals();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update temporary password.');
    } finally {
      setSubmittingPassword(false);
    }
  };

  const renderApprovalCard = ({ item }: { item: UnifiedApprovalItem }) => {
    const isPending = statusTab === 'pending';
    const isMeeting = item.type === 'meeting';
    const isPhone = item.type === 'phone';
    const isTask = item.type === 'task';
    const isPassword = item.type === 'password';

    const meeting = item.details.meeting;
    const phone = item.details.phone;
    const task = item.details.task;

    const statusBadgeColor =
      item.status === 'Approved' ? Colors.success : item.status === 'Rejected' ? Colors.danger : Colors.warning;

    return (
      <Animated.View entering={FadeInDown.duration(260)}>
        <View style={styles.card}>
          {/* Card Top Row: Type, Status, Timestamp */}
          <View style={styles.cardHeader}>
            <View style={styles.typeBadgeRow}>
              <View style={[styles.typeIconBox, { backgroundColor: isMeeting ? 'rgba(59, 130, 246, 0.15)' : isPhone ? 'rgba(217, 143, 121, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons
                  name={isMeeting ? 'calendar' : isPhone ? 'call' : isTask ? 'checkbox' : 'key'}
                  size={16}
                  color={isMeeting ? '#3b82f6' : isPhone ? '#d98f79' : '#10b981'}
                />
              </View>
              <View>
                <Text style={styles.cardTypeLabel}>
                  {isMeeting ? 'MEETING REQUEST' : isPhone ? 'PHONE NUMBER CHANGE' : isTask ? 'TASK AUTHORIZATION' : 'ACCESS REQUEST'}
                </Text>
                <Text style={styles.cardTimeText}>
                  {format(new Date(item.createdAt), 'MMM dd · hh:mm a')}
                </Text>
              </View>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: statusBadgeColor + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusBadgeColor }]}>
                {item.status}
              </Text>
            </View>
          </View>

          {/* Final Founder Approval Indicator */}
          {item.isFinalApproval && isPending && (
            <View style={styles.cardFinalBadge}>
              <Ionicons name="shield-checkmark" size={13} color="#f59e0b" />
              <Text style={styles.cardFinalBadgeText}>FINAL APPROVAL REQUIRED</Text>
            </View>
          )}

          {/* Requester Profile Summary */}
          <View style={styles.requesterSection}>
            <View style={styles.avatarMini}>
              <Text style={styles.avatarMiniText}>
                {item.requester.fullName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.requesterName} numberOfLines={1}>
                {item.requester.fullName}
              </Text>
              <Text style={styles.requesterRole}>
                {item.requester.role} · {item.requester.departmentName || 'General'}
              </Text>
            </View>
          </View>

          {/* Core Request Information */}
          <View style={styles.contentSection}>
            <Text style={styles.contentTitle} numberOfLines={2}>
              {item.title}
            </Text>

            {isMeeting && meeting && (
              <View style={styles.meetingDetailsRow}>
                <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.meetingTimeText}>
                  {meeting.startTime ? format(new Date(meeting.startTime), 'EEEE, MMM dd · hh:mm a') : 'Time TBD'}
                </Text>
              </View>
            )}

            {isPhone && phone && (
              <View style={styles.phoneCompareMini}>
                <Text style={styles.phoneLabelMini}>Update number to:</Text>
                <Text style={styles.phoneValueMini}>{phone.newPhone}</Text>
              </View>
            )}

            {isTask && task && task.dueDate && (
              <View style={styles.meetingDetailsRow}>
                <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.meetingTimeText}>
                  Due {format(new Date(task.dueDate), 'MMM dd, yyyy')}
                </Text>
              </View>
            )}

            {/* Current Approval Stage Indicator */}
            <View style={styles.stageRow}>
              <Ionicons name="git-commit-outline" size={14} color={Colors.primary} />
              <Text style={styles.stageText}>{item.currentStage}</Text>
            </View>
          </View>

          {/* Action Buttons for Pending Items */}
          {isPending && (
            <View style={styles.cardActions}>
              {isPassword ? (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { flex: 1 }]}
                  onPress={() => {
                    setActivePasswordItem(item);
                    setPasswordModalVisible(true);
                  }}
                >
                  <Ionicons name="key-outline" size={16} color="#fff" />
                  <Text style={styles.primaryActionText}>Set Temporary Password</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.secondaryActionBtn]}
                    onPress={() => handleQuickReject(item)}
                    disabled={loading}
                  >
                    <Text style={styles.secondaryActionText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryActionBtn]}
                    onPress={() => handleQuickApprove(item)}
                    disabled={loading}
                  >
                    <Text style={styles.primaryActionText}>Approve</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* View Details Link */}
          <TouchableOpacity
            style={styles.cardFooterLink}
            onPress={() => {
              setSelectedItem(item);
              setDetailModalVisible(true);
            }}
          >
            <Text style={styles.cardFooterLinkText}>View Full Request & Timeline</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      {/* Header Title Section */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.screenTitle}>Approval Center</Text>
            <Text style={styles.screenSubtitle}>
              {statusTab === 'pending'
                ? items.length === 1
                  ? '1 authorization waiting for your action'
                  : `${items.length} authorizations waiting for your action`
                : `${statusTab === 'approved' ? 'Approved' : 'Rejected'} decisions history`}
            </Text>
          </View>
        </View>

        {/* ── Status Tabs (Pending / Approved / Rejected) ── */}
        <View style={styles.statusTabsContainer}>
          <TouchableOpacity
            style={[styles.statusTabBtn, statusTab === 'pending' && styles.statusTabBtnActive]}
            onPress={() => setStatusTab('pending')}
          >
            <Text style={[styles.statusTabBtnText, statusTab === 'pending' && styles.statusTabBtnTextActive]}>
              Pending
            </Text>
            {categoryCounts.all > 0 && statusTab === 'pending' && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{categoryCounts.all}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statusTabBtn, statusTab === 'approved' && styles.statusTabBtnActive]}
            onPress={() => setStatusTab('approved')}
          >
            <Text style={[styles.statusTabBtnText, statusTab === 'approved' && styles.statusTabBtnTextActive]}>
              Approved
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statusTabBtn, statusTab === 'rejected' && styles.statusTabBtnActive]}
            onPress={() => setStatusTab('rejected')}
          >
            <Text style={[styles.statusTabBtnText, statusTab === 'rejected' && styles.statusTabBtnTextActive]}>
              Rejected
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Category Filter Pills (All / Meetings / Phones / Tasks / Access) ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFiltersContainer}
        >
          <TouchableOpacity
            style={[styles.categoryChip, categoryFilter === 'all' && styles.categoryChipActive]}
            onPress={() => setCategoryFilter('all')}
          >
            <Text style={[styles.categoryChipText, categoryFilter === 'all' && styles.categoryChipTextActive]}>
              All ({categoryCounts.all})
            </Text>
          </TouchableOpacity>

          {categoryCounts.meetings > 0 && (
            <TouchableOpacity
              style={[styles.categoryChip, categoryFilter === 'meetings' && styles.categoryChipActive]}
              onPress={() => setCategoryFilter('meetings')}
            >
              <Text style={[styles.categoryChipText, categoryFilter === 'meetings' && styles.categoryChipTextActive]}>
                Meetings ({categoryCounts.meetings})
              </Text>
            </TouchableOpacity>
          )}

          {categoryCounts.phones > 0 && (
            <TouchableOpacity
              style={[styles.categoryChip, categoryFilter === 'phones' && styles.categoryChipActive]}
              onPress={() => setCategoryFilter('phones')}
            >
              <Text style={[styles.categoryChipText, categoryFilter === 'phones' && styles.categoryChipTextActive]}>
                Phones ({categoryCounts.phones})
              </Text>
            </TouchableOpacity>
          )}

          {categoryCounts.tasks > 0 && (
            <TouchableOpacity
              style={[styles.categoryChip, categoryFilter === 'tasks' && styles.categoryChipActive]}
              onPress={() => setCategoryFilter('tasks')}
            >
              <Text style={[styles.categoryChipText, categoryFilter === 'tasks' && styles.categoryChipTextActive]}>
                Tasks ({categoryCounts.tasks})
              </Text>
            </TouchableOpacity>
          )}

          {categoryCounts.access > 0 && (
            <TouchableOpacity
              style={[styles.categoryChip, categoryFilter === 'access' && styles.categoryChipActive]}
              onPress={() => setCategoryFilter('access')}
            >
              <Text style={[styles.categoryChipText, categoryFilter === 'access' && styles.categoryChipTextActive]}>
                Access ({categoryCounts.access})
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* ── Main Approvals List ── */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading authorization inbox...</Text>
        </View>
      ) : (
        <FlashList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderApprovalCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Ionicons
                  name={statusTab === 'pending' ? 'shield-checkmark-outline' : statusTab === 'approved' ? 'checkmark-done-circle-outline' : 'close-circle-outline'}
                  size={52}
                  color={Colors.borderStrong}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {statusTab === 'pending' ? 'No pending approvals' : `No ${statusTab} history`}
              </Text>
              <Text style={styles.emptySubtitle}>
                {statusTab === 'pending'
                  ? 'You are all caught up! When actions require your authorization, they will appear here.'
                  : `Historical ${statusTab} approval records will be archived here for auditability.`}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Interactive Detailed Modal ── */}
      <ApprovalDetailModal
        visible={detailModalVisible}
        item={selectedItem}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedItem(null);
        }}
        onActionComplete={loadApprovals}
      />

      {/* ── Temporary Password Modal ── */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.passwordModalOverlay}>
          <View style={styles.passwordModalCard}>
            <Text style={styles.passwordModalTitle}>Set Temporary Password</Text>
            <Text style={styles.passwordModalSub}>
              Enter a temporary password for {activePasswordItem?.requester.fullName} ({activePasswordItem?.requester.email}).
            </Text>

            <TextInput
              style={styles.passwordInput}
              placeholder="Enter new temporary password (min 7 chars)"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={tempPassword}
              onChangeText={setTempPassword}
            />

            <View style={styles.passwordModalActions}>
              <TouchableOpacity
                style={styles.passwordCancelBtn}
                onPress={() => setPasswordModalVisible(false)}
                disabled={submittingPassword}
              >
                <Text style={styles.passwordCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.passwordSubmitBtn}
                onPress={handlePasswordSubmit}
                disabled={submittingPassword}
              >
                {submittingPassword ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.passwordSubmitText}>Update Password</Text>
                )}
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
  header: {
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
    paddingBottom: Layout.spacing.sm,
    backgroundColor: Colors.background,
  },
  headerTitleRow: {
    marginBottom: Layout.spacing.md,
  },
  screenTitle: {
    fontSize: Typography.fontSize.xxl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  screenSubtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusTabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: Layout.spacing.md,
  },
  statusTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
    gap: 6,
  },
  statusTabBtnActive: {
    backgroundColor: Colors.surfaceRaised,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statusTabBtnText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  statusTabBtnTextActive: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  tabBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: Layout.radius.full,
  },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
  categoryFiltersContainer: {
    gap: Layout.spacing.sm,
    paddingVertical: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  categoryChipTextActive: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
  listContent: {
    padding: Layout.spacing.lg,
    paddingTop: Layout.spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.xl,
    padding: Layout.spacing.lg,
    marginBottom: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Layout.spacing.md,
  },
  typeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
  },
  typeIconBox: {
    width: 32,
    height: 32,
    borderRadius: Layout.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTypeLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  cardTimeText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Layout.radius.xs,
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    textTransform: 'uppercase',
  },
  cardFinalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Layout.radius.sm,
    marginBottom: Layout.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  cardFinalBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: '#f59e0b',
    letterSpacing: 0.5,
  },
  requesterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.md,
    backgroundColor: Colors.surfaceRaised,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.lg,
    marginBottom: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  avatarMini: {
    width: 36,
    height: 36,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarMiniText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
  requesterName: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  requesterRole: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.primary,
  },
  contentSection: {
    marginBottom: Layout.spacing.md,
  },
  contentTitle: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  meetingDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  meetingTimeText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  phoneCompareMini: {
    backgroundColor: Colors.surfaceRaised,
    padding: 8,
    borderRadius: Layout.radius.sm,
    marginTop: 4,
  },
  phoneLabelMini: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  phoneValueMini: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Layout.spacing.sm,
  },
  stageText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    gap: Layout.spacing.md,
    marginTop: Layout.spacing.xs,
    marginBottom: Layout.spacing.md,
  },
  secondaryActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.danger,
  },
  primaryActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryActionText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
  },
  cardFooterLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: Layout.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  cardFooterLinkText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.spacing.xxl,
  },
  loadingText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: Layout.spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: Layout.spacing.xl,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Layout.spacing.lg,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  passwordModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.spacing.lg,
  },
  passwordModalCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.xl,
    padding: Layout.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  passwordModalTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  passwordModalSub: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginBottom: Layout.spacing.md,
    lineHeight: 18,
  },
  passwordInput: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    padding: Layout.spacing.md,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: Layout.spacing.lg,
  },
  passwordModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Layout.spacing.md,
  },
  passwordCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Layout.radius.md,
  },
  passwordCancelText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  passwordSubmitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Layout.radius.md,
  },
  passwordSubmitText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
  },
});
