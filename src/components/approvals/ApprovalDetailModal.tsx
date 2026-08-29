import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { UnifiedApprovalItem, ApprovalService } from '../../services/approvals/ApprovalService';
import { format } from 'date-fns';

interface ApprovalDetailModalProps {
  visible: boolean;
  item: UnifiedApprovalItem | null;
  onClose: () => void;
  onActionComplete: () => void;
}

export const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  visible,
  item,
  onClose,
  onActionComplete,
}) => {
  const [processing, setProcessing] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Password reset specific
  const [temporaryPassword, setTemporaryPassword] = useState('');

  if (!item) return null;

  const isPending = item.status === 'Pending';
  const meeting = item.details.meeting;
  const phone = item.details.phone;
  const task = item.details.task;
  const pwd = item.details.passwordReset;

  const handleApprove = () => {
    Alert.alert(
      'Confirm Approval',
      `Are you sure you want to approve this ${item.type === 'meeting' ? 'meeting request' : item.type === 'phone' ? 'phone number change' : 'request'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setProcessing(true);
            try {
              const res = await ApprovalService.processDecision(item, 'Approved');
              if (res.success) {
                Alert.alert('Approved', res.message || 'Request approved successfully.');
                onActionComplete();
                onClose();
              } else {
                Alert.alert('Error', res.error || 'Failed to approve request.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'An unexpected error occurred.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleRejectConfirm = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for rejecting this request.');
      return;
    }

    setProcessing(true);
    try {
      const res = await ApprovalService.processDecision(item, 'Rejected', rejectionReason.trim());
      if (res.success) {
        Alert.alert('Rejected', res.message || 'Request rejected successfully.');
        setShowRejectInput(false);
        setRejectionReason('');
        onActionComplete();
        onClose();
      } else {
        Alert.alert('Error', res.error || 'Failed to reject request.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setProcessing(false);
    }
  };

  const getTypeIcon = () => {
    switch (item.type) {
      case 'meeting': return 'calendar-outline';
      case 'phone': return 'call-outline';
      case 'task': return 'checkbox-outline';
      case 'password': return 'key-outline';
      case 'user_registration': return 'person-add-outline';
      default: return 'document-text-outline';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return Colors.success;
      case 'Rejected': return Colors.danger;
      case 'Pending': return Colors.warning;
      default: return Colors.textMuted;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconCircle}>
                <Ionicons name={getTypeIcon()} size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.subtitle}>
                  Requested on {format(new Date(item.createdAt), 'MMM dd, yyyy · hh:mm a')}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {item.isFinalApproval && isPending && (
              <View style={styles.finalApprovalBanner}>
                <Ionicons name="shield-checkmark" size={14} color="#f59e0b" />
                <Text style={styles.finalApprovalText}>FINAL EXECUTIVE APPROVAL REQUIRED</Text>
              </View>
            )}
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {/* Requester Identity Card */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>REQUESTER INFORMATION</Text>
              <View style={styles.requesterRow}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {item.requester.fullName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.requesterName}>{item.requester.fullName}</Text>
                  <Text style={styles.requesterSub}>
                    {item.requester.role} · {item.requester.departmentName || 'General Department'}
                  </Text>
                  <Text style={styles.requesterEmail}>{item.requester.email}</Text>
                </View>
              </View>
            </View>

            {/* Specific Type Details */}
            {item.type === 'meeting' && meeting && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>MEETING DETAILS</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Scheduled Time</Text>
                  <Text style={styles.detailValue}>
                    {meeting.startTime
                      ? format(new Date(meeting.startTime), 'EEEE, MMMM d, yyyy · hh:mm a')
                      : 'Not specified'}
                  </Text>
                </View>

                {(meeting.platform || meeting.location) && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Platform / Location</Text>
                    <Text style={styles.detailValue}>{meeting.platform || meeting.location}</Text>
                  </View>
                )}

                {meeting.meetingLink && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Meeting Link</Text>
                    <TouchableOpacity onPress={() => Linking.openURL(meeting.meetingLink)}>
                      <Text style={[styles.detailValue, { color: Colors.primary, textDecorationLine: 'underline' }]}>
                        {meeting.meetingLink}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {meeting.description && (
                  <View style={[styles.detailRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                    <Text style={styles.detailLabel}>Agenda / Description</Text>
                    <Text style={styles.descriptionBox}>{meeting.description}</Text>
                  </View>
                )}

                {meeting.participants && meeting.participants.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.detailLabel}>Invited Participants ({meeting.participants.length})</Text>
                    <View style={styles.participantsContainer}>
                      {meeting.participants.map((p: any, idx: number) => (
                        <View key={p.id || idx} style={styles.participantChip}>
                          <Text style={styles.participantChipText}>
                            {p.full_name || p.email} ({p.role || 'Member'})
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {item.type === 'phone' && phone && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>CONTACT NUMBER MODIFICATION</Text>
                <View style={styles.phoneCompareRow}>
                  <View style={styles.phoneBox}>
                    <Text style={styles.phoneBoxLabel}>CURRENT ACTIVE NUMBER</Text>
                    <Text style={styles.phoneBoxValue}>{phone.currentPhone}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={18} color={Colors.textMuted} style={{ marginHorizontal: 8 }} />
                  <View style={[styles.phoneBox, styles.phoneBoxActive]}>
                    <Text style={[styles.phoneBoxLabel, { color: Colors.primary }]}>NEW REQUESTED NUMBER</Text>
                    <Text style={[styles.phoneBoxValue, { color: Colors.textPrimary, fontWeight: '700' }]}>
                      {phone.newPhone}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {item.type === 'task' && task && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>TASK DETAILS</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Task Title</Text>
                  <Text style={styles.detailValue}>{task.title}</Text>
                </View>
                {task.priority && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Priority</Text>
                    <Text style={styles.detailValue}>{task.priority}</Text>
                  </View>
                )}
                {task.dueDate && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Deadline</Text>
                    <Text style={styles.detailValue}>
                      {format(new Date(task.dueDate), 'MMM dd, yyyy')}
                    </Text>
                  </View>
                )}
                {task.description && (
                  <View style={[styles.detailRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.descriptionBox}>{task.description}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Approval Sequence Timeline */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>APPROVAL TIMELINE & HIERARCHY</Text>
              <View style={styles.timelineList}>
                {item.timeline.map((step, idx) => {
                  const isDone = step.status === 'Approved';
                  const isCurrent = step.status === 'Pending';
                  const isRejected = step.status === 'Rejected';

                  return (
                    <View key={idx} style={styles.timelineItem}>
                      <View style={styles.timelineLeft}>
                        <View
                          style={[
                            styles.timelineNode,
                            isDone && { backgroundColor: Colors.success },
                            isCurrent && { backgroundColor: Colors.warning, borderColor: '#f59e0b' },
                            isRejected && { backgroundColor: Colors.danger },
                          ]}
                        >
                          <Ionicons
                            name={isDone ? 'checkmark' : isRejected ? 'close' : isCurrent ? 'time-outline' : 'ellipse'}
                            size={12}
                            color="#fff"
                          />
                        </View>
                        {idx < item.timeline.length - 1 && <View style={styles.timelineLine} />}
                      </View>
                      <View style={styles.timelineRight}>
                        <View style={styles.timelineHeaderRow}>
                          <Text style={styles.timelineRole}>
                            Step {step.sequenceOrder}: {step.role}
                          </Text>
                          <View
                            style={[
                              styles.timelineStatusBadge,
                              { backgroundColor: getStatusColor(step.status) + '20' },
                            ]}
                          >
                            <Text style={[styles.timelineStatusText, { color: getStatusColor(step.status) }]}>
                              {step.status}
                            </Text>
                          </View>
                        </View>
                        {step.name && (
                          <Text style={styles.timelineName}>{step.name}</Text>
                        )}
                        {step.approvedAt && (
                          <Text style={styles.timelineTime}>
                            {format(new Date(step.approvedAt), 'MMM dd, hh:mm a')}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Rejection input area if toggled */}
            {showRejectInput && isPending && (
              <View style={styles.rejectContainer}>
                <Text style={styles.rejectPrompt}>Reason for Rejection (Required):</Text>
                <TextInput
                  style={styles.rejectInput}
                  placeholder="Please state why this request cannot be approved..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={3}
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                />
                <View style={styles.rejectActionsRow}>
                  <TouchableOpacity
                    style={styles.cancelRejectBtn}
                    onPress={() => { setShowRejectInput(false); setRejectionReason(''); }}
                    disabled={processing}
                  >
                    <Text style={styles.cancelRejectText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmRejectBtn}
                    onPress={handleRejectConfirm}
                    disabled={processing}
                  >
                    {processing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmRejectText}>Confirm Rejection</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons Footer (Visible only if Pending) */}
          {isPending && !showRejectInput && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => setShowRejectInput(true)}
                disabled={processing}
              >
                <Ionicons name="close-circle-outline" size={18} color={Colors.danger} />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={handleApprove}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.approveBtnText}>Approve Request</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    padding: Layout.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceRaised,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: Layout.spacing.xs,
  },
  finalApprovalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 6,
    borderRadius: Layout.radius.md,
    marginTop: Layout.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  finalApprovalText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    color: '#f59e0b',
    letterSpacing: 0.5,
  },
  scrollBody: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: Layout.spacing.lg,
    gap: Layout.spacing.lg,
  },
  sectionCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  sectionHeading: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: Layout.spacing.sm,
  },
  requesterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
  requesterName: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  requesterSub: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
    marginTop: 1,
  },
  requesterEmail: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  detailRow: {
    paddingVertical: Layout.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    marginBottom: Layout.spacing.xs,
  },
  detailLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
  },
  descriptionBox: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  participantsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  participantChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  participantChipText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  phoneCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Layout.spacing.xs,
  },
  phoneBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  phoneBoxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  phoneBoxLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  phoneBoxValue: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  timelineList: {
    marginTop: Layout.spacing.xs,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 52,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
    marginRight: Layout.spacing.md,
  },
  timelineNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    zIndex: 1,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 2,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: Layout.spacing.sm,
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineRole: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  timelineStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Layout.radius.xs,
  },
  timelineStatusText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    textTransform: 'uppercase',
  },
  timelineName: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  timelineTime: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  rejectContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  rejectPrompt: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.danger,
    marginBottom: Layout.spacing.xs,
  },
  rejectInput: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    padding: Layout.spacing.md,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  rejectActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Layout.spacing.md,
    marginTop: Layout.spacing.md,
  },
  cancelRejectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Layout.radius.md,
  },
  cancelRejectText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  confirmRejectBtn: {
    backgroundColor: Colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Layout.radius.md,
  },
  confirmRejectText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    padding: Layout.spacing.lg,
    gap: Layout.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceRaised,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Layout.spacing.md,
    borderRadius: Layout.radius.lg,
  },
  rejectBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  rejectBtnText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.danger,
  },
  approveBtn: {
    backgroundColor: Colors.primary,
  },
  approveBtnText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
  },
});
