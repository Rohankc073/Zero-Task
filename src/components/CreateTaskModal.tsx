import React, { forwardRef, useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { ZeroInput } from './ZeroInput';
import { ZeroButton } from './ZeroButton';
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
import { supabase } from '../lib/supabase';
import { Colors, Typography, Layout } from '../theme/tokens';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import { PendingVoiceNote, uploadPendingVoiceNotes } from '../services/tasks/VoiceNoteService';

export type CreateTaskModalRef = BottomSheetModal;

interface CreateTaskModalProps {
  onSuccess?: (task: any) => void;
}

export const CreateTaskModal = forwardRef<CreateTaskModalRef, CreateTaskModalProps>(({ onSuccess }, ref) => {
  const { session, profile } = useAuth();
  const snapPoints = useMemo(() => ['85%', '95%'], []);
  
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
  const [taskMode, setTaskMode] = useState<'Delegated' | 'Self-Assigned'>(
    profile?.role === 'Employee' ? 'Self-Assigned' : 'Delegated'
  );

  useEffect(() => {
    async function fetchUsers() {
      if (!profile || profile.role === 'Employee' || !profile.id) return;
      try {
        let query = supabase
          .from('users')
          .select('id, full_name, role, department:departments(id, name)')
          .eq('is_approved', true)
          .neq('role', 'Founder'); // Founder accounts can NEVER be assigned tasks (Founders delegate)
        
        if (profile.id) {
          query = query.neq('id', profile.id); // Nobody can assign tasks to themselves
        }
        if (session?.user?.id && session.user.id !== profile.id) {
          query = query.neq('id', session.user.id);
        }
        
        if (profile.role === 'Manager') {
          // Manager can assign only to Managers and Employees (not Department Heads)
          query = query.neq('role', 'Department Head');
        }
        
        const { data, error } = await query.order('full_name');
        if (error) throw error;
        
        // Strict in-memory safety filter: no Founder and no self
        const currentUserId = profile.id;
        const authUserId = session?.user?.id;
        const filtered = (data || []).filter(u => 
          u.role !== 'Founder' && 
          u.id !== currentUserId && 
          u.id !== authUserId
        );
        
        setAvailableUsers(filtered);
        setAssigneeIds([]);
      } catch (err) {
        console.error('Error fetching users for assignment:', err);
      }
    }
    
    if (session && profile?.id) {
      fetchUsers();
    }
  }, [profile, session]);

  const uniqueDepartments = useMemo(() => {
    const depts = new Map();
    availableUsers.forEach(u => {
      if (u.department?.id) depts.set(u.department.id, u.department);
    });
    return Array.from(depts.values());
  }, [availableUsers]);

  const groupedUsers = useMemo(() => {
    if (!availableUsers.length) return [];
    
    const myDeptId = profile?.department_id;
    const canUseOrgScope = isExecutiveOrAdmin(profile);

    if (canUseOrgScope) {
      if (taskScope === 'General') {
        const groups: { [key: string]: any[] } = {};
        availableUsers.forEach(u => {
          const deptName = u.department?.name || 'General';
          if (!groups[deptName]) groups[deptName] = [];
          groups[deptName].push(u);
        });
        return Object.keys(groups).sort().map(dept => ({
          sectionTitle: dept,
          users: groups[dept].sort((a, b) => (a.full_name || 'Unnamed User').localeCompare(b.full_name || 'Unnamed User'))
        }));
      } else {
        if (!selectedDepartmentId) return [];
        const usersInDept = availableUsers.filter(u => u.department?.id === selectedDepartmentId);
        if (usersInDept.length === 0) return [];
        return [{
          sectionTitle: usersInDept[0]?.department?.name || 'Department',
          users: usersInDept.sort((a, b) => (a.full_name || 'Unnamed User').localeCompare(b.full_name || 'Unnamed User'))
        }];
      }
    }

    // For Department Head and Manager: Two groups: "Your Department" and "Other Departments"
    const yourDeptUsers: any[] = [];
    const otherDeptUsers: any[] = [];

    availableUsers.forEach(u => {
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
      return (a.full_name || 'Unnamed User').localeCompare(b.full_name || 'Unnamed User');
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
  }, [availableUsers, profile, taskScope, selectedDepartmentId]);

  useEffect(() => {
    // Reset selected assignees whenever the scope or department changes to prevent cross-department assignee leakage
    setAssigneeIds([]);
  }, [taskScope, selectedDepartmentId]);

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    []
  );

  const totalAttachmentBytes = useMemo(() => {
    return documents.reduce((sum, d) => sum + (d.size || 0), 0);
  }, [documents]);

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
    if (assigneeIds.length === 0) {
      Alert.alert('Error', 'Please select at least one assignee.');
      return;
    }

    // Pre-flight validation for Department tasks
    const effectiveDeptId = isExecutiveOrAdmin(profile) ? (taskScope === 'General' ? null : selectedDepartmentId) : profile?.department_id;
    if (effectiveDeptId) {
      for (const uid of assigneeIds) {
        const u = availableUsers.find(user => user.id === uid);
        if (u && u.department?.id !== effectiveDeptId) {
          Alert.alert('Validation Error', 'Cross-department assignment is forbidden. All assignees must belong to the selected department.');
          return;
        }
      }
    }

    setLoading(true);
    setUploadProgress('Creating task...');
    
    try {
      const isPrivateTask = Boolean(isFounder(profile) && taskMode === 'Self-Assigned');

      // 1. Insert task and return the inserted row to get its ID
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status: 'To Do',
          progress: 0,
          due_date: deadline ? deadline.toISOString() : null,
          department_id: isExecutiveOrAdmin(profile) ? (taskScope === 'General' ? null : selectedDepartmentId) : (profile?.department_id || null),
          created_by: session.user.id,
          is_private: isPrivateTask,
        })
        .select()
        .single();

      if (taskError) throw taskError;
      
      const newTaskId = taskData.id;

      // Insert Assignees
      let finalAssignees = assigneeIds;
      if (taskMode === 'Self-Assigned') {
        finalAssignees = [session.user.id];
      }

      if (finalAssignees.length > 0) {
        const assigneesPayload = finalAssignees.map(uid => ({
          task_id: newTaskId,
          user_id: uid
        }));
        const { error: assigneesError } = await supabase.from('task_assignees').insert(assigneesPayload);
        if (assigneesError) {
           await supabase.from('tasks').delete().eq('id', newTaskId);
           throw assigneesError;
        }
      }

      // 2. Upload Documents
      if (documents.length > 0) {
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          try {
            setUploadProgress(`Uploading ${i + 1}/${documents.length}: ${doc.name}...`);
            const resultData = await processAndUploadAttachment(
              doc.uri,
              doc.name,
              doc.mimeType || 'application/octet-stream',
              'task_attachments',
              session.user.id,
              0,
              doc.size
            );

            const { error: dbFileError } = await supabase
              .from('task_files')
              .insert({
                task_id: newTaskId,
                user_id: session.user.id,
                file_name: resultData.name,
                file_url: resultData.url,
                file_type: resultData.type,
                file_size: resultData.size,
                mime_type: resultData.mimeType,
                storage_path: resultData.storagePath
              });
              
            if (dbFileError) throw dbFileError;
          } catch (uploadOrDbErr: any) {
            console.error('Attachment processing failed:', uploadOrDbErr);
            // Cleanup: delete the task so we don't leave a broken task without its attachment
            await supabase.from('tasks').delete().eq('id', newTaskId);
            throw new Error(`Attachment failed: ${uploadOrDbErr.message}. Task creation cancelled.`);
          }
        }
      }
      
      // 3. Upload Voice Notes (optional — task is NOT rolled back on audio failure)
      if (pendingVoiceNotes.length > 0) {
        setUploadProgress(`Uploading ${pendingVoiceNotes.length} voice note${pendingVoiceNotes.length > 1 ? 's' : ''}...`);
        const voiceResult = await uploadPendingVoiceNotes(newTaskId, session.user.id, pendingVoiceNotes);
        if (voiceResult.failed > 0) {
          // Task created successfully, but some audio uploads failed.
          // Show recoverable alert — user can re-add notes via task edit later.
          Alert.alert(
            'Voice Note Upload Incomplete',
            `Task created successfully, but ${voiceResult.failed} voice note${voiceResult.failed > 1 ? 's' : ''} could not be uploaded.\n\nErrors: ${voiceResult.errors.join(', ')}\n\nYou can re-add notes in Task Detail.`
          );
        }
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
      setTaskMode(profile?.role === 'Employee' ? 'Self-Assigned' : 'Delegated');
      
      if (ref && 'current' in ref && ref.current) {
        ref.current.dismiss();
      }
      onSuccess?.(taskData);
    } catch (err: any) {
      console.error('Failed to create task:', err.message);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  const currentTotalSize = documents.reduce((acc, curr) => acc + (curr.size || 0), 0);
  const sizeFormatted = (currentTotalSize / (1024 * 1024)).toFixed(2);

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: Colors.canvas }}
      handleIndicatorStyle={{ backgroundColor: Colors.textPrimary }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Create New Task</Text>
        
        <ZeroInput
          label="Task Title"
          placeholder="What needs to be done?"
          value={title}
          onChangeText={setTitle}
        />

        <View style={styles.spacer} />

        {profile?.role !== 'Employee' && (
          <>
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
            style={styles.dropdownHeader}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dropdownHeaderText}>
              {deadline ? format(deadline, 'PPP') : 'Set a deadline...'}
            </Text>
            <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          
          {showDatePicker && (
            <DateTimePicker
              value={deadline || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onValueChange={(event, selectedDate) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) setDeadline(selectedDate);
              }}
              onDismiss={() => {
                setShowDatePicker(false);
              }}
            />
          )}
        </View>

        <View style={styles.spacer} />

        {taskMode === 'Delegated' && isExecutiveOrAdmin(profile) && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>Task Scope</Text>
              <View style={styles.row}>
                {['General', 'Department'].map((scope) => (
                  <TouchableOpacity
                    key={scope}
                    style={[
                      styles.segmentBtn,
                      taskScope === scope && styles.segmentBtnActive,
                      taskScope === scope && { backgroundColor: Colors.semanticBlue },
                    ]}
                    onPress={() => {
                       setTaskScope(scope as any);
                       setAssigneeIds([]);
                       if (scope === 'Department' && uniqueDepartments.length > 0 && !selectedDepartmentId) {
                         setSelectedDepartmentId(uniqueDepartments[0].id);
                       }
                    }}
                  >
                    <Text style={[
                      styles.segmentText,
                      taskScope === scope && styles.segmentTextActive
                    ]}>
                      {scope} Task
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              {taskScope === 'Department' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.label}>Select Department</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 8 }}>
                     {uniqueDepartments.map(dept => (
                        <TouchableOpacity
                          key={dept.id}
                          style={[
                            styles.filterChip,
                            selectedDepartmentId === dept.id && styles.filterChipActive
                          ]}
                          onPress={() => {
                            setSelectedDepartmentId(dept.id);
                            setAssigneeIds([]);
                          }}
                        >
                          <Text style={[
                            styles.filterText,
                            selectedDepartmentId === dept.id && styles.filterTextActive
                          ]}>{dept.name}</Text>
                        </TouchableOpacity>
                     ))}
                  </ScrollView>
                </View>
              )}
            </View>
            <View style={styles.spacer} />
          </>
        )}

        {taskMode === 'Delegated' && (
          <View style={styles.section}>
            <Text style={styles.label}>Assign To</Text>
          <TouchableOpacity 
            style={styles.dropdownHeader}
            onPress={() => setShowDropdown(!showDropdown)}
          >
            <Text style={styles.dropdownHeaderText}>
              {assigneeIds.length > 0
                ? `${assigneeIds.length} Assignee${assigneeIds.length > 1 ? 's' : ''} Selected`
                : 'Select Assignees...'}
            </Text>
            <Ionicons name={showDropdown ? "chevron-up" : "chevron-down"} size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          
          {showDropdown && (
            <View style={styles.dropdownList}>
              {groupedUsers.map(group => (
                <View key={group.sectionTitle}>
                  <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle, backgroundColor: Colors.surfaceSubtle }}>
                    <Text style={{ fontSize: 11, fontFamily: Typography.fontFamily.bold, color: Colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
                      {group.sectionTitle}
                    </Text>
                  </View>
                  {group.users.map(u => (
                    <TouchableOpacity 
                      key={u.id}
                      style={[
                        styles.dropdownItem,
                        assigneeIds.includes(u.id) && styles.dropdownItemActive
                      ]}
                      onPress={() => {
                        if (assigneeIds.includes(u.id)) {
                          setAssigneeIds(prev => prev.filter(id => id !== u.id));
                        } else {
                          setAssigneeIds(prev => [...prev, u.id]);
                        }
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={[
                          styles.dropdownItemText,
                          assigneeIds.includes(u.id) && styles.dropdownItemTextActive
                        ]}>
                          {u.full_name || 'Unnamed User'}
                        </Text>
                        <Text style={styles.dropdownItemSubtitle}>
                          {u.role || 'Member'} · {u.department?.name || 'General'}
                        </Text>
                      </View>
                      {assigneeIds.includes(u.id) ? (
                        <Ionicons name="checkbox" size={22} color={Colors.primary} />
                      ) : (
                        <Ionicons name="square-outline" size={22} color={Colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
        )}

        {taskMode === 'Self-Assigned' && (
          <View style={[styles.section, { padding: 16, backgroundColor: Colors.surfaceSubtle, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle }]}>
            <Text style={[styles.label, { color: Colors.primary }]}>Self-Assigned Task</Text>
            <Text style={{ fontSize: 13, color: Colors.textSecondary, marginTop: 4 }}>
              This task will be assigned to you and visible according to hierarchy rules.
            </Text>
          </View>
        )}

        <View style={styles.spacer} />

        {/* Document Attachments Section */}
        <View style={styles.section}>
          <View style={styles.attachmentHeader}>
            <Text style={styles.label}>Attachments</Text>
            <Text style={styles.sizeLimitText}>{sizeFormatted}MB / 20MB</Text>
          </View>
          
          {documents.length > 0 && (
            <View style={styles.documentList}>
              {documents.map((doc, index) => (
                <View key={index} style={styles.documentItem}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.semanticYellow} />
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentName} numberOfLines={1}>{doc.name}</Text>
                    <Text style={styles.documentSize}>{((doc.size || 0) / 1024 / 1024).toFixed(2)} MB</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeDocument(index)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={20} color={Colors.semanticPeach} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.attachBtn} onPress={handlePickDocuments}>
            <Ionicons name="cloud-upload-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.attachBtnText}>Attach Documents</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.spacer} />

        {/* Voice Notes Section — appears below attachments */}
        <View style={styles.section}>
          <VoiceNoteRecorder
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
            title="Create Task"
            onPress={handleCreate}
            disabled={!title.trim() || loading}
          />
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  contentContainer: {
    padding: Layout.spacing.xl,
    paddingBottom: 120,
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
  }
});
