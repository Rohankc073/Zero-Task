import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Linking,
  Modal,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../src/lib/supabase';
import { Meeting, Task } from '../../src/types';
import { useAuth } from '../../src/context/AuthContext';
import { Colors, Typography, Layout } from '../../src/theme/tokens';
import { ZeroTaskHeader } from '../../src/components/ZeroTaskHeader';
import { Avatar } from '../../src/components/ui/Avatar';
import { processAndUploadAttachment } from '../../src/utils/attachmentPipeline';
import { MeetingPolicyService } from '../../src/services/meetings/MeetingPolicyService';

export default function MeetingDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session, profile } = useAuth();

  const [meeting, setMeeting] = useState<any | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);

  // Approval action state
  const [processingApproval, setProcessingApproval] = useState(false);
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);

  const fetchMeetingData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);

      // 0. Sync database completion & cleanup
      try {
        await supabase.rpc('cleanup_and_complete_meetings');
      } catch {}

      // 1. Fetch meeting
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select('*, organizer:users!organizer_id(id, full_name, role, email, avatar_url), department:departments(id, name)')
        .eq('id', id)
        .single();

      if (meetingError) throw meetingError;
      setMeeting(meetingData);

      // 2. Fetch participants
      const { data: partData } = await supabase
        .from('meeting_participants')
        .select('*, user:users(id, full_name, role, email, avatar_url, department:departments(id, name))')
        .eq('meeting_id', id);
      setParticipants(partData || []);

      // 3. Fetch sequential approvals
      const { data: appData } = await supabase
        .from('meeting_approvals')
        .select('*, approver:users!approver_id(id, full_name, role, email)')
        .eq('meeting_id', id)
        .order('sequence_order', { ascending: true });
      setApprovals(appData || []);

      // 4. Fetch attachments
      const { data: fileData } = await supabase
        .from('meeting_files')
        .select('*')
        .eq('meeting_id', id)
        .order('created_at', { ascending: false });
      setFiles(fileData || []);
    } catch (err: any) {
      console.error('Error fetching meeting details:', err);
      Alert.alert('Error', err.message || 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMeetingData();
  }, [fetchMeetingData]);

  // Check if current user is active approver
  const currentPendingApproval = approvals.find(
    a => a.status === 'Pending' && (a.approver_id === profile?.id || profile?.role === 'Founder' || profile?.role === 'Super Admin')
  );

  const handleProcessApproval = async (action: 'Approved' | 'Rejected', reason?: string) => {
    if (!currentPendingApproval) return;
    try {
      setProcessingApproval(true);
      const { data, error } = await supabase.rpc('process_meeting_approval', {
        p_approval_id: currentPendingApproval.id,
        p_action: action,
        p_reason: reason || null,
      });

      if (error) throw error;

      Alert.alert(
        action === 'Approved' ? 'Meeting Approved' : 'Meeting Rejected',
        data?.message || `Meeting request has been ${action.toLowerCase()}.`
      );

      setRejectionModalVisible(false);
      setRejectionReason('');
      fetchMeetingData();
    } catch (err: any) {
      console.error('Error processing meeting approval:', err);
      Alert.alert('Approval Error', err.message || 'Failed to process approval.');
    } finally {
      setProcessingApproval(false);
    }
  };

  const [copiedLink, setCopiedLink] = useState(false);

  const sanitizeUrl = (rawUrl: string): string => {
    let clean = rawUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    return clean;
  };

  const handleJoinMeeting = async () => {
    if (!meeting?.meeting_link || !meeting.meeting_link.trim()) {
      Alert.alert('No Meeting Link', 'No meeting URL has been configured for this meeting.');
      return;
    }
    try {
      const sanitizedUrl = sanitizeUrl(meeting.meeting_link);
      const canOpen = await Linking.canOpenURL(sanitizedUrl);
      if (canOpen) {
        await Linking.openURL(sanitizedUrl);
      } else {
        await Linking.openURL(`https://${meeting.meeting_link.replace(/^https?:\/\//, '')}`);
      }
    } catch (err: any) {
      Alert.alert('Error', 'Unable to open meeting link.');
    }
  };

  const handleCopyLink = async () => {
    if (!meeting?.meeting_link) return;
    try {
      await Clipboard.setStringAsync(meeting.meeting_link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.warn('Failed to copy link:', err);
    }
  };

  const handleCancelMeeting = () => {
    Alert.alert(
      'Cancel & Delete Meeting',
      'Are you sure you want to cancel this meeting? It will be permanently removed from the database to save space.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              // 1. Clean up any uploaded storage files
              if (files && files.length > 0) {
                for (const file of files) {
                  try {
                    if (file.file_url) {
                      const urlParts = file.file_url.split('/');
                      const filename = urlParts[urlParts.length - 1];
                      const path = `${file.user_id || file.uploaded_by || profile?.id}/${filename}`;
                      await supabase.storage.from('task_attachments').remove([path, filename]);
                      await supabase.storage.from('meeting_attachments').remove([path, filename]);
                    }
                  } catch (fileDelErr) {
                    console.warn('Could not remove file from storage:', fileDelErr);
                  }
                }
              }

              // 2. Delete the meeting record (cascades automatically in postgres)
              const { error } = await supabase
                .from('meetings')
                .delete()
                .eq('id', id);

              if (error) throw error;

              Alert.alert('Meeting Deleted', 'The meeting has been cancelled and removed from the database.', [
                {
                  text: 'OK',
                  onPress: () => {
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace('/(drawer)/(tabs)/calendar' as any);
                    }
                  },
                },
              ]);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete meeting.');
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleFileUpload = async () => {
    if (!profile || !meeting) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploadingFile(true);
        const uploadRes = await processAndUploadAttachment(
          asset.uri,
          asset.name,
          asset.mimeType || 'application/octet-stream',
          'task_attachments',
          profile.id,
          0,
          asset.size
        );
        if (uploadRes?.url) {
          const { error: insertError } = await supabase.from('meeting_files').insert({
            meeting_id: meeting.id,
            user_id: profile.id,
            uploaded_by: profile.id,
            file_name: asset.name,
            file_url: uploadRes.url,
            file_type: asset.mimeType || 'document',
            file_size: asset.size || null,
          });
          if (insertError) throw insertError;
          await fetchMeetingData();
        }
      }
    } catch (err: any) {
      console.error('Meeting file upload error:', err);
      Alert.alert('Upload Failed', err.message || 'Could not upload attachment.');
    } finally {
      setUploadingFile(false);
    }
  };

  if (loading && !meeting) {
    return (
      <View style={styles.loadingFull}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading meeting details...</Text>
      </View>
    );
  }

  if (!meeting) {
    return (
      <View style={styles.emptyFull}>
        <Ionicons name="calendar-outline" size={48} color={Colors.borderStrong} />
        <Text style={styles.emptyTitle}>Meeting Not Found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const startDate = new Date(meeting.start_time);
  const endDate = new Date(meeting.end_time);
  const durationMins = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)));

  const isPastEndTime = new Date() > endDate;
  const isPending = meeting.status === 'Pending_Approval';
  const isRejected = meeting.status === 'Rejected';
  const isCancelled = meeting.status === 'Cancelled';
  const isCompleted = meeting.status === 'Completed' || (isPastEndTime && !isCancelled && !isRejected);
  const isConfirmed = meeting.status === 'Scheduled' && !isPastEndTime;
  const hasValidMeetingLink = Boolean(meeting.meeting_link && meeting.meeting_link.trim().length > 0);
  const canJoinMeeting = hasValidMeetingLink && !isPending && !isCancelled && !isRejected;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchMeetingData} tintColor={Colors.primary} />}
      >
        {/* Top Header Card */}
        <View style={styles.meetingHeaderCard}>
          <View style={styles.topBadgeRow}>
            <View style={styles.platformBadge}>
              <Ionicons name="videocam" size={12} color={Colors.primary} />
              <Text style={styles.platformBadgeText}>{meeting.meeting_platform || 'Online'}</Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                (isConfirmed || isCompleted) && styles.statusBadgeConfirmed,
                isPending && styles.statusBadgePending,
                (isRejected || isCancelled) && styles.statusBadgeDanger,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  (isConfirmed || isCompleted) && { color: Colors.success },
                  isPending && { color: '#d97706' },
                  (isRejected || isCancelled) && { color: Colors.danger },
                ]}
              >
                {isCompleted ? 'COMPLETED' : meeting.status?.replace('_', ' ')}
              </Text>
            </View>
          </View>

          <Text style={styles.meetingTitle}>{meeting.title}</Text>
          {meeting.description && <Text style={styles.meetingDesc}>{meeting.description}</Text>}

          {/* Time & Duration */}
          <View style={styles.timeInfoBox}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
            <Text style={styles.timeInfoText}>
              {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
              {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
              {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({durationMins} mins)
            </Text>
          </View>

          {/* Completed Notice */}
          {isCompleted && (
            <View style={styles.completedNoticeBox}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.completedNoticeTitle}>Meeting Completed</Text>
                <Text style={styles.completedNoticeSubtitle}>
                  This meeting has concluded. To save space, it will be automatically deleted in 2 hours.
                </Text>
              </View>
            </View>
          )}

          {/* Join Meeting & Link Display */}
          {canJoinMeeting && (
            <View style={styles.meetingLinkContainer}>
              <TouchableOpacity style={styles.joinBtn} onPress={handleJoinMeeting} activeOpacity={0.85}>
                <Ionicons name="videocam" size={18} color={Colors.textInverse} />
                <Text style={styles.joinBtnText}>Join Meeting</Text>
                <Ionicons name="open-outline" size={15} color={Colors.textInverse} />
              </TouchableOpacity>

              <View style={styles.linkInfoBox}>
                <Ionicons name="link-outline" size={16} color={Colors.primary} />
                <Text style={styles.linkUrlText} numberOfLines={1} ellipsizeMode="middle">
                  {meeting.meeting_link}
                </Text>
                <TouchableOpacity
                  style={styles.copyLinkBtn}
                  onPress={handleCopyLink}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={copiedLink ? "checkmark-circle" : "copy-outline"}
                    size={14}
                    color={copiedLink ? Colors.success : Colors.primary}
                  />
                  <Text style={[styles.copyLinkText, copiedLink && { color: Colors.success }]}>
                    {copiedLink ? "Copied" : "Copy"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Active Approver Action Banner ── */}
        {currentPendingApproval && isPending && (
          <View style={styles.actionBanner}>
            <View style={styles.actionBannerHeader}>
              <Ionicons name="alert-circle" size={20} color="#d97706" />
              <Text style={styles.actionBannerTitle}>Your Approval is Required</Text>
            </View>
            <Text style={styles.actionBannerDesc}>
              This meeting request is waiting for your decision as {currentPendingApproval.approver_role}.
            </Text>

            <View style={styles.actionBtnRow}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => setRejectionModalVisible(true)}
                disabled={processingApproval}
              >
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => handleProcessApproval('Approved')}
                disabled={processingApproval}
              >
                {processingApproval ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Text style={styles.approveBtnText}>Approve Meeting</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Approval Hierarchy Progress Stepper ── */}
        {approvals.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Approval Hierarchy Progress</Text>
            <View style={styles.stepper}>
              {approvals.map((app, idx) => {
                const isStepApproved = app.status === 'Approved';
                const isStepPending = app.status === 'Pending';
                const isStepRejected = app.status === 'Rejected';
                const isStepWaiting = app.status === 'Waiting';

                return (
                  <View key={app.id} style={styles.stepItem}>
                    <View style={styles.stepIndicatorCol}>
                      <View
                        style={[
                          styles.stepDot,
                          isStepApproved && styles.stepDotApproved,
                          isStepPending && styles.stepDotPending,
                          isStepRejected && styles.stepDotRejected,
                          isStepWaiting && styles.stepDotWaiting,
                        ]}
                      >
                        {isStepApproved && <Ionicons name="checkmark" size={12} color={Colors.textInverse} />}
                        {isStepRejected && <Ionicons name="close" size={12} color={Colors.textInverse} />}
                        {isStepPending && <Ionicons name="time" size={12} color={Colors.textInverse} />}
                        {isStepWaiting && <Text style={styles.stepWaitingNum}>{app.sequence_order}</Text>}
                      </View>
                      {idx < approvals.length - 1 && <View style={styles.stepLine} />}
                    </View>

                    <View style={styles.stepContent}>
                      <View style={styles.stepTitleRow}>
                        <Text style={styles.stepRoleText}>
                          Step {app.sequence_order}: {app.approver_role} Approval
                        </Text>
                        <Text
                          style={[
                            styles.stepStatusBadge,
                            isStepApproved && { color: Colors.success },
                            isStepPending && { color: '#d97706' },
                            isStepRejected && { color: Colors.danger },
                          ]}
                        >
                          {app.status}
                        </Text>
                      </View>
                      <Text style={styles.stepApproverName}>
                        Approver: {app.approver?.full_name || app.approver_role}
                      </Text>
                      {app.rejection_reason && (
                        <Text style={styles.stepRejectionText}>Reason: {app.rejection_reason}</Text>
                      )}
                      {app.responded_at && (
                        <Text style={styles.stepTimestamp}>
                          Responded on {new Date(app.responded_at).toLocaleString()}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Organizer & Participants ── */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Participants ({participants.length})</Text>

          {/* Organizer */}
          {meeting.organizer && (
            <View style={styles.participantRow}>
              <Avatar name={meeting.organizer.full_name} size={36} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.partName}>{meeting.organizer.full_name} (Organizer)</Text>
                <Text style={styles.partRole}>{meeting.organizer.role} · {meeting.department?.name || 'General'}</Text>
              </View>
            </View>
          )}

          {/* Other Participants */}
          {participants
            .filter(p => p.user_id !== meeting.organizer_id)
            .map((p, idx) => (
              <View key={p.user_id || p.id || `part-${idx}`} style={styles.participantRow}>
                <Avatar name={p.user?.full_name} size={36} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.partName}>{p.user?.full_name || 'Participant'}</Text>
                  <Text style={styles.partRole}>
                    {p.user?.role} {p.user?.department?.name ? `· ${p.user.department.name}` : ''}
                  </Text>
                </View>
              </View>
            ))}
        </View>

        {/* ── Meeting Documents & Attachments ── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSectionTitle}>Documents & Attachments ({files.length})</Text>
            <TouchableOpacity style={styles.uploadAttachBtn} onPress={handleFileUpload} disabled={uploadingFile}>
              {uploadingFile ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={14} color={Colors.primary} />
                  <Text style={styles.uploadAttachText}>Upload</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {files.length === 0 ? (
            <Text style={styles.emptyNote}>No documents attached to this meeting.</Text>
          ) : (
            files.map((f, idx) => (
              <TouchableOpacity
                key={f.id || f.file_url || `file-${idx}`}
                style={styles.fileItem}
                onPress={() => {
                  if (f.file_url) {
                    Linking.openURL(f.file_url).catch((err: any) => {
                      console.error('Could not open file URL:', err);
                      Alert.alert('Unable to open document', 'Could not open the attachment link.');
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="document-text" size={20} color={Colors.primary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{f.file_name || 'Document'}</Text>
                  <Text style={styles.fileMeta}>{f.created_at ? new Date(f.created_at).toLocaleDateString() : ''}</Text>
                </View>
                <Ionicons name="download-outline" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Cancel Meeting Action */}
        {MeetingPolicyService.canCancelMeeting(profile as any, meeting) && !isCancelled && !isRejected && (
          <TouchableOpacity style={styles.cancelMeetingBtn} onPress={handleCancelMeeting}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <Text style={styles.cancelMeetingText}>Cancel Meeting</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Rejection Modal */}
      <Modal visible={rejectionModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.rejectionCard}>
            <Text style={styles.modalTitle}>Reject Meeting Request</Text>
            <Text style={styles.modalSub}>Please provide a reason for rejecting this meeting request:</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="e.g. Schedule conflict, agenda needs clarification..."
              placeholderTextColor={Colors.textMuted}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRejectionModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalRejectConfirmBtn}
                onPress={() => handleProcessApproval('Rejected', rejectionReason)}
              >
                <Text style={styles.modalRejectConfirmText}>Confirm Rejection</Text>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Layout.spacing.lg,
    paddingBottom: 40,
  },
  loadingFull: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyFull: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: Colors.background,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
  },
  backBtnText: {
    color: Colors.textInverse,
    fontWeight: 'bold',
  },
  meetingHeaderCard: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.lg,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: Layout.spacing.md,
  },
  topBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  platformBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
  },
  statusBadgeConfirmed: {
    backgroundColor: '#dcfce7',
  },
  statusBadgePending: {
    backgroundColor: '#fef3c7',
  },
  statusBadgeDanger: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    textTransform: 'uppercase',
  },
  meetingTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  meetingDesc: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  timeInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: Layout.radius.md,
    gap: 8,
    marginTop: 4,
  },
  timeInfoText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  meetingLinkContainer: {
    marginTop: 14,
    gap: 8,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: Layout.radius.md,
    gap: 8,
  },
  joinBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
    fontSize: 14,
  },
  linkInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  linkUrlText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  copyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Layout.radius.sm,
    gap: 4,
  },
  copyLinkText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  completedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: Layout.radius.md,
    padding: 10,
    marginTop: 10,
    gap: 8,
  },
  completedNoticeTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: '#065f46',
  },
  completedNoticeSubtitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: '#047857',
    marginTop: 2,
  },
  actionBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.md,
    marginBottom: Layout.spacing.md,
  },
  actionBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBannerTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: '#92400e',
  },
  actionBannerDesc: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: '#78350f',
    marginTop: 4,
    marginBottom: 12,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
  },
  rejectBtnText: {
    color: Colors.danger,
    fontFamily: Typography.fontFamily.bold,
    fontSize: 13,
  },
  approveBtn: {
    flex: 2,
    backgroundColor: Colors.success,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
  },
  approveBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
    fontSize: 13,
  },
  card: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.lg,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: Layout.spacing.md,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepper: {
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
  },
  stepIndicatorCol: {
    alignItems: 'center',
    width: 24,
    marginRight: 10,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotApproved: {
    backgroundColor: Colors.success,
  },
  stepDotPending: {
    backgroundColor: '#d97706',
  },
  stepDotRejected: {
    backgroundColor: Colors.danger,
  },
  stepDotWaiting: {
    backgroundColor: Colors.borderSubtle,
  },
  stepWaitingNum: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.borderSubtle,
    marginTop: 4,
    marginBottom: 4,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 10,
  },
  stepTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepRoleText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  stepStatusBadge: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    textTransform: 'uppercase',
  },
  stepApproverName: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stepRejectionText: {
    fontSize: 11,
    color: Colors.danger,
    marginTop: 2,
  },
  stepTimestamp: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  partName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  partRole: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  uploadAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#eff6ff',
  },
  uploadAttachText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  emptyNote: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: Colors.background,
    borderRadius: Layout.radius.md,
    marginBottom: 6,
  },
  fileName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
  },
  fileMeta: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  cancelMeetingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.danger,
    gap: 6,
    marginTop: 10,
  },
  cancelMeetingText: {
    color: Colors.danger,
    fontFamily: Typography.fontFamily.bold,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  rejectionCard: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.lg,
    borderRadius: Layout.radius.lg,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginVertical: 8,
  },
  reasonInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    padding: 10,
    height: 80,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  modalRejectConfirmBtn: {
    backgroundColor: Colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Layout.radius.md,
  },
  modalRejectConfirmText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
  },
});
