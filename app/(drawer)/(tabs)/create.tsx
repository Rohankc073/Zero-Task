import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { Avatar } from '../../../src/components/ui/Avatar';
import { TaskPriority } from '../../../src/types';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { 
  processAndUploadAttachment, 
  validateAttachment, 
  formatFileSize, 
  MAX_TASK_ATTACHMENT_BYTES, 
  SUPPORTED_DOCUMENT_MIME_TYPES 
} from '../../../src/utils/attachmentPipeline';

export default function CreateTaskScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [taskMode, setTaskMode] = useState<'Delegated' | 'Self-Assigned'>('Delegated');
  const [documents, setDocuments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const effectiveTaskMode = profile?.role === 'Employee' ? 'Self-Assigned' : taskMode;

  useEffect(() => {
    async function fetchUsers() {
      if (!profile || profile.role === 'Employee' || !profile.id) return;
      try {
        let query = supabase
          .from('users')
          .select('id, full_name, role, department:departments(id, name)')
          .eq('is_approved', true)
          .neq('role', 'Founder'); // Founder accounts can NEVER be assigned tasks
        
        if (profile.id) {
          query = query.neq('id', profile.id); // Nobody can assign tasks to themselves
        }
        if (session?.user?.id && session.user.id !== profile.id) {
          query = query.neq('id', session.user.id);
        }
        
        if (profile.role === 'Manager') {
          // Manager can assign only to Managers and Employees
          query = query.neq('role', 'Department Head');
        }
        
        const { data, error } = await query.order('full_name');
        if (error) throw error;
        
        const currentUserId = profile.id;
        const authUserId = session?.user?.id;
        const filtered = (data || []).filter(u => 
          u.role !== 'Founder' && 
          u.id !== currentUserId && 
          u.id !== authUserId
        );

        setAvailableUsers(filtered);
        setAssigneeIds([]);
      } catch (err: any) {
        if (err?.message?.includes('JWT issued at future') || err?.code === 'PGRST303') {
          console.warn('Clock sync issue detected: Your device time is ahead of the server time. Please sync your device clock.');
          Alert.alert('Time Sync Required', 'Your device clock is out of sync with the server (JWT issued at future). Please sync your system time to fetch users.');
        } else {
          console.error('Error fetching users:', err);
        }
      }
    }
    
    if (session && profile?.id) {
      fetchUsers();
    }
  }, [profile, session]);

  const groupedUsers = useMemo(() => {
    if (!availableUsers.length) return [];
    
    const myDeptId = profile?.department_id;
    const isFounder = profile?.role === 'Founder';

    if (isFounder) {
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
    }

    const yourDeptUsers: any[] = [];
    const otherDeptUsers: any[] = [];

    availableUsers.forEach(u => {
      if (myDeptId && u.department?.id === myDeptId) {
        yourDeptUsers.push(u);
      } else {
        otherDeptUsers.push(u);
      }
    });

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
  }, [availableUsers, profile]);

  // Employee check removed to allow them to create self-assigned tasks

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
    setDocuments(prev => prev.filter((_, i) => i !== index));
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

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a task title');
      return;
    }
    if (effectiveTaskMode === 'Delegated' && assigneeIds.length === 0) {
      Alert.alert('Error', 'Please select at least one assignee.');
      return;
    }
    if (!session?.user) {
      Alert.alert('Error', 'You must be logged in to create a task');
      return;
    }

    try {
      setLoading(true);
      
      // 1. Insert task
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          status: 'To Do',
          priority,
          progress: 0,
          due_date: deadline ? deadline.toISOString() : null,
          department_id: profile?.department_id || null,
          created_by: session.user.id,
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // 2. Insert assignees into task_assignees
      const finalAssigneeIds = effectiveTaskMode === 'Self-Assigned' ? [session.user.id] : assigneeIds;
      const assigneesPayload = finalAssigneeIds.map(uid => ({
        task_id: taskData.id,
        user_id: uid
      }));

      const { error: assigneesError } = await supabase
        .from('task_assignees')
        .insert(assigneesPayload);

      if (assigneesError) {
        await supabase.from('tasks').delete().eq('id', taskData.id);
        throw assigneesError;
      }

      // 3. Upload Attachments if any
      if (documents.length > 0) {
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          setUploadProgress(`Uploading ${i + 1}/${documents.length}: ${doc.name}...`);
          try {
            const resultData = await processAndUploadAttachment(
              doc.uri,
              doc.name,
              doc.mimeType || 'application/octet-stream',
              'task_attachments',
              session.user.id,
              0,
              doc.size
            );

            await supabase.from('task_files').insert({
              task_id: taskData.id,
              user_id: session.user.id,
              file_name: resultData.name,
              file_url: resultData.url,
              file_type: resultData.type,
              file_size: resultData.size,
              mime_type: resultData.mimeType,
              storage_path: resultData.storagePath
            });
          } catch (uploadErr: any) {
            console.error('Error uploading attachment:', uploadErr);
          }
        }
      }
      
      // Redirect safely to Home tab
      router.replace('/(drawer)/(tabs)' as any);
    } catch (error: any) {
      console.error('Error creating task:', error);
      Alert.alert('Error', error.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <ScrollView 
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>{effectiveTaskMode === 'Self-Assigned' ? 'Create My Task' : 'Create New Task'}</Text>

        {profile?.role !== 'Employee' && (
          <View style={styles.segmentContainer}>
            <TouchableOpacity 
              style={[styles.segmentBtnMode, effectiveTaskMode === 'Delegated' && styles.segmentBtnModeActive]} 
              onPress={() => setTaskMode('Delegated')}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentBtnText, effectiveTaskMode === 'Delegated' && styles.segmentBtnTextActive]}>Assign a Task</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtnMode, effectiveTaskMode === 'Self-Assigned' && styles.segmentBtnModeActive]} 
              onPress={() => setTaskMode('Self-Assigned')}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentBtnText, effectiveTaskMode === 'Self-Assigned' && styles.segmentBtnTextActive]}>My Task</Text>
            </TouchableOpacity>
          </View>
        )}

        <Input
          label="Title *"
          placeholder="What needs to be done?"
          value={title}
          onChangeText={setTitle}
        />
        
        <View style={styles.spacer} />

        <Input
          label="Description (Optional)"
          placeholder="Add details..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={{ height: 100, textAlignVertical: 'top', paddingTop: Layout.spacing.md }}
        />

        <View style={styles.spacer} />

        <View style={styles.section}>
          <Text style={styles.label}>Deadline (Optional)</Text>
          <TouchableOpacity 
            style={styles.dropdownHeader}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
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
              onDismiss={() => setShowDatePicker(false)}
            />
          )}
        </View>

        <View style={styles.spacer} />

        {effectiveTaskMode === 'Delegated' && (
          <View style={styles.section}>
            <Text style={styles.label}>Assign To *</Text>
          <TouchableOpacity 
            style={styles.dropdownHeader}
            onPress={() => setShowDropdown(!showDropdown)}
            activeOpacity={0.7}
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
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupHeaderText}>{group.sectionTitle}</Text>
                  </View>
                  {group.users.map(u => {
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
                        <View style={styles.dropdownItemLeft}>
                          <Avatar name={u.full_name} size={32} style={{ marginRight: Layout.spacing.sm }} />
                          <View style={{ flex: 1 }}>
                            <Text style={[
                              styles.dropdownItemText,
                              isSelected && styles.dropdownItemTextActive
                            ]}>
                              {u.full_name || 'Unnamed User'}
                            </Text>
                            <Text style={styles.dropdownItemSubtitle}>
                              {u.role || 'Member'} · {u.department?.name || 'General'}
                            </Text>
                          </View>
                        </View>
                        {isSelected ? (
                          <Ionicons name="checkbox" size={22} color={Colors.primary} />
                        ) : (
                          <Ionicons name="square-outline" size={22} color={Colors.textMuted} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>
        )}

        {effectiveTaskMode === 'Self-Assigned' && (
          <View style={[styles.section, { padding: 16, backgroundColor: Colors.surfaceSubtle, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle }]}>
            <Text style={[styles.label, { color: Colors.primary }]}>Self-Assigned Task</Text>
            <Text style={{ fontSize: 13, color: Colors.textSecondary, marginTop: 4 }}>
              This task will be assigned to you and visible according to hierarchy rules.
            </Text>
          </View>
        )}

        <View style={styles.spacer} />

        <View style={styles.section}>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.row}>
            {['Low', 'Medium', 'High'].map((p) => {
              const isActive = priority === p;
              let activeColor = Colors.primary;
              if (p === 'Low') activeColor = Colors.success;
              if (p === 'Medium') activeColor = Colors.warning;
              if (p === 'High') activeColor = Colors.danger;

              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.segmentBtn,
                    isActive && { backgroundColor: activeColor, borderColor: activeColor },
                  ]}
                  onPress={() => setPriority(p as TaskPriority)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.segmentText,
                    isActive && styles.segmentTextActive
                  ]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.spacer} />

        {/* Attachments Section */}
        <View style={styles.section}>
          <View style={styles.attachmentHeader}>
            <Text style={styles.label}>Attachments</Text>
            <Text style={styles.sizeIndicator}>
              {formatFileSize(totalAttachmentBytes)} / 20 MB
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.attachBtn} 
            onPress={handlePickDocuments}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-upload-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.attachBtnText}>Attach Documents (PDF, DOCX, XLSX, Images, ZIP)</Text>
          </TouchableOpacity>

          {documents.length > 0 && (
            <View style={styles.docList}>
              {documents.map((doc, idx) => {
                const iconInfo = getFileIconName(doc.name);
                return (
                  <View key={idx} style={styles.docItem}>
                    <View style={styles.docItemLeft}>
                      <Ionicons name={iconInfo.icon as any} size={20} color={iconInfo.color} style={{ marginRight: 8 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                        <Text style={styles.docSize}>{formatFileSize(doc.size)}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => removeDocument(idx)} style={styles.removeDocBtn}>
                      <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {uploadProgress && (
            <View style={styles.progressBox}>
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.progressText}>{uploadProgress}</Text>
            </View>
          )}
        </View>

        <Button
          title="Create Task"
          onPress={handleSave}
          loading={loading}
          variant="primary"
          style={styles.button}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Layout.spacing.lg,
    paddingBottom: 120,
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.spacing.xl,
    backgroundColor: Colors.background,
  },
  errorText: {
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.md,
  },
  screenTitle: {
    fontSize: Typography.fontSize.xxl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.lg,
  },
  spacer: {
    height: Layout.spacing.md,
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
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    ...Layout.shadow.card,
  },
  segmentText: {
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
  },
  segmentTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    height: 44,
    ...Layout.shadow.card,
  },
  dropdownHeaderText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.medium,
  },
  dropdownList: {
    marginTop: 6,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Layout.shadow.card,
    overflow: 'hidden',
  },
  groupHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSecondary,
  },
  groupHeaderText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  dropdownItemText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.medium,
  },
  dropdownItemTextActive: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.bold,
  },
  dropdownItemSubtitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  button: {
    marginTop: Layout.spacing.xl,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 8,
    padding: 4,
    marginBottom: Layout.spacing.lg,
  },
  segmentBtnMode: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnModeActive: {
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnText: {
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  segmentBtnTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  attachmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sizeIndicator: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textMuted,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderStyle: 'dashed',
    marginTop: Layout.spacing.xs,
  },
  attachBtnText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  docList: {
    marginTop: Layout.spacing.sm,
    gap: 6,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Layout.spacing.sm,
    paddingHorizontal: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  docItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  docName: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
  },
  docSize: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.regular,
  },
  removeDocBtn: {
    padding: 4,
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: Layout.radius.sm,
  },
  progressText: {
    fontSize: 12,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.medium,
  },
});
