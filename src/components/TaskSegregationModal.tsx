import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '../services/api/apiClient';
import { useAuth } from '../context/AuthContext';
import { Task, User } from '../types';
import { Colors, Typography, Layout } from '../theme/tokens';
import { TaskSegregationService, ChildTaskInput } from '../services/tasks/TaskSegregationService';
import { Avatar } from './ui/Avatar';
import { AnimatedPressable } from './ui/AnimatedPressable';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import { uploadPendingVoiceNotes, PendingVoiceNote } from '../services/tasks/VoiceNoteService';
import {
  processAndUploadAttachment,
  validateAttachment,
  formatFileSize,
  MAX_TASK_ATTACHMENT_BYTES,
  SUPPORTED_DOCUMENT_MIME_TYPES,
} from '../utils/attachmentPipeline';

interface TaskSegregationModalProps {
  visible: boolean;
  parentTask: Task | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface DraftChildTask {
  id: string;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  dueDate: Date | null;
  assigneeIds: string[];
  documents: DocumentPicker.DocumentPickerAsset[];
  voiceNotes: PendingVoiceNote[];
}

export const TaskSegregationModal: React.FC<TaskSegregationModalProps> = ({
  visible,
  parentTask,
  onClose,
  onSuccess,
}) => {
  const { profile, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [eligibleUsers, setEligibleUsers] = useState<User[]>([]);
  const [fetchingUsers, setFetchingUsers] = useState(false);

  // Child tasks state
  const [childTasks, setChildTasks] = useState<DraftChildTask[]>([
    {
      id: '1',
      title: '',
      description: '',
      priority: 'Medium',
      dueDate: null,
      assigneeIds: [],
      documents: [],
      voiceNotes: [],
    },
  ]);

  // Date picker tracking
  const [activeDatePickerIndex, setActiveDatePickerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (visible && parentTask) {
      setChildTasks([
        {
          id: Date.now().toString(),
          title: '',
          description: '',
          priority: 'Medium',
          dueDate: null,
          assigneeIds: [],
          documents: [],
          voiceNotes: [],
        },
      ]);
      fetchEligibleUsers();
    }
  }, [visible, parentTask]);

  const fetchEligibleUsers = async () => {
    if (!profile) return;
    try {
      setFetchingUsers(true);
      // Canonical runtime: GET /users returns company-scoped users (no Supabase)
      const usersRes = await apiClient.get<any[]>('/users');
      if (usersRes.error) throw new Error(usersRes.error.message);
      const data = usersRes.data || [];

      const myDeptId = profile.department_id || parentTask?.department_id;
      const currentUserId = session?.user?.id || profile.id;

      // Filter by role hierarchy & cross-department peer rules:
      const eligible = (data || []).filter((u: any) => {
        // Exclude current delegator from assigning subtasks to themselves repeatedly
        if (u.id === profile.id || u.id === currentUserId) return false;

        // Super Admin and Founder can NEVER be assignees
        if (u.role === 'Super Admin' || u.role === 'Founder') return false;

        // 1. Founder & Super Admin can assign to anyone across departments
        if (profile.role === 'Founder' || profile.role === 'Super Admin') return true;

        // 2. Department Head:
        // - Can assign to anyone in own department (Managers, Employees, Head)
        // - AND can assign to other Department Heads in OTHER departments
        if (profile.role === 'Department Head') {
          if (u.department_id === myDeptId) return true;
          if (u.role === 'Department Head') return true; // Peer Department Head
          return false;
        }

        // 3. Manager:
        // - Can assign to anyone in own department (Employees, Managers)
        // - AND can assign to other Managers in OTHER departments
        if (profile.role === 'Manager') {
          if (u.department_id === myDeptId) return true;
          if (u.role === 'Manager') return true; // Peer Manager
          return false;
        }

        // 4. Employee:
        // - Can assign to other Employees in own department (and department managers)
        if (profile.role === 'Employee') {
          if (u.department_id === myDeptId) return true;
          return false;
        }

        // 5. Execution Team:
        return true;
      });

      // Role hierarchy & Department sorting:
      // Group: Own department first, then cross-department peers
      const roleRank: Record<string, number> = {
        'Department Head': 1,
        'Manager': 2,
        'Employee': 3,
        'Execution Team': 4,
      };

      const sorted = eligible.sort((a: any, b: any) => {
        const isOwnA = a.department_id === myDeptId ? 0 : 1;
        const isOwnB = b.department_id === myDeptId ? 0 : 1;
        if (isOwnA !== isOwnB) return isOwnA - isOwnB;

        const rankA = roleRank[a.role] || 99;
        const rankB = roleRank[b.role] || 99;
        if (rankA !== rankB) return rankA - rankB;

        return (a.full_name || '').localeCompare(b.full_name || '');
      });

      setEligibleUsers(sorted as User[]);

      // Auto-assign any subtasks that don't have an assignee yet
      if (sorted.length > 0) {
        setChildTasks(prev =>
          prev.map((c, idx) => ({
            ...c,
            assigneeIds: c.assigneeIds && c.assigneeIds.length > 0 ? c.assigneeIds : [sorted[idx % sorted.length]?.id ?? sorted[0].id],
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching eligible users for segregation:', err);
    } finally {
      setFetchingUsers(false);
    }
  };

  const handleAddChild = () => {
    const nextAssignee = eligibleUsers.length > 0
      ? (eligibleUsers[childTasks.length % eligibleUsers.length]?.id ?? eligibleUsers[0].id)
      : null;

    setChildTasks(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        title: '',
        description: '',
        priority: 'Medium',
        dueDate: null,
        assigneeIds: nextAssignee ? [nextAssignee] : [],
        documents: [],
        voiceNotes: [],
      },
    ]);
  };

  const handleRemoveChild = (index: number) => {
    if (childTasks.length <= 1) {
      Alert.alert('Notice', 'You must have at least one subtask to decompose.');
      return;
    }
    setChildTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateChild = (index: number, fields: Partial<DraftChildTask>) => {
    setChildTasks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...fields };
      return updated;
    });
  };

  const getFileIconName = (fileName: string) => {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return { icon: 'document-text', color: '#DC2626' };
    if (['doc', 'docx'].includes(ext)) return { icon: 'document-text-outline', color: '#2563EB' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'grid-outline', color: '#16A34A' };
    if (['ppt', 'pptx'].includes(ext)) return { icon: 'easel-outline', color: '#EA580C' };
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return { icon: 'image-outline', color: '#0284C7' };
    if (ext === 'zip') return { icon: 'archive-outline', color: '#7C3AED' };
    return { icon: 'document-outline', color: '#64748B' };
  };

  const handlePickDocuments = async (subtaskIndex: number) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_DOCUMENT_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        const currentSubtask = childTasks[subtaskIndex];
        const existingDocsBytes = (currentSubtask.documents || []).reduce(
          (acc, d) => acc + (d.size || 0),
          0
        );
        const existingVoiceBytes = (currentSubtask.voiceNotes || []).reduce(
          (acc, v) => acc + (v.fileSize || 0),
          0
        );
        let runningTotal = existingDocsBytes + existingVoiceBytes;
        const validDocs: DocumentPicker.DocumentPickerAsset[] = [];

        for (const doc of result.assets) {
          const validation = validateAttachment(
            { name: doc.name, size: doc.size, mimeType: doc.mimeType },
            runningTotal
          );
          if (!validation.valid) {
            Alert.alert('Validation Error', validation.error || 'Invalid file');
            return;
          }
          runningTotal += doc.size || 0;
          validDocs.push(doc);
        }

        handleUpdateChild(subtaskIndex, {
          documents: [...(currentSubtask.documents || []), ...validDocs],
        });
      }
    } catch (err) {
      console.error('Error picking documents for subtask:', err);
      Alert.alert('Error', 'Could not open document picker.');
    }
  };

  const handleRemoveDocument = (subtaskIndex: number, docIndex: number) => {
    const currentSubtask = childTasks[subtaskIndex];
    const updatedDocs = (currentSubtask.documents || []).filter((_, i) => i !== docIndex);
    handleUpdateChild(subtaskIndex, { documents: updatedDocs });
  };

  const handleSubmit = async () => {
    if (!parentTask) return;

    // 1. Validation: Title and Assignee are both strictly mandatory
    for (let i = 0; i < childTasks.length; i++) {
      const item = childTasks[i];
      if (!item.title.trim()) {
        Alert.alert('Validation Error', `Please enter a title for Subtask #${i + 1}.`);
        return;
      }
      if (!item.assigneeIds || item.assigneeIds.length === 0) {
        Alert.alert(
          'Assignee Required',
          `Please select an assignee for Subtask #${i + 1}. Assigning each subtask is mandatory.`
        );
        return;
      }
    }

    try {
      setLoading(true);
      setUploadProgress('Creating execution subtasks...');

      const payload: ChildTaskInput[] = childTasks.map(c => ({
        title: c.title.trim(),
        description: c.description.trim() || undefined,
        priority: c.priority,
        due_date: c.dueDate ? c.dueDate.toISOString() : null,
        assignee_ids: c.assigneeIds || [],
        execution_classification: parentTask.execution_classification || 'Operational',
      }));

      const res = await TaskSegregationService.segregateTask(parentTask.id, payload);

      if (!res.success) {
        const errorMsg = typeof res.error === 'string'
          ? res.error
          : (res.error as any)?.message || JSON.stringify(res.error) || 'Failed to create execution subtasks.';
        throw new Error(errorMsg);
      }

      const createdIds = res.child_ids || [];
      const currentUserId = session?.user?.id || profile?.id;

      // 2. Upload documents and voice notes for each created subtask
      for (let i = 0; i < childTasks.length; i++) {
        const subtaskId = createdIds[i];
        if (!subtaskId) continue;

        const draft = childTasks[i];

        // A. Upload documents
        if (draft.documents && draft.documents.length > 0) {
          for (let d = 0; d < draft.documents.length; d++) {
            const doc = draft.documents[d];
            setUploadProgress(`Subtask #${i + 1}: Uploading document ${d + 1}/${draft.documents.length}...`);
            try {
              const resultData = await processAndUploadAttachment(
                doc.uri,
                doc.name,
                doc.mimeType || 'application/octet-stream',
                'task_attachments',
                currentUserId || 'system',
                0,
                doc.size
              );

              await apiClient.post(`/tasks/${subtaskId}/files`, {
                file_url: resultData.url,
                file_name: resultData.name,
                file_type: resultData.type,
                file_size: resultData.size,
                mime_type: resultData.mimeType,
                storage_path: resultData.storagePath,
              });
            } catch (uploadErr) {
              console.error(`Error uploading document for subtask ${subtaskId}:`, uploadErr);
            }
          }
        }

        // B. Upload voice notes
        if (draft.voiceNotes && draft.voiceNotes.length > 0) {
          setUploadProgress(`Subtask #${i + 1}: Uploading ${draft.voiceNotes.length} voice note(s)...`);
          try {
            await uploadPendingVoiceNotes(subtaskId, currentUserId || 'system', draft.voiceNotes);
          } catch (voiceErr) {
            console.error(`Error uploading voice notes for subtask ${subtaskId}:`, voiceErr);
          }
        }
      }

      setUploadProgress(null);

      Alert.alert(
        'Task Segregated Successfully',
        `"${parentTask.title}" was decomposed into ${res.created_count} execution subtask${res.created_count > 1 ? 's' : ''}. The original assigner and Founder have been notified.`,
        [
          {
            text: 'OK',
            onPress: () => {
              onSuccess();
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      console.error('Task segregation submit error:', err);
      const displayMsg = err?.message
        ? (typeof err.message === 'string' ? err.message : JSON.stringify(err.message))
        : (typeof err === 'object' ? JSON.stringify(err) : String(err));
      Alert.alert('Segregation Failed', displayMsg || 'An error occurred while creating subtasks.');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const renderAssigneePicker = (index: number, selectedIds: string[]) => {
    const myDeptId = profile?.department_id || parentTask?.department_id;

    return (
      <View style={styles.assigneeSection}>
        <View style={styles.assigneeHeaderRow}>
          <Text style={styles.fieldLabel}>
            Assignee <Text style={styles.mandatoryStar}>* (Mandatory)</Text>
          </Text>
          {selectedIds.length === 0 && (
            <Text style={styles.assigneeRequiredBadge}>Selection Required</Text>
          )}
        </View>

        <View style={styles.assigneeWrapContainer}>
          {eligibleUsers.length === 0 ? (
            <Text style={styles.noEligibleText}>No eligible team members found to assign.</Text>
          ) : (
            eligibleUsers.map(u => {
              const isSelected = selectedIds.includes(u.id);
              const isHead = u.role === 'Department Head';
              const isManager = u.role === 'Manager';
              const isEmployee = u.role === 'Employee';
              const isOtherDept = myDeptId && u.department_id && u.department_id !== myDeptId;

              return (
                <TouchableOpacity
                  key={u.id}
                  style={[
                    styles.assigneeChip,
                    isSelected && styles.assigneeChipActive,
                    isOtherDept && styles.assigneeChipOtherDept,
                  ]}
                  onPress={() => {
                    const current = childTasks[index].assigneeIds || [];
                    const next = current.includes(u.id)
                      ? current.filter(id => id !== u.id)   // deselect
                      : [...current, u.id];                  // select
                    handleUpdateChild(index, { assigneeIds: next });
                  }}
                >
                  <Avatar name={u.full_name} size={18} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.assigneeChipText, isSelected && styles.assigneeChipTextActive]}>
                      {u.full_name || u.email}
                    </Text>
                    <View
                      style={[
                        styles.roleBadge,
                        isHead && styles.roleBadgeHead,
                        isManager && styles.roleBadgeManager,
                        isEmployee && styles.roleBadgeEmployee,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          isHead && { color: '#4f46e5' },
                          isManager && { color: '#2563eb' },
                          isEmployee && { color: '#059669' },
                        ]}
                      >
                        {isOtherDept && (u as any).department?.name ? `${(u as any).department.name} · ` : ''}
                        {isHead ? 'Head' : isManager ? 'Manager' : isEmployee ? 'Employee' : u.role}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Add Subtasks</Text>
              <Text style={styles.modalSub} numberOfLines={1}>
                Parent: <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{parentTask?.title}</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.infoBanner}>
              <Ionicons name="git-branch-outline" size={18} color={Colors.primary} />
              <Text style={styles.infoBannerText}>
                Create linked execution subtasks under this major task with assigned owners and deadlines.
              </Text>
            </View>

            {/* Child Tasks List */}
            {childTasks.map((child, index) => {
              const priorityOptions: ('Low' | 'Medium' | 'High' | 'Urgent')[] = ['Low', 'Medium', 'High', 'Urgent'];

              return (
                <View key={child.id} style={styles.subtaskCard}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.badgeIndex}>
                      <Text style={styles.badgeIndexText}>Subtask #{index + 1}</Text>
                    </View>
                    {childTasks.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemoveChild(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Title */}
                  <Text style={styles.fieldLabel}>Title *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Collect data, Prepare draft, Review..."
                    placeholderTextColor={Colors.textMuted}
                    value={child.title}
                    onChangeText={text => handleUpdateChild(index, { title: text })}
                  />

                  {/* Description */}
                  <Text style={styles.fieldLabel}>Instructions / Notes (Optional)</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 50, textAlignVertical: 'top' }]}
                    placeholder="Specific execution requirements..."
                    placeholderTextColor={Colors.textMuted}
                    value={child.description}
                    onChangeText={text => handleUpdateChild(index, { description: text })}
                    multiline
                  />

                  {/* Priority & Deadline Row */}
                  <View style={styles.rowTwoCol}>
                    {/* Priority */}
                    <View style={{ flex: 1, marginRight: 6 }}>
                      <Text style={styles.fieldLabel}>Priority</Text>
                      <View style={styles.priorityRow}>
                        {priorityOptions.map(p => {
                          const isSelected = child.priority === p;
                          let pColor = Colors.primary;
                          if (p === 'Urgent') pColor = Colors.danger;
                          if (p === 'High') pColor = '#ea580c';
                          if (p === 'Medium') pColor = '#2563eb';
                          if (p === 'Low') pColor = Colors.textMuted;

                          return (
                            <TouchableOpacity
                              key={p}
                              style={[
                                styles.priorityPill,
                                isSelected && { backgroundColor: pColor, borderColor: pColor },
                              ]}
                              onPress={() => handleUpdateChild(index, { priority: p })}
                            >
                              <Text
                                style={[
                                  styles.priorityPillText,
                                  isSelected && { color: Colors.textInverse, fontWeight: '700' },
                                ]}
                              >
                                {p[0]}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Deadline */}
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Text style={styles.fieldLabel}>Deadline</Text>
                      <TouchableOpacity
                        style={styles.datePickerBtn}
                        onPress={() => setActiveDatePickerIndex(index)}
                      >
                        <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                        <Text style={styles.datePickerBtnText} numberOfLines={1}>
                          {child.dueDate ? child.dueDate.toLocaleDateString() : 'Set Date'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Assignee Picker */}
                  {renderAssigneePicker(index, child.assigneeIds || [])}

                  {/* Documents / Attachments Section */}
                  <View style={styles.attachmentSection}>
                    <View style={styles.attachmentHeaderRow}>
                      <Text style={styles.fieldLabel}>Documents & Attachments</Text>
                      <Text style={styles.sizeIndicator}>
                        {formatFileSize(
                          (child.documents || []).reduce((acc, d) => acc + (d.size || 0), 0) +
                          (child.voiceNotes || []).reduce((acc, v) => acc + (v.fileSize || 0), 0)
                        )} / 20 MB
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.attachBtn}
                      onPress={() => handlePickDocuments(index)}
                      disabled={loading}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="document-attach-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.attachBtnText}>+ Attach Document</Text>
                    </TouchableOpacity>

                    {child.documents && child.documents.length > 0 && (
                      <View style={styles.docList}>
                        {child.documents.map((doc, docIdx) => {
                          const iconInfo = getFileIconName(doc.name);
                          return (
                            <View key={docIdx} style={styles.docItem}>
                              <View style={styles.docItemLeft}>
                                <Ionicons name={iconInfo.icon as any} size={18} color={iconInfo.color} style={{ marginRight: 6 }} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                                  <Text style={styles.docSize}>{formatFileSize(doc.size)}</Text>
                                </View>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleRemoveDocument(index, docIdx)}
                                disabled={loading}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Voice Notes Section */}
                  <View style={styles.voiceSection}>
                    <VoiceNoteRecorder
                      key={`segregation-voice-${visible ? 'open' : 'closed'}-${index}`}
                      notes={child.voiceNotes || []}
                      onChange={(notes) => handleUpdateChild(index, { voiceNotes: notes })}
                      existingAttachmentBytes={
                        (child.documents || []).reduce((acc, d) => acc + (d.size || 0), 0)
                      }
                      disabled={loading}
                    />
                  </View>

                  {/* Date Picker Modal for this item */}
                  {activeDatePickerIndex === index && (
                    <DateTimePicker
                      value={child.dueDate || new Date()}
                      mode="date"
                      display="default"
                      onValueChange={(event, selectedDate) => {
                        setActiveDatePickerIndex(null);
                        if (selectedDate) {
                          handleUpdateChild(index, { dueDate: selectedDate });
                        }
                      }}
                      onDismiss={() => setActiveDatePickerIndex(null)}
                    />
                  )}
                </View>
              );
            })}

            {/* Add Subtask Button */}
            <TouchableOpacity style={styles.addBtn} onPress={handleAddChild} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={styles.addBtnText}>+ Add Another Subtask</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Upload Progress Indicator */}
          {uploadProgress && (
            <View style={styles.progressBox}>
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.progressText}>{uploadProgress}</Text>
            </View>
          )}

          {/* Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <AnimatedPressable
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={loading}
              scaleTo={0.97}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.textInverse} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {childTasks.length === 1 ? 'Create Subtask' : `Create ${childTasks.length} Subtasks`}
                </Text>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Layout.radius.xl,
    borderTopRightRadius: Layout.radius.xl,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.lg,
    paddingBottom: Layout.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bodyScroll: {
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: Layout.radius.md,
    padding: Layout.spacing.sm,
    marginBottom: Layout.spacing.md,
    gap: 8,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 11,
    color: '#1e40af',
    lineHeight: 15,
  },
  subtaskCard: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.md,
    marginBottom: Layout.spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeIndex: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeIndexText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: 4,
    marginTop: 6,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  rowTwoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 4,
  },
  priorityPill: {
    flex: 1,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  priorityPillText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  datePickerBtn: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
  },
  datePickerBtnText: {
    fontSize: 11,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.medium,
  },
  assigneeSection: {
    marginTop: 8,
  },
  assigneeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 6,
  },
  mandatoryStar: {
    color: Colors.danger,
    fontFamily: Typography.fontFamily.bold,
  },
  assigneeRequiredBadge: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.danger,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noEligibleText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  assigneeWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  assigneeChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: Colors.primary,
  },
  assigneeChipOtherDept: {
    backgroundColor: '#faf5ff',
    borderColor: '#e9d5ff',
  },
  assigneeChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  assigneeChipTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  roleBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
  },
  roleBadgeHead: {
    backgroundColor: '#eef2ff',
  },
  roleBadgeManager: {
    backgroundColor: '#eff6ff',
  },
  roleBadgeEmployee: {
    backgroundColor: '#ecfdf5',
  },
  roleBadgeText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: Layout.radius.lg,
    paddingVertical: 10,
    backgroundColor: '#eff6ff',
    marginBottom: Layout.spacing.md,
    gap: 6,
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  submitBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
  attachmentSection: {
    marginTop: 10,
  },
  attachmentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sizeIndicator: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    marginBottom: 6,
  },
  attachBtnText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  docList: {
    gap: 6,
    marginBottom: 8,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  docItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  docName: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
  },
  docSize: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  voiceSection: {
    marginTop: 6,
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#eff6ff',
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginHorizontal: Layout.spacing.lg,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
  },
});
