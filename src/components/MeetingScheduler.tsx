import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import { Colors, Typography, Layout } from '../theme/tokens';
import { MeetingPolicyService } from '../services/meetings/MeetingPolicyService';
import { processAndUploadAttachment } from '../utils/attachmentPipeline';

interface MeetingSchedulerProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PLATFORMS = [
  { id: 'Google Meet', label: 'Google Meet', icon: 'videocam-outline' },
  { id: 'Zoom', label: 'Zoom', icon: 'videocam-outline' },
  { id: 'Microsoft Teams', label: 'MS Teams', icon: 'people-outline' },
  { id: 'In-Person', label: 'In-Person', icon: 'location-outline' },
  { id: 'Other', label: 'Other', icon: 'link-outline' },
];

export function MeetingScheduler({ visible, onClose, onSuccess }: MeetingSchedulerProps) {
  const { session, profile } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agenda, setAgenda] = useState('');
  const [startDate, setStartDate] = useState(new Date(Date.now() + 15 * 60 * 1000));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 75 * 60 * 1000));

  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');

  const [platform, setPlatform] = useState('Google Meet');
  const [meetingLink, setMeetingLink] = useState('');

  // Participants
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isEveryoneSelected, setIsEveryoneSelected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; uri: string; size?: number; type?: string }[]>([]);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchUsers();
    }
  }, [visible, profile]);

  const fetchUsers = async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, department_id, department:departments(id, name)')
        .eq('is_approved', true)
        .order('full_name');

      if (error) throw error;
      setAllUsers((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching users for meeting:', err);
    }
  };

  // Compute eligible participants based on policy
  const { eligibleUsers, canSelectEveryone, everyoneScopeLabel } = useMemo(() => {
    if (!profile) return { eligibleUsers: [], canSelectEveryone: false, everyoneScopeLabel: '' };
    return MeetingPolicyService.getEligibleParticipants(profile as any, allUsers);
  }, [profile, allUsers]);

  // Filtered by search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return eligibleUsers;
    const q = searchQuery.toLowerCase();
    return eligibleUsers.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      (((u as any).department?.name || (u as any).departments?.name || '')).toLowerCase().includes(q)
    );
  }, [eligibleUsers, searchQuery]);

  // Selected participant objects
  const selectedParticipants = useMemo(() => {
    if (isEveryoneSelected) return eligibleUsers;
    return allUsers.filter(u => selectedUserIds.includes(u.id));
  }, [isEveryoneSelected, eligibleUsers, allUsers, selectedUserIds]);

  // Determine required sequential approval steps
  const permissionCheck = useMemo(() => {
    if (!profile) return { requiresApproval: false, approvalSteps: [] };
    return MeetingPolicyService.determineApprovalChain(
      profile as any,
      selectedParticipants as any,
      allUsers as any
    );
  }, [profile, selectedParticipants, allUsers]);

  const toggleSelectUser = (userId: string) => {
    setIsEveryoneSelected(false);
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleEveryone = () => {
    if (isEveryoneSelected) {
      setIsEveryoneSelected(false);
      setSelectedUserIds([]);
    } else {
      setIsEveryoneSelected(true);
      setSelectedUserIds(eligibleUsers.map(u => u.id));
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setAttachments(prev => [
          ...prev,
          { name: asset.name, uri: asset.uri, size: asset.size, type: asset.mimeType },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to select attachment');
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    const isStart = showPicker === 'start';
    const timestamp = event?.nativeEvent?.timestamp;
    const finalDate = selectedDate || (timestamp ? new Date(timestamp) : undefined);

    if (finalDate) {
      if (Platform.OS === 'android') {
        if (pickerMode === 'date') {
          const current = isStart ? startDate : endDate;
          const newDate = new Date(current);
          newDate.setFullYear(finalDate.getFullYear(), finalDate.getMonth(), finalDate.getDate());
          if (isStart) {
            setStartDate(newDate);
            if (endDate <= newDate) setEndDate(new Date(newDate.getTime() + 3600000));
          } else {
            setEndDate(newDate);
          }
          setPickerMode('time');
        } else {
          const current = isStart ? startDate : endDate;
          const newDate = new Date(current);
          newDate.setHours(finalDate.getHours(), finalDate.getMinutes());
          if (isStart) {
            setStartDate(newDate);
            if (endDate <= newDate) setEndDate(new Date(newDate.getTime() + 3600000));
          } else {
            setEndDate(newDate);
          }
          setShowPicker(null);
        }
      } else {
        if (isStart) {
          setStartDate(finalDate);
          if (endDate <= finalDate) setEndDate(new Date(finalDate.getTime() + 3600000));
        } else {
          setEndDate(finalDate);
        }
      }
    } else {
      setShowPicker(null);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Required Field', 'Please enter a meeting title.');
      return;
    }
    if (endDate <= startDate) {
      Alert.alert('Invalid Time', 'Meeting end time must be after start time.');
      return;
    }
    if (selectedParticipants.length === 0) {
      Alert.alert('Required Field', 'Please select at least one participant.');
      return;
    }
    if (!profile) return;

    try {
      setLoading(true);

      const requiresApproval = permissionCheck.requiresApproval;
      const initialStatus = requiresApproval ? 'Pending_Approval' : 'Scheduled';

      // 1. Create meeting record
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          agenda: agenda.trim() || null,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          organizer_id: profile.id,
          department_id: profile.department_id || null,
          meeting_platform: platform,
          meeting_link: meetingLink.trim() || null,
          status: initialStatus,
        })
        .select()
        .single();

      if (meetingError) throw meetingError;

      // 2. Add organizer and participants (deduplicated)
      const otherParticipants = selectedParticipants.filter(u => u.id !== profile.id);
      const participantRows = [
        { meeting_id: meeting.id, user_id: profile.id, role: 'Organizer' },
        ...otherParticipants.map(u => ({
          meeting_id: meeting.id,
          user_id: u.id,
          role: 'Participant',
        })),
      ];

      const { error: partError } = await supabase
        .from('meeting_participants')
        .insert(participantRows);

      if (partError) throw partError;

      // 3. If approval required, insert sequential meeting_approvals records
      if (requiresApproval && permissionCheck.approvalSteps.length > 0) {
        const approvalRows = permissionCheck.approvalSteps.map(step => ({
          meeting_id: meeting.id,
          requester_id: profile.id,
          approver_id: step.approverId,
          approver_role: step.approverRole,
          sequence_order: step.sequenceOrder,
          status: step.status,
        }));

        const { error: appError } = await supabase
          .from('meeting_approvals')
          .insert(approvalRows);

        if (appError) throw appError;

        // Notify the first pending approver
        const firstStep = permissionCheck.approvalSteps[0];
        if (firstStep?.approverId) {
          await supabase.from('notifications').insert({
            user_id: firstStep.approverId,
            title: 'Meeting Request for Approval',
            body: `${profile.full_name || 'An employee'} requested a meeting: "${title.trim()}". Your approval is required.`,
            type: 'meeting_approval_required',
            metadata: { meeting_id: meeting.id },
          });
        }
      } else {
        // Direct confirmation: notify all participants
        for (const p of selectedParticipants) {
          await supabase.from('notifications').insert({
            user_id: p.id,
            title: 'New Meeting Scheduled',
            body: `${profile.full_name || 'Organizer'} scheduled a meeting: "${title.trim()}" on ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            type: 'meeting_invite',
            metadata: { meeting_id: meeting.id },
          });
        }
      }

      // 4. Upload attachments if any
      for (const att of attachments) {
        try {
          const uploadRes = await processAndUploadAttachment(
            att.uri,
            att.name,
            att.type || 'application/octet-stream',
            'task_attachments',
            profile.id,
            0,
            att.size
          );
          if (uploadRes?.url) {
            await supabase.from('meeting_files').insert({
              meeting_id: meeting.id,
              file_name: att.name,
              file_url: uploadRes.url,
              file_type: att.type || 'document',
              file_size: att.size || null,
              uploaded_by: profile.id,
            });
          }
        } catch (uploadErr) {
          console.warn('Failed to upload meeting attachment:', uploadErr);
        }
      }

      Alert.alert(
        requiresApproval ? 'Meeting Request Submitted' : 'Meeting Scheduled',
        requiresApproval
          ? 'Your meeting request has been submitted for hierarchical management approval.'
          : 'Your meeting has been successfully confirmed and scheduled.'
      );

      // Reset form
      setTitle('');
      setDescription('');
      setAgenda('');
      setMeetingLink('');
      setSelectedUserIds([]);
      setIsEveryoneSelected(false);
      setAttachments([]);

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating meeting:', err);
      Alert.alert('Error', err.message || 'Failed to create meeting.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                {profile?.role === 'Employee' ? 'Request / Schedule Meeting' : 'Schedule Meeting'}
              </Text>
              <Text style={styles.modalSubtitle}>ZeroTask Meeting Engine</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* Title */}
            <Text style={styles.inputLabel}>Meeting Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Sprint Planning, Project Kickoff"
              placeholderTextColor={Colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Description & Agenda */}
            <Text style={styles.inputLabel}>Description & Agenda</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Meeting objectives, topics to discuss, or preparation notes..."
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            {/* Date & Time Selectors */}
            <Text style={styles.inputLabel}>Timing & Duration *</Text>
            <View style={styles.timeRow}>
              <TouchableOpacity
                style={styles.timeBox}
                onPress={() => { setShowPicker('start'); setPickerMode('date'); }}
                activeOpacity={0.7}
              >
                <Text style={styles.timeBoxLabel}>Start Time</Text>
                <Text style={styles.timeBoxValue}>{formatDateTime(startDate)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.timeBox}
                onPress={() => { setShowPicker('end'); setPickerMode('date'); }}
                activeOpacity={0.7}
              >
                <Text style={styles.timeBoxLabel}>End Time</Text>
                <Text style={styles.timeBoxValue}>{formatDateTime(endDate)}</Text>
              </TouchableOpacity>
            </View>

            {showPicker && (
              <DateTimePicker
                value={showPicker === 'start' ? startDate : endDate}
                mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
                display="default"
                onValueChange={onChangeDate}
                onDismiss={() => setShowPicker(null)}
                minimumDate={new Date()}
              />
            )}

            {/* Meeting Platform */}
            <Text style={styles.inputLabel}>Meeting Platform</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.platformScroll}>
              {PLATFORMS.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.platformChip, platform === p.id && styles.platformChipActive]}
                  onPress={() => setPlatform(p.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={p.icon as any}
                    size={14}
                    color={platform === p.id ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.platformChipText, platform === p.id && styles.platformChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Meeting Link */}
            {platform !== 'In-Person' && (
              <>
                <Text style={styles.inputLabel}>Meeting URL / Link</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://meet.google.com/... or https://zoom.us/j/..."
                  placeholderTextColor={Colors.textMuted}
                  value={meetingLink}
                  onChangeText={setMeetingLink}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </>
            )}

            {/* Participants */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.inputLabel}>Participants * ({selectedParticipants.length} selected)</Text>
              {canSelectEveryone && (
                <TouchableOpacity
                  style={[styles.everyoneBtn, isEveryoneSelected && styles.everyoneBtnActive]}
                  onPress={handleToggleEveryone}
                >
                  <Text style={[styles.everyoneBtnText, isEveryoneSelected && styles.everyoneBtnTextActive]}>
                    {isEveryoneSelected ? '✓ Everyone' : `+ ${everyoneScopeLabel}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Search User Input */}
            <TextInput
              style={[styles.input, styles.searchInput]}
              placeholder="Search eligible team members..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            {/* Scrollable User List Container */}
            <View style={styles.userListWrapper}>
              <ScrollView
                style={styles.userListScroll}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
                contentContainerStyle={styles.userListContent}
              >
                {filteredUsers.length === 0 ? (
                  <Text style={styles.noUsersText}>No eligible participants found.</Text>
                ) : (
                  filteredUsers.map(user => {
                    const isSelected = selectedUserIds.includes(user.id) || isEveryoneSelected;
                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={[styles.userItem, isSelected && styles.userItemActive]}
                        onPress={() => toggleSelectUser(user.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                          {isSelected && <Ionicons name="checkmark" size={14} color={Colors.textInverse} />}
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.userName}>{user.full_name}</Text>
                          <Text style={styles.userRole}>
                            {user.role} {(user as any).department?.name || (user as any).departments?.name ? `· ${(user as any).department?.name || (user as any).departments?.name}` : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>

            {/* Approval Workflow Preview Banner */}
            {permissionCheck.requiresApproval && (
              <View style={styles.approvalBanner}>
                <View style={styles.approvalHeader}>
                  <Ionicons name="shield-checkmark" size={16} color="#d97706" />
                  <Text style={styles.approvalTitle}>Sequential Approval Required</Text>
                </View>
                <Text style={styles.approvalDesc}>{permissionCheck.reason}</Text>
                <View style={styles.stepperContainer}>
                  {permissionCheck.approvalSteps.map((step, idx) => (
                    <View key={step.sequenceOrder} style={styles.stepRow}>
                      <View style={styles.stepNumberBadge}>
                        <Text style={styles.stepNumberText}>{step.sequenceOrder}</Text>
                      </View>
                      <Text style={styles.stepApproverText}>
                        {step.approverRole}: <Text style={{ fontWeight: '700' }}>{step.approverName}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Attachments Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.inputLabel}>Documents & Attachments</Text>
              <TouchableOpacity style={styles.addAttachBtn} onPress={handlePickDocument}>
                <Ionicons name="attach" size={16} color={Colors.primary} />
                <Text style={styles.addAttachBtnText}>Add Document</Text>
              </TouchableOpacity>
            </View>

            {attachments.length > 0 && (
              <View style={styles.attachList}>
                {attachments.map((att, idx) => (
                  <View key={idx} style={styles.attachItem}>
                    <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                    <Text style={styles.attachName} numberOfLines={1}>{att.name}</Text>
                    <TouchableOpacity onPress={() => handleRemoveAttachment(idx)}>
                      <Ionicons name="close-circle" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Footer Submit */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.textInverse} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {permissionCheck.requiresApproval ? 'Submit Meeting Request' : 'Schedule Meeting'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
    padding: Layout.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Layout.spacing.md,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
  },
  formScroll: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: Layout.spacing.sm,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textPrimary,
  },
  multilineInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  searchInput: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeBox: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    padding: 10,
    alignItems: 'center',
  },
  timeBoxLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  timeBoxValue: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  platformScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.radius.full,
    marginRight: 8,
    gap: 6,
  },
  platformChipActive: {
    borderColor: Colors.primary,
    backgroundColor: '#eff6ff',
  },
  platformChipText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  platformChipTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Layout.spacing.sm,
    marginBottom: 6,
  },
  everyoneBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.radius.full,
    backgroundColor: '#f1f5f9',
  },
  everyoneBtnActive: {
    backgroundColor: '#dbeafe',
  },
  everyoneBtnText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
  },
  everyoneBtnTextActive: {
    color: Colors.primary,
  },
  userListWrapper: {
    height: 180,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    overflow: 'hidden',
    marginBottom: Layout.spacing.md,
  },
  userListScroll: {
    flex: 1,
  },
  userListContent: {
    padding: 6,
  },
  noUsersText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  userItemActive: {
    backgroundColor: '#f1f5f9',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  userName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  userRole: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  approvalBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fef3c7',
    borderRadius: Layout.radius.md,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  approvalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  approvalTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: '#92400e',
  },
  approvalDesc: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: '#78350f',
    marginTop: 2,
    marginBottom: 8,
  },
  stepperContainer: {
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepNumberBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#d97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: Colors.textInverse,
    fontSize: 10,
    fontWeight: 'bold',
  },
  stepApproverText: {
    fontSize: 12,
    color: '#92400e',
  },
  addAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addAttachBtnText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  attachList: {
    gap: 6,
    marginBottom: 10,
  },
  attachItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 8,
    borderRadius: 6,
    gap: 8,
  },
  attachName: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Layout.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
  },
  submitBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
});
