import React, { forwardRef, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { ZeroInput } from './ZeroInput';
import { ZeroButton } from './ZeroButton';
import { MultiCompanyFilterSelector } from './MultiCompanyFilterSelector';
import { 
  processAndUploadAttachment, 
  validateAttachment, 
  formatFileSize, 
  MAX_TASK_ATTACHMENT_BYTES, 
  SUPPORTED_DOCUMENT_MIME_TYPES 
} from '../utils/attachmentPipeline';
import { useAuth } from '../context/AuthContext';
import { isFounder, isSuperAdmin, isExecutiveOrAdmin } from '../utils/permissions';
import { User, TaskPriority } from '../types';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
// Supabase removed: task creation now uses canonical FastAPI runtime
import { Colors, Typography, Layout } from '../theme/tokens';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import { PendingVoiceNote, uploadPendingVoiceNotes } from '../services/tasks/VoiceNoteService';
import { supabase } from '../lib/supabase';

import { TaskService } from '../services/tasks/TaskService';
import { apiClient } from '../services/api/apiClient';
import { TaskDraftService } from '../services/tasks/TaskDraftService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CreateTaskModalRef = BottomSheetModal;

interface CreateTaskModalProps {
  onSuccess?: (task: any) => void;
  parentTaskId?: string;
  parentTitle?: string;
  parentCompanyId?: string;
  visible?: boolean;
  onClose?: () => void;
}

export const CreateTaskModal = forwardRef<CreateTaskModalRef, CreateTaskModalProps>(({ onSuccess, parentTaskId, parentTitle, parentCompanyId, visible, onClose }, ref) => {
  const { session, profile } = useAuth();
  const snapPoints = useMemo(() => ['85%', '95%'], []);
  const contextKey = parentTaskId ? `subtask_${parentTaskId}` : 'root';
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  
  const [documents, setDocuments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<PendingVoiceNote[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [taskScope, setTaskScope] = useState<'General' | 'Department'>('General');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [taskMode, setTaskMode] = useState<'Delegated' | 'Self-Assigned'>('Delegated');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  const [draftLoaded, setDraftLoaded] = useState(false);
  const isClearingRef = useRef(false);
  const lastLoadedContextRef = useRef<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!profile || !profile.id) return;
    try {
      // Authoritative runtime: GET /tasks/{parent_task_id}/eligible-assignees or /tasks/eligible-assignees
      const url = parentTaskId 
        ? `/tasks/${parentTaskId}/eligible-assignees` 
        : `/tasks/eligible-assignees`;
      
      let usersList: any[] = [];
      try {
        const res = await apiClient.get<any[]>(url);
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          usersList = res.data;
        }
      } catch (apiErr) {
        // Fallback to Supabase
      }

      // If backend was unreachable or empty, fallback gracefully to Supabase
      if (usersList.length === 0) {
        try {
          const { data: sbUsers } = await supabase
            .from('users')
            .select('id, full_name, name, email, role, department_id, department:departments(id, name)');
          if (sbUsers && Array.isArray(sbUsers)) {
            usersList = sbUsers.filter((u: any) => {
              if (u.role === 'Super Admin') return false;
              if (['Employee', 'Manager', 'Department Head'].includes(profile?.role || '') && u.role === 'Founder') return false;
              return true;
            });
          }
        } catch {}
      }

      let filtered = (usersList || []).filter((u: any) =>
        u.is_active !== false &&
        u.is_deleted !== true
      );

      filtered.sort((a: any, b: any) => (a.full_name || a.name || '').localeCompare(b.full_name || b.name || ''));
      setAvailableUsers(filtered);
    } catch (err: any) {
      console.warn('[CreateTaskModal] Error fetching eligible assignees:', err);
    }
  }, [session, parentTaskId, profile]);

  useEffect(() => {
    if (session && profile?.id) {
      fetchUsers();
    }
  }, [fetchUsers, session, profile?.id]);

  // Always start with a completely clean, fresh form
  useEffect(() => {
    TaskDraftService.clearAllUserDrafts();
    setTitle('');
    setDescription('');
    setPriority('Medium');
    setDeadline(null);
    setAssigneeIds([]);
    setDocuments([]);
    setPendingVoiceNotes([]);
    setTaskScope('General');
    setSelectedDepartmentId(null);
    setSelectedCompanyIds([]);
    setTaskMode('Delegated');
    setDraftLoaded(true);
  }, [contextKey, profile?.role, visible, parentTaskId]);

  const filteredAvailableUsers = useMemo(() => {
    if (!availableUsers.length) return [];
    if (isSuperAdmin(profile) && selectedCompanyIds.length > 0) {
      return availableUsers.filter((u: any) => {
        const uCompId = String(u.company_id || u.company?.id || '');
        return selectedCompanyIds.includes(uCompId);
      });
    }
    return availableUsers;
  }, [availableUsers, selectedCompanyIds, profile]);

  const uniqueDepartments = useMemo(() => {
    const depts = new Map();
    filteredAvailableUsers.forEach(u => {
      if (u.department?.id) depts.set(u.department.id, u.department);
    });
    return Array.from(depts.values());
  }, [filteredAvailableUsers]);

  const groupedUsers = useMemo(() => {
    if (!filteredAvailableUsers.length) return [];
    
    const myDeptId = profile?.department_id;
    const canUseOrgScope = isExecutiveOrAdmin(profile);

    if (canUseOrgScope) {
      if (taskScope === 'General') {
        const groups: { [key: string]: any[] } = {};
        filteredAvailableUsers.forEach(u => {
          const deptName = u.department?.name || 'General';
          if (!groups[deptName]) groups[deptName] = [];
          groups[deptName].push(u);
        });
        return Object.keys(groups).sort().map(dept => ({
          sectionTitle: dept,
          users: groups[dept].sort((a, b) => (a.full_name || a.name || a.email || 'Unnamed User').localeCompare(b.full_name || b.name || b.email || 'Unnamed User'))
        }));
      } else {
        if (!selectedDepartmentId) return [];
        const usersInDept = filteredAvailableUsers.filter(u => u.department?.id === selectedDepartmentId);
        if (usersInDept.length === 0) return [];
        return [{
          sectionTitle: usersInDept[0]?.department?.name || 'Department',
          users: usersInDept.sort((a, b) => (a.full_name || a.name || a.email || 'Unnamed User').localeCompare(b.full_name || b.name || b.email || 'Unnamed User'))
        }];
      }
    }

    // For Department Head and Manager: Two groups: "Your Department" and "Other Departments"
    const yourDeptUsers: any[] = [];
    const otherDeptUsers: any[] = [];

    filteredAvailableUsers.forEach(u => {
      if (myDeptId && u.department?.id === myDeptId) {
        yourDeptUsers.push(u);
      } else {
        otherDeptUsers.push(u);
      }
    });

    // Sort users: Managers first, then Employees, then alphabetical by name
    const roleRank: Record<string, number> = { 'Department Head': 1, 'Manager': 2, 'Employee': 3 };
    const sortFn = (a: any, b: any) => {
      const rankA = roleRank[a.role] || 99;
      const rankB = roleRank[b.role] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return (a.full_name || a.name || a.email || 'Unnamed User').localeCompare(b.full_name || b.name || b.email || 'Unnamed User');
    };

    yourDeptUsers.sort(sortFn);
    otherDeptUsers.sort(sortFn);

    const result = [];
    if (yourDeptUsers.length > 0) {
      result.push({
        sectionTitle: 'Your Department',
        users: yourDeptUsers
      });
    }
    if (otherDeptUsers.length > 0) {
      result.push({
        sectionTitle: 'Other Departments',
        users: otherDeptUsers
      });
    }

    return result;
  }, [filteredAvailableUsers, profile, taskScope, selectedDepartmentId]);

  useEffect(() => {
    // Prune selected assignees that no longer belong to the active company/filter
    setAssigneeIds(prev =>
      prev.filter(id => filteredAvailableUsers.some(u => u.id === id))
    );
    if (selectedDepartmentId) {
      const exists = uniqueDepartments.some(d => d.id === selectedDepartmentId);
      if (!exists) setSelectedDepartmentId(null);
    }
  }, [filteredAvailableUsers, uniqueDepartments, taskScope, selectedDepartmentId]);

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    []
  );

  const totalAttachmentBytes = useMemo(() => {
    return documents.reduce((sum, d) => sum + (d.size || 0), 0);
  }, [documents]);

  const effectiveTaskMode = parentTaskId ? 'Delegated' : taskMode;

  const handlePickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_DOCUMENT_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: true
      });

      if (!result.canceled && result.assets) {
        let runningTotal = totalAttachmentBytes;
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

        setDocuments(prev => [...prev, ...validDocs]);
      }
    } catch (err) {
      console.log('Error picking documents', err);
      Alert.alert('Error', 'Could not open document picker.');
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(docs => docs.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!title.trim() || !session?.user) return;

    // Determine final assignees
    let finalAssignees = assigneeIds;
    if (finalAssignees.length === 0) {
      finalAssignees = [session.user.id];
    }

    // Pre-flight validation for Department tasks (root tasks only)
    if (!parentTaskId && taskScope === 'Department' && isExecutiveOrAdmin(profile) && selectedDepartmentId) {
      for (const uid of finalAssignees) {
        const u = availableUsers.find(user => user.id === uid);
        if (u && u.department?.id !== selectedDepartmentId) {
          Alert.alert('Validation Error', 'Cross-department assignment is forbidden. All assignees must belong to the selected department.');
          return;
        }
      }
    }

    // Pre-flight validation for Super Admin company scoping
    if (isSuperAdmin(profile) && selectedCompanyIds.length > 0) {
      for (const uid of finalAssignees) {
        const u = availableUsers.find(user => user.id === uid);
        const uCompId = String(u?.company_id || u?.company?.id || '');
        if (u && !selectedCompanyIds.includes(uCompId)) {
          Alert.alert(
            'Company Mismatch',
            `Assignee "${u.full_name || u.name || u.email}" does not belong to the selected target company.`
          );
          return;
        }
      }
    }

    setLoading(true);
    setUploadProgress('Creating task...');

    try {
      const isPrivateTask = Boolean(isFounder(profile) && !parentTaskId && taskMode === 'Self-Assigned');

      let targetCompanyIds: (string | null)[] = [null];
      if (parentCompanyId) {
        targetCompanyIds = [parentCompanyId];
      } else if (isSuperAdmin(profile)) {
        if (selectedCompanyIds.length > 0) {
          targetCompanyIds = selectedCompanyIds;
        } else {
          // If no specific company selected, infer company if all assignees belong to the same company
          const assigneeCompanies = Array.from(
            new Set(
              finalAssignees
                .map(uid => {
                  const u = availableUsers.find(user => user.id === uid);
                  return (u?.company_id || u?.company?.id || null) as string | null;
                })
                .filter(Boolean)
            )
          );
          if (assigneeCompanies.length === 1 && assigneeCompanies[0]) {
            targetCompanyIds = [assigneeCompanies[0]];
          }
        }
      } else {
        targetCompanyIds = [profile?.company_id || null];
      }

      let firstTaskData: any = null;
      let remainingVoiceNotes: PendingVoiceNote[] = [];
      let anyVoiceNotesFailed = false;

      for (let cIdx = 0; cIdx < targetCompanyIds.length; cIdx++) {
        const tCompanyId = targetCompanyIds[cIdx];
        const prefix = targetCompanyIds.length > 1 ? `[Co. ${cIdx + 1}/${targetCompanyIds.length}] ` : '';
        setUploadProgress(`${prefix}Creating task...`);

        const taskRes = await TaskService.createTask({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status: 'To Do',
          progress: 0,
          due_date: deadline ? deadline.toISOString() : undefined,
          department_id: isExecutiveOrAdmin(profile)
            ? (taskScope === 'General' ? undefined : selectedDepartmentId ?? undefined)
            : (profile?.department_id ?? undefined),
          company_id: tCompanyId || undefined,
          user_id: finalAssignees[0] ?? session.user.id,
          assignee_ids: finalAssignees,
          is_private: isPrivateTask,
          ...(parentTaskId ? { parent_task_id: parentTaskId } : {}),
        });

        if (taskRes.error || !taskRes.data) {
          throw new Error(taskRes.error?.message || 'Task creation failed');
        }

        if (!firstTaskData) firstTaskData = taskRes.data;
        const newTaskId = (taskRes.data as any).id;

        // 2. Upload Documents
        if (documents.length > 0) {
          for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            try {
              setUploadProgress(`${prefix}Uploading ${i + 1}/${documents.length}: ${doc.name}...`);
              const resultData = await processAndUploadAttachment(
                doc.uri,
                doc.name,
                doc.mimeType || 'application/octet-stream',
                'task-attachments',
                session.user.id,
                0,
                doc.size
              );

              const fileRes = await TaskService.createTaskFile(newTaskId, {
                file_url: resultData.url,
                file_name: resultData.name,
                file_type: resultData.type,
                file_size: resultData.size,
                mime_type: resultData.mimeType,
                storage_path: resultData.storagePath,
              });
              if (fileRes.error) throw new Error(fileRes.error.message);
            } catch (uploadOrDbErr: any) {
              console.error('[CreateTaskModal] Attachment processing failed:', uploadOrDbErr);
              await TaskService.deleteTask(newTaskId);
              throw new Error(`Attachment failed: ${uploadOrDbErr.message}. Task creation cancelled.`);
            }
          }
        }
        
        // 3. Upload Voice Notes
        if (pendingVoiceNotes.length > 0) {
          setUploadProgress(`${prefix}Uploading ${pendingVoiceNotes.length} voice note(s)...`);
          const voiceResult = await uploadPendingVoiceNotes(newTaskId, session.user.id, pendingVoiceNotes);
          if (voiceResult.failed > 0) {
            remainingVoiceNotes = voiceResult.failedNotes || [];
            anyVoiceNotesFailed = true;
          }
        }
      }

      if (anyVoiceNotesFailed) {
        Alert.alert(
          'Voice Note Upload Incomplete',
          `Tasks created successfully, but some voice notes could not be uploaded.\nYour recordings have been preserved for re-attachment.`
        );
      }

      // 4. Authoritative Success: Permanently clear all drafts and reset in-memory form
      isClearingRef.current = true;
      await TaskDraftService.clearAllUserDrafts();
      if (session?.user?.id) {
        try {
          const compId = (session.user as any).company_id || 'nocompany';
          await AsyncStorage.removeItem(`@zerotask_tasks_cache_${compId}_${session.user.id}_all`);
          await AsyncStorage.removeItem(`tasks_cache_${session.user.id}_all`);
        } catch {}
      }

      // Cleanup
      setTitle('');
      setDescription('');
      setPriority('Medium');
      setDocuments([]);
      setAssigneeIds([]);
      setPendingVoiceNotes([]);
      setUploadProgress('');
      setDeadline(null);
      setTaskScope('General');
      setSelectedDepartmentId(null);
      setTaskMode('Delegated');
      
      setTimeout(() => {
        isClearingRef.current = false;
      }, 500);

      if (ref && 'current' in ref && ref.current) {
        ref.current.dismiss();
      }
      onClose?.();
      onSuccess?.(firstTaskData);
    } catch (err: any) {
      console.error('Failed to create task:', err.message);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  const handleSheetChange = useCallback((index: number) => {
    if (index >= 0) {
      TaskDraftService.clearAllUserDrafts();
      setTitle('');
      setDescription('');
      setPriority('Medium');
      setDeadline(null);
      setAssigneeIds([]);
      setDocuments([]);
      setPendingVoiceNotes([]);
      setTaskScope('General');
      setSelectedDepartmentId(null);
      setSelectedCompanyIds([]);
      setTaskMode('Delegated');
    }
  }, [profile?.role, parentTaskId]);

  const currentTotalSize = documents.reduce((acc, curr) => acc + (curr.size || 0), 0);
  const sizeFormatted = (currentTotalSize / (1024 * 1024)).toFixed(2);
  const renderFormFields = () => (
    <>
      <Text style={styles.title}>{parentTaskId ? 'Add Subtask' : 'Create New Task'}</Text>
      {parentTaskId && parentTitle && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE' }}>
          <Ionicons name="git-branch-outline" size={14} color="#2563EB" />
          <Text style={{ fontSize: 12, color: '#475569', fontFamily: 'Inter_400Regular' }}>Part of:</Text>
          <Text style={{ fontSize: 12, color: '#1D4ED8', fontWeight: '600', flex: 1 }} numberOfLines={1}>{parentTitle}</Text>
        </View>
      )}
      
      <ZeroInput
        label="Task Title"
        placeholder="What needs to be done?"
        value={title}
        onChangeText={setTitle}
      />

      <View style={styles.spacer} />

      {!parentTaskId && (
        <>
          {isSuperAdmin(profile) && (
            <>
              <View style={styles.section}>
                <MultiCompanyFilterSelector
                  selectedCompanyIds={selectedCompanyIds}
                  onSelectCompanies={(ids) => setSelectedCompanyIds(ids)}
                  label="Target Companies"
                  placeholder="Select target companies..."
                  allOptionLabel="All Companies"
                />
              </View>
              <View style={styles.spacer} />
            </>
          )}
          <View style={styles.section}>
            <Text style={styles.label}>Task Mode</Text>
            <View style={styles.row}>
              {['Delegated', 'Self-Assigned'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.segmentBtn,
                    taskMode === mode && styles.segmentBtnActive,
                    taskMode === mode && { backgroundColor: Colors.semanticBlue },
                  ]}
                  onPress={() => {
                     setTaskMode(mode as any);
                  }}
                >
                  <Text style={[
                    styles.segmentText,
                    taskMode === mode && styles.segmentTextActive
                  ]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.spacer} />
        </>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Priority</Text>
        <View style={styles.row}>
          {['Low', 'Medium', 'High'].map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.segmentBtn,
                priority === p && styles.segmentBtnActive,
                priority === p && p === 'High' && { backgroundColor: Colors.semanticPeach },
                priority === p && p === 'Medium' && { backgroundColor: Colors.semanticYellow },
                priority === p && p === 'Low' && { backgroundColor: Colors.semanticSage },
              ]}
              onPress={() => setPriority(p as TaskPriority)}
            >
              <Text style={[
                styles.segmentText,
                priority === p && styles.segmentTextActive
              ]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.spacer} />

      <ZeroInput
        label="Description (Optional)"
        placeholder="Add more details..."
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <View style={styles.spacer} />

      <View style={styles.section}>
        <Text style={styles.label}>Deadline (Optional)</Text>
        <TouchableOpacity 
          style={styles.datePickerBtn}
          onPress={() => setShowDatePicker(true)}
        >
          <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <Text style={[styles.dateText, !deadline && { color: Colors.textMuted }]}>
            {deadline ? format(deadline, 'PPP') : 'Select deadline'}
          </Text>
          {deadline && (
            <TouchableOpacity onPress={() => setDeadline(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={deadline || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onValueChange={(_event, selectedDate) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (selectedDate) setDeadline(selectedDate);
          }}
          onDismiss={() => setShowDatePicker(false)}
        />
      )}

      <View style={styles.spacer} />

      <View style={styles.section}>
        <Text style={styles.label}>Assign To (Optional)</Text>
            
            <TouchableOpacity 
              style={styles.dropdownHeader}
              onPress={() => setShowDropdown(!showDropdown)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownHeaderText}>
                {assigneeIds.length === 0 
                  ? 'Select Assignees...' 
                  : `${assigneeIds.length} Assignee${assigneeIds.length > 1 ? 's' : ''} Selected`}
              </Text>
              <Ionicons 
                name={showDropdown ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={Colors.textSecondary} 
              />
            </TouchableOpacity>

            {showDropdown && (
              <View style={styles.dropdownList}>
                {groupedUsers.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: Colors.textMuted, fontSize: 13, fontFamily: Typography.fontFamily.medium }}>
                      No team members available
                    </Text>
                  </View>
                ) : (
                  groupedUsers.map((group) => (
                    <View key={group.sectionTitle}>
                      <View style={styles.groupHeader}>
                        <Text style={styles.groupHeaderText}>{group.sectionTitle}</Text>
                      </View>
                      {group.users.map((u: any) => {
                        const isSelected = assigneeIds.includes(u.id);
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[
                              styles.dropdownItem,
                              isSelected && styles.dropdownItemActive
                            ]}
                            onPress={() => {
                              if (isSelected) {
                                setAssigneeIds(prev => prev.filter(id => id !== u.id));
                              } else {
                                setAssigneeIds(prev => [...prev, u.id]);
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[
                                styles.dropdownItemText,
                                isSelected && styles.dropdownItemTextActive
                              ]}>
                                {u.full_name || u.name || u.email || 'Unnamed User'}
                              </Text>
                              <Text style={styles.dropdownItemSubtitle}>
                                {isSuperAdmin(profile) && u.company?.name ? `${u.company.name} · ` : ''}
                                {u.role || 'Member'} · {u.department?.name || 'General'}
                              </Text>
                            </View>
                            {isSelected ? (
                              <Ionicons name="checkbox" size={20} color={Colors.primary} />
                            ) : (
                              <Ionicons name="square-outline" size={20} color={Colors.textMuted} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
          <View style={styles.spacer} />

      {/* Scope Settings */}
      {isExecutiveOrAdmin(profile) && (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>Visibility Scope</Text>
            <View style={styles.row}>
              {(['General', 'Department'] as const).map((scope) => (
                <TouchableOpacity
                  key={scope}
                  style={[
                    styles.segmentBtn,
                    taskScope === scope && styles.segmentBtnActive,
                    taskScope === scope && { backgroundColor: Colors.primary }
                  ]}
                  onPress={() => setTaskScope(scope)}
                >
                  <Text style={[
                    styles.segmentText,
                    taskScope === scope && styles.segmentTextActive
                  ]}>
                    {scope}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {taskScope === 'Department' && uniqueDepartments.length > 0 && (
            <View style={[styles.section, { marginTop: Layout.spacing.sm }]}>
              <Text style={styles.label}>Select Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                {uniqueDepartments.map((d: any) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.deptPill,
                      selectedDepartmentId === d.id && styles.deptPillActive
                    ]}
                    onPress={() => setSelectedDepartmentId(d.id)}
                  >
                    <Text style={[
                      styles.deptPillText,
                      selectedDepartmentId === d.id && styles.deptPillTextActive
                    ]}>
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          <View style={styles.spacer} />
        </>
      )}

      {/* Attachments Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.label}>Attachments</Text>
          <Text style={styles.sizeIndicator}>
            {sizeFormatted} MB / 20 MB
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.uploadBox}
          onPress={handlePickDocuments}
          activeOpacity={0.7}
        >
          <Ionicons name="cloud-upload-outline" size={24} color={Colors.primary} />
          <Text style={styles.uploadBoxText}>
            Attach Documents (PDF, DOCX, XLSX, Images, ZIP)
          </Text>
        </TouchableOpacity>

        {documents.length > 0 && (
          <View style={styles.docList}>
            {documents.map((doc, idx) => (
              <View key={doc.uri || idx} style={styles.docItem}>
                <Ionicons name="document-text-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                <Text style={styles.docSize}>{formatFileSize(doc.size || 0)}</Text>
                <TouchableOpacity onPress={() => removeDocument(idx)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.semanticPeach} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.spacer} />

      {/* Voice Notes Section */}
      <View style={styles.section}>
        <VoiceNoteRecorder
          key={`modal-voice-${visible ? 'open' : 'closed'}-${parentTaskId || 'root'}`}
          notes={pendingVoiceNotes}
          onChange={setPendingVoiceNotes}
          existingAttachmentBytes={totalAttachmentBytes}
          disabled={loading}
        />
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.semanticYellow} />
          <Text style={styles.loadingText}>{uploadProgress}</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <ZeroButton
          title={parentTaskId ? 'Add Subtask' : 'Create Task'}
          onPress={handleCreate}
          disabled={!title.trim() || loading}
        />
      </View>
    </>
  );

  if (visible !== undefined) {
    if (!visible) return null;

    return (
      <View style={styles.overlayRoot}>
        <TouchableOpacity
          style={styles.overlayBackdrop}
          activeOpacity={1}
          onPress={() => {
            isClearingRef.current = true;
            onClose?.();
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlaySheetWrapper}
        >
          <View style={styles.overlaySheetCard}>
            <View style={styles.overlayHeader}>
              <View style={styles.sheetHandle} />
              <TouchableOpacity
                onPress={() => {
                  isClearingRef.current = true;
                  onClose?.();
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.overlayCloseBtn}
              >
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.contentContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderFormFields()}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: Colors.canvas }}
      handleIndicatorStyle={{ backgroundColor: Colors.textPrimary }}
      onChange={handleSheetChange}
    >
      <BottomSheetScrollView contentContainerStyle={styles.contentContainer}>
        {renderFormFields()}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  contentContainer: {
    padding: Layout.spacing.xl,
    paddingBottom: 120,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.lg,
  },
  spacer: {
    height: Layout.spacing.lg,
  },
  section: {
    marginBottom: Layout.spacing.sm,
  },
  label: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Layout.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    borderColor: 'transparent',
  },
  segmentText: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
  },
  segmentTextActive: {
    color: Colors.textPrimary,
  },
  attachmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sizeLimitText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: Layout.spacing.sm,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderStyle: 'dashed',
    borderRadius: Layout.radius.sm,
    marginTop: Layout.spacing.sm,
  },
  attachBtnText: {
    marginLeft: 8,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  documentList: {
    marginBottom: Layout.spacing.sm,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: Layout.spacing.sm,
  },
  documentInfo: {
    flex: 1,
    marginLeft: Layout.spacing.md,
  },
  documentName: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
  },
  documentSize: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  buttonContainer: {
    marginTop: Layout.spacing.xxl,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Layout.spacing.md,
    padding: Layout.spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.sm,
  },
  loadingText: {
    marginLeft: 10,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Layout.spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  dropdownHeaderText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  dropdownList: {
    marginTop: 4,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  dropdownItemActive: {
    backgroundColor: Colors.surface,
  },
  dropdownItemText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  dropdownItemTextActive: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  dropdownItemRole: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  dropdownItemSubtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  filterChip: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.sm,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.full,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginRight: Layout.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.surface,
    borderColor: Colors.primary,
    borderWidth: 1,
    ...Layout.shadow.card,
  },
  filterText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Layout.spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  dateText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  groupHeader: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    backgroundColor: Colors.surfaceSubtle,
  },
  groupHeaderText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  deptPill: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.full,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginRight: Layout.spacing.xs,
  },
  deptPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  deptPillText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  deptPillTextActive: {
    color: '#ffffff',
    fontFamily: Typography.fontFamily.semiBold,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Layout.spacing.xs,
  },
  sizeIndicator: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  uploadBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderStyle: 'dashed',
    gap: 8,
  },
  uploadBoxText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  docList: {
    marginTop: Layout.spacing.sm,
    gap: 6,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Layout.spacing.sm,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 8,
  },
  docName: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  docSize: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  overlayRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 99999,
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlaySheetWrapper: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  overlaySheetCard: {
    backgroundColor: Colors.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 24,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    position: 'relative',
  },
  sheetHandle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.borderSubtle,
  },
  overlayCloseBtn: {
    position: 'absolute',
    right: 16,
    top: 8,
  },
});
