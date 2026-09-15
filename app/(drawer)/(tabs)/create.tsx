import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal, FlatList, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { TaskService } from '../../../src/services/tasks/TaskService';
import { useAuth } from '../../../src/context/AuthContext';
import { isFounder, isSuperAdmin, isExecutiveOrAdmin } from '../../../src/utils/permissions';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { Avatar } from '../../../src/components/ui/Avatar';
import { TaskPriority, Company } from '../../../src/types';
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
import VoiceNoteRecorder from '../../../src/components/VoiceNoteRecorder';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { uploadPendingVoiceNotes, PendingVoiceNote } from '../../../src/services/tasks/VoiceNoteService';
import { TaskDraftService } from '../../../src/services/tasks/TaskDraftService';
import { apiClient } from '../../../src/services/api/apiClient';
import { supabase } from '../../../src/lib/supabase';

import { CompanyFilterSelector } from '../../../src/components/CompanyFilterSelector';

export default function CreateTaskScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Super Admin target company modes: 'single' | 'multiple' | 'all'
  type CompanyTargetMode = 'single' | 'multiple' | 'all';
  const [companyTargetMode, setCompanyTargetMode] = useState<CompanyTargetMode>('single');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [multiCompanyModalVisible, setMultiCompanyModalVisible] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');

  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [allRawUsers, setAllRawUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [assigneeRoleFilter, setAssigneeRoleFilter] = useState<'All' | 'Founder' | 'Department Head' | 'Manager' | 'Employee'>('All');
  const [taskMode, setTaskMode] = useState<'Delegated' | 'Self-Assigned'>('Delegated');
  const [documents, setDocuments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<PendingVoiceNote[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const [draftLoaded, setDraftLoaded] = useState(false);
  const [formMountKey, setFormMountKey] = useState(0);
  const isClearingRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);

  const effectiveTaskMode = profile?.role === 'Employee' ? 'Self-Assigned' : taskMode;

  const fetchCompaniesList = useCallback(async () => {
    if (profile?.role !== 'Super Admin') return;
    setLoadingCompanies(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) {
        const active = (data as Company[]).filter((c) => c.status === 'Active' || !c.status);
        setAllCompanies(active);
      }
    } catch (err) {
      console.log('Error fetching companies for create task:', err);
    } finally {
      setLoadingCompanies(false);
    }
  }, [profile?.role]);

  const fetchUsers = useCallback(async () => {
    if (!profile || profile.role === 'Employee' || !profile.id) return;
    try {
      setLoadingUsers(true);
      const res = await apiClient.get<any[]>('/users');
      if (res.error) throw new Error(res.error.message);

      const currentUserId = profile.id;
      const authUserId = session?.user?.id;

      const EXCLUDED_ROLES_BY_ROLE: Record<string, string[]> = {
        'Super Admin': ['Super Admin'],
        'Founder': ['Super Admin'],
        'Department Head': ['Founder', 'Super Admin'],
        'Manager': ['Founder', 'Super Admin', 'Department Head'],
      };
      const excludedRoles = EXCLUDED_ROLES_BY_ROLE[profile.role as string] || ['Founder', 'Super Admin'];

      const eligible = (res.data || []).filter((u: any) =>
        u.id !== currentUserId &&
        u.id !== authUserId &&
        u.is_active !== false &&
        u.is_deleted !== true &&
        !excludedRoles.includes(u.role)
      );

      setAllRawUsers(eligible);
    } catch (err: any) {
      const msg = String(err?.message || err || '').toLowerCase();
      const isTransient = msg.includes('fetch failed') || msg.includes('connect') || msg.includes('502') || msg.includes('bad gateway') || msg.includes('network');
      if (!isTransient) {
        console.error('Error fetching users:', err);
      }
    } finally {
      setLoadingUsers(false);
      setRefreshing(false);
    }
  }, [profile?.id, profile?.role, session?.user?.id]);

  useEffect(() => {
    fetchCompaniesList();
    fetchUsers();
  }, [fetchCompaniesList, fetchUsers]);

  // Refresh lists when screen gains focus without wiping active form state
  useFocusEffect(
    useCallback(() => {
      if (session?.user?.id) {
        fetchCompaniesList();
        fetchUsers();
        activeUserIdRef.current = session.user.id;
      }
    }, [fetchCompaniesList, fetchUsers, session?.user?.id])
  );

  const availableUsers = useMemo(() => {
    let filtered = allRawUsers;

    if (profile?.role === 'Super Admin') {
      if (companyTargetMode === 'single') {
        if (selectedCompanyId && selectedCompanyId !== 'all') {
          filtered = filtered.filter((u: any) => u.company_id === selectedCompanyId);
        }
      } else if (companyTargetMode === 'multiple') {
        if (selectedCompanyIds.length > 0) {
          filtered = filtered.filter((u: any) => selectedCompanyIds.includes(u.company_id));
        } else {
          filtered = [];
        }
      }
      // In 'all' mode, all users across companies are available
    } else if (profile?.company_id) {
      filtered = filtered.filter((u: any) => u.company_id === profile.company_id);
    }

    return [...filtered].sort((a: any, b: any) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [allRawUsers, profile?.role, profile?.company_id, companyTargetMode, selectedCompanyId, selectedCompanyIds]);

  const availableRoleFilters = useMemo(() => {
    if (profile?.role === 'Super Admin' || profile?.role === 'Founder') {
      return ['All', 'Founder', 'Department Head', 'Manager', 'Employee'] as const;
    }
    if (profile?.role === 'Department Head') {
      return ['All', 'Department Head', 'Manager', 'Employee'] as const;
    }
    if (profile?.role === 'Manager') {
      return ['All', 'Manager', 'Employee'] as const;
    }
    return ['All', 'Employee'] as const;
  }, [profile?.role]);

  const filteredAvailableUsers = useMemo(() => {
    if (assigneeRoleFilter === 'All') return availableUsers;
    return availableUsers.filter(u => u.role === assigneeRoleFilter);
  }, [availableUsers, assigneeRoleFilter]);

  const groupedUsers = useMemo(() => {
    if (!filteredAvailableUsers.length) return [];
    
    const myDeptId = profile?.department_id;
    const isFounderRole = profile?.role === 'Founder';
    const isSuperAdminRole = profile?.role === 'Super Admin';

    if (isSuperAdminRole) {
      const groups: { [key: string]: any[] } = {};
      filteredAvailableUsers.forEach(u => {
        const compName = u.company?.name || 'Unassigned Organization';
        const deptName = u.department?.name || 'General';
        const groupTitle = companyTargetMode === 'single' && selectedCompanyId ? deptName : `${compName} • ${deptName}`;
        if (!groups[groupTitle]) groups[groupTitle] = [];
        groups[groupTitle].push(u);
      });
      return Object.keys(groups).sort().map(title => ({
        sectionTitle: title,
        users: groups[title].sort((a, b) => (a.full_name || a.name || a.email || 'Unnamed User').localeCompare(b.full_name || b.name || b.email || 'Unnamed User'))
      }));
    }

    if (isFounderRole) {
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
    }

    const yourDeptUsers: any[] = [];
    const otherDeptUsers: any[] = [];

    filteredAvailableUsers.forEach(u => {
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
  }, [filteredAvailableUsers, profile, companyTargetMode, selectedCompanyId, selectedCompanyIds]);

  const handleSelectAllFiltered = () => {
    const ids = filteredAvailableUsers.map(u => u.id);
    setAssigneeIds(prev => Array.from(new Set([...prev, ...ids])));
  };

  const handleDeselectAllFiltered = () => {
    const idsToRemove = new Set(filteredAvailableUsers.map(u => u.id));
    setAssigneeIds(prev => prev.filter(id => !idsToRemove.has(id)));
  };

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
    if (!session?.user) {
      Alert.alert('Error', 'You must be logged in to create a task');
      return;
    }

    try {
      setLoading(true);

      const isPrivateTask = Boolean(isFounder(profile) && effectiveTaskMode === 'Self-Assigned');

      // Resolve target companies based on role and mode
      let targetCompanyIds: (string | null)[] = [];
      if (isSuperAdmin(profile)) {
        if (effectiveTaskMode === 'Self-Assigned') {
          targetCompanyIds = [null];
        } else if (companyTargetMode === 'single') {
          if (!selectedCompanyId || selectedCompanyId === 'all') {
            Alert.alert('Selection Required', 'Please choose a target company from the dropdown.');
            setLoading(false);
            return;
          }
          targetCompanyIds = [selectedCompanyId];
        } else if (companyTargetMode === 'multiple') {
          if (selectedCompanyIds.length === 0) {
            Alert.alert('Selection Required', 'Please select at least one company in the Multi-Company section.');
            setLoading(false);
            return;
          }
          targetCompanyIds = selectedCompanyIds;
        } else if (companyTargetMode === 'all') {
          if (allCompanies.length === 0) {
            Alert.alert('Notice', 'No registered companies found to assign task to.');
            setLoading(false);
            return;
          }
          targetCompanyIds = allCompanies.map((c) => c.id);
        }
      } else {
        targetCompanyIds = [profile?.company_id || null];
      }

      // Check assignees for single company delegated tasks
      if (effectiveTaskMode === 'Delegated' && (!isSuperAdmin(profile) || companyTargetMode === 'single')) {
        if (assigneeIds.length === 0) {
          Alert.alert('Error', 'Please select at least one assignee.');
          setLoading(false);
          return;
        }
      }

      let createdTasksCount = 0;

      for (let i = 0; i < targetCompanyIds.length; i++) {
        const targetCompId = targetCompanyIds[i];

        // Determine assignees for this target company
        let finalAssigneeIds: string[] = [];
        if (effectiveTaskMode === 'Self-Assigned') {
          finalAssigneeIds = [session.user.id];
        } else if (isSuperAdmin(profile) && targetCompanyIds.length > 1) {
          // Multi-company or All-companies mode
          const compSpecificAssignees = assigneeIds.filter((id) => {
            const user = allRawUsers.find((u) => u.id === id);
            return user && user.company_id === targetCompId;
          });

          if (compSpecificAssignees.length > 0) {
            finalAssigneeIds = compSpecificAssignees;
          } else {
            // If no specific users were checked for this company, route to company founder or first active user
            const founderOrUser =
              allRawUsers.find((u) => u.company_id === targetCompId && u.role === 'Founder') ||
              allRawUsers.find((u) => u.company_id === targetCompId);
            if (founderOrUser) {
              finalAssigneeIds = [founderOrUser.id];
            } else {
              finalAssigneeIds = [session.user.id];
            }
          }
        } else {
          finalAssigneeIds = assigneeIds.length > 0 ? assigneeIds : [session.user.id];
        }

        const taskRes = await TaskService.createTask({
          title: title.trim(),
          description: description.trim() || undefined,
          status: 'To Do',
          priority,
          progress: 0,
          due_date: deadline ? deadline.toISOString() : undefined,
          company_id: targetCompId || undefined,
          department_id: profile?.department_id || undefined,
          user_id: finalAssigneeIds[0] || session.user.id,
          assignee_ids: finalAssigneeIds,
          is_private: isPrivateTask,
        });

        if (taskRes.error || !taskRes.data) {
          throw new Error(taskRes.error?.message || 'Task creation failed');
        }

        const taskData = taskRes.data;
        createdTasksCount++;

        // 3. Upload Attachments if any
        if (documents.length > 0) {
          for (let j = 0; j < documents.length; j++) {
            const doc = documents[j];
            setUploadProgress(`Uploading ${j + 1}/${documents.length} for task ${createdTasksCount}/${targetCompanyIds.length}...`);
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

              // Register file metadata via FastAPI
              await TaskService.createTaskFile(taskData.id, {
                file_url: resultData.url,
                file_name: resultData.name,
                file_type: resultData.type,
                file_size: resultData.size,
                mime_type: resultData.mimeType,
                storage_path: resultData.storagePath,
              });
            } catch (uploadErr: any) {
              console.error('Error uploading attachment:', uploadErr);
            }
          }
        }

        // 4. Upload Voice Notes (optional — task creation is preserved on audio failure)
        if (pendingVoiceNotes.length > 0) {
          setUploadProgress(`Uploading voice notes for task ${createdTasksCount}/${targetCompanyIds.length}...`);
          await uploadPendingVoiceNotes(taskData.id, session.user.id, pendingVoiceNotes);
        }
      }

      // 5. Authoritative Success: Permanently clear all drafts and reset in-memory form
      isClearingRef.current = true;
      if (session?.user?.id) {
        await TaskDraftService.clearAllUserDrafts(session.user.id);
      }

      setTitle('');
      setDescription('');
      setPriority('Medium');
      setDeadline(null);
      setAssigneeIds([]);
      setDocuments([]);
      setPendingVoiceNotes([]);
      setUploadProgress(null);
      setTaskMode(profile?.role === 'Employee' ? 'Self-Assigned' : 'Delegated');
      setSelectedCompanyId(null);
      setSelectedCompanyIds([]);
      setCompanyTargetMode('single');

      // Invalidate task cache in AsyncStorage so list reflects new task immediately
      try {
        if (session?.user?.id) {
          await AsyncStorage.removeItem(`tasks_cache_${session.user.id}_all`);
        }
      } catch {}

      setTimeout(() => {
        isClearingRef.current = false;
      }, 500);

      if (createdTasksCount > 1) {
        Alert.alert('Success', `Task successfully created and distributed across ${createdTasksCount} companies!`);
      }

      // Redirect safely to Home tab
      router.replace('/(drawer)/(tabs)' as any);
    } catch (error: any) {
      console.error('Error creating task:', error);
      Alert.alert('Error', error.message || 'Failed to create task');
      // On genuine failure: DO NOT clear draft or reset form! Preserves user input for retry.
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      {/* ZeroTask App Header with Drawer Toggle, Logo, Notifications & Avatar */}
      <ZeroTaskHeader />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: Colors.background }}
      >
        <ScrollView 
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={() => {
                setRefreshing(true);
                fetchUsers();
              }} 
            />
          }
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

        {isSuperAdmin(profile) && effectiveTaskMode === 'Delegated' && (
          <View style={styles.companyTargetSection}>
            <View style={styles.companyTargetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="business" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.companyTargetTitle}>ASSIGNMENT TARGET</Text>
              </View>
              {companyTargetMode === 'multiple' && (
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>
                    {selectedCompanyIds.length} Selected
                  </Text>
                </View>
              )}
            </View>

            {/* Target Mode Segmented Buttons */}
            <View style={styles.targetModeRow}>
              <TouchableOpacity
                style={[
                  styles.targetModeBtn,
                  companyTargetMode === 'single' && styles.targetModeBtnActive,
                ]}
                onPress={() => {
                  setCompanyTargetMode('single');
                  setAssigneeIds([]);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="business-outline"
                  size={14}
                  color={companyTargetMode === 'single' ? '#FFFFFF' : Colors.textSecondary}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.targetModeBtnText,
                    companyTargetMode === 'single' && styles.targetModeBtnTextActive,
                  ]}
                >
                  Single
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.targetModeBtn,
                  companyTargetMode === 'multiple' && styles.targetModeBtnActive,
                ]}
                onPress={() => {
                  setCompanyTargetMode('multiple');
                  setAssigneeIds([]);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="copy-outline"
                  size={14}
                  color={companyTargetMode === 'multiple' ? '#FFFFFF' : Colors.textSecondary}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.targetModeBtnText,
                    companyTargetMode === 'multiple' && styles.targetModeBtnTextActive,
                  ]}
                >
                  Multiple
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.targetModeBtn,
                  companyTargetMode === 'all' && styles.targetModeBtnActive,
                ]}
                onPress={() => {
                  setCompanyTargetMode('all');
                  setAssigneeIds([]);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="globe-outline"
                  size={14}
                  color={companyTargetMode === 'all' ? '#FFFFFF' : Colors.textSecondary}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.targetModeBtnText,
                    companyTargetMode === 'all' && styles.targetModeBtnTextActive,
                  ]}
                >
                  All Companies
                </Text>
              </TouchableOpacity>
            </View>

            {/* Mode 1: Single Company Picker */}
            {companyTargetMode === 'single' && (
              <View style={{ marginTop: 10 }}>
                <CompanyFilterSelector
                  selectedCompanyId={selectedCompanyId}
                  onSelectCompany={(cId) => {
                    setSelectedCompanyId(cId);
                    setAssigneeIds([]);
                  }}
                  showAllOption={false}
                  label="CHOOSE TARGET COMPANY"
                  placeholder="Select company to assign task..."
                />
              </View>
            )}

            {/* Mode 2: Multiple Companies Section */}
            {companyTargetMode === 'multiple' && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.multiSelectTriggerRow}>
                  <TouchableOpacity
                    style={styles.multiSelectOpenBtn}
                    onPress={() => setMultiCompanyModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.multiSelectOpenBtnText}>
                        {selectedCompanyIds.length === 0
                          ? 'Select Target Companies...'
                          : `${selectedCompanyIds.length} Companies Selected`}
                      </Text>
                      <Text style={styles.multiSelectOpenBtnSubtitle}>
                        {selectedCompanyIds.length === 0
                          ? 'Tap to select two or more companies'
                          : 'Tap to edit selected companies list'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>

                  {allCompanies.length > 0 && (
                    <TouchableOpacity
                      style={styles.quickToggleAllBtn}
                      onPress={() => {
                        if (selectedCompanyIds.length === allCompanies.length) {
                          setSelectedCompanyIds([]);
                        } else {
                          setSelectedCompanyIds(allCompanies.map((c) => c.id));
                        }
                      }}
                    >
                      <Text style={styles.quickToggleAllText}>
                        {selectedCompanyIds.length === allCompanies.length ? 'Clear' : 'Select All'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Selected Company Chips */}
                {selectedCompanyIds.length > 0 ? (
                  <View style={styles.selectedChipsContainer}>
                    {selectedCompanyIds.map((cId) => {
                      const comp = allCompanies.find((c) => c.id === cId);
                      const name = comp?.name || 'Company';
                      return (
                        <View key={cId} style={styles.companyChip}>
                          <Ionicons name="business" size={13} color={Colors.primary} style={{ marginRight: 4 }} />
                          <Text style={styles.companyChipText} numberOfLines={1}>
                            {name}
                          </Text>
                          <TouchableOpacity
                            onPress={() => setSelectedCompanyIds((prev) => prev.filter((id) => id !== cId))}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={15} color={Colors.textMuted} style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyMultiHint}>
                    <Ionicons name="information-circle-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.emptyMultiHintText}>
                      Select 2 or more companies to assign this task across multiple organizations.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Mode 3: All Companies Notice */}
            {companyTargetMode === 'all' && (
              <View style={styles.allCompaniesNotice}>
                <Ionicons name="globe-outline" size={22} color={Colors.primary} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.allCompaniesNoticeTitle}>Universal Broadcast Assignment</Text>
                  <Text style={styles.allCompaniesNoticeSubtitle}>
                    This task will be automatically dispatched across all {allCompanies.length} active registered companies on ZeroTask.
                  </Text>
                </View>
              </View>
            )}
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Layout.spacing.xs }}>
              <Text style={styles.label}>Assign To *</Text>
              {assigneeIds.length > 0 && (
                <TouchableOpacity onPress={() => setAssigneeIds([])}>
                  <Text style={{ fontSize: 12, color: Colors.danger, fontFamily: Typography.fontFamily.medium }}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity 
              style={styles.dropdownHeader}
              onPress={() => {
                const nextState = !showDropdown;
                setShowDropdown(nextState);
                if (nextState) {
                  fetchUsers();
                }
              }}
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
                {/* Role Filter Pills */}
                <View style={styles.roleFilterContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rolePillsScroll}>
                    {availableRoleFilters.map((r) => {
                      const isSelected = assigneeRoleFilter === r;
                      const roleLabel = r === 'All' ? 'All Roles' : (r === 'Founder' ? 'Founders' : (r === 'Department Head' ? 'Dept Heads' : (r === 'Manager' ? 'Managers' : 'Employees')));
                      return (
                        <TouchableOpacity
                          key={r}
                          style={[styles.rolePillSmall, isSelected && styles.rolePillSmallActive]}
                          onPress={() => setAssigneeRoleFilter(r as any)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.rolePillSmallText, isSelected && styles.rolePillSmallTextActive]}>
                            {roleLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Quick selection bar */}
                  <View style={styles.quickSelectBar}>
                    <TouchableOpacity 
                      style={styles.quickSelectBtn}
                      onPress={handleSelectAllFiltered}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="checkmark-done-circle-outline" size={15} color={Colors.primary} />
                      <Text style={styles.quickSelectText}>
                        Select All {assigneeRoleFilter === 'All' ? 'Users' : (assigneeRoleFilter === 'Founder' ? 'Founders' : (assigneeRoleFilter === 'Employee' ? 'Employees' : assigneeRoleFilter))} ({filteredAvailableUsers.length})
                      </Text>
                    </TouchableOpacity>
                    {filteredAvailableUsers.some(u => assigneeIds.includes(u.id)) && (
                      <TouchableOpacity 
                        style={styles.quickDeselectBtn}
                        onPress={handleDeselectAllFiltered}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickDeselectText}>Deselect</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {loadingUsers && availableUsers.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={{ marginTop: 8, color: Colors.textMuted, fontSize: 13, fontFamily: Typography.fontFamily.medium }}>
                      Loading team members...
                    </Text>
                  </View>
                ) : groupedUsers.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Ionicons name="people-outline" size={28} color={Colors.textMuted} />
                    <Text style={{ marginTop: 8, color: Colors.textMuted, fontSize: 13, fontFamily: Typography.fontFamily.medium }}>
                      No {assigneeRoleFilter === 'All' ? '' : assigneeRoleFilter + ' '}users found in this selection.
                    </Text>
                  </View>
                ) : (
                  groupedUsers.map((group, gIdx) => (
                    <View key={group.sectionTitle || `group_${gIdx}`}>
                      <View style={styles.groupHeader}>
                        <Text style={styles.groupHeaderText}>{group.sectionTitle}</Text>
                      </View>
                      {group.users.map((u, uIdx) => {
                        const isSelected = assigneeIds.includes(u.id);
                        return (
                          <TouchableOpacity 
                            key={u.id || `user_${uIdx}`}
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
                              <Avatar name={u.full_name || u.name || u.email} size={32} style={{ marginRight: Layout.spacing.sm }} />
                              <View style={{ flex: 1 }}>
                                <Text style={[
                                  styles.dropdownItemText,
                                  isSelected && styles.dropdownItemTextActive
                                ]}>
                                  {u.full_name || u.name || u.email || 'Unnamed User'}
                                </Text>
                                <Text style={styles.dropdownItemSubtitle}>
                                  {u.role || 'Member'} · {u.company?.name || u.organization_name || profile?.organization_name || 'Assigned Company'} {u.department?.name ? `· ${u.department.name}` : ''}
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
                  ))
                )}
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

        <View style={styles.spacer} />

        {/* Voice Notes Section */}
        <VoiceNoteRecorder
          key={`create-voice-${formMountKey}`}
          notes={pendingVoiceNotes}
          onChange={setPendingVoiceNotes}
          existingAttachmentBytes={totalAttachmentBytes}
          disabled={loading}
        />

        <View style={styles.spacer} />

        <Button
          title="Create Task"
          onPress={handleSave}
          loading={loading}
          variant="primary"
          style={styles.button}
        />
      </ScrollView>
    </KeyboardAvoidingView>

    {/* Multi-Company Selection Modal */}
    <Modal
      visible={multiCompanyModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setMultiCompanyModalVisible(false)}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleRow}>
            <Ionicons name="copy" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.modalTitle}>Select Target Companies</Text>
              <Text style={styles.modalSubtitle}>
                {selectedCompanyIds.length} of {allCompanies.length} companies selected
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setMultiCompanyModalVisible(false)} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search Box */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search companies by name or code..."
            placeholderTextColor={Colors.textMuted}
            value={companySearchQuery}
            onChangeText={setCompanySearchQuery}
            autoCapitalize="none"
          />
          {companySearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setCompanySearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.modalActionsRow}>
          <TouchableOpacity
            style={styles.modalActionBtn}
            onPress={() => setSelectedCompanyIds(allCompanies.map((c) => c.id))}
          >
            <Ionicons name="checkmark-done" size={16} color={Colors.primary} style={{ marginRight: 4 }} />
            <Text style={styles.modalActionBtnText}>Select All ({allCompanies.length})</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalActionBtn, { borderColor: Colors.borderSubtle }]}
            onPress={() => setSelectedCompanyIds([])}
          >
            <Ionicons name="close-outline" size={16} color={Colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={[styles.modalActionBtnText, { color: Colors.textMuted }]}>Clear All</Text>
          </TouchableOpacity>
        </View>

        {/* Company List */}
        {loadingCompanies ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={allCompanies.filter((c) =>
              c.name.toLowerCase().includes(companySearchQuery.toLowerCase().trim()) ||
              (c.code && c.code.toLowerCase().includes(companySearchQuery.toLowerCase().trim()))
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="business-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Companies Found</Text>
                <Text style={styles.emptySubtitle}>
                  {companySearchQuery.trim()
                    ? `No companies match "${companySearchQuery}".`
                    : 'No active companies are currently registered on ZeroTask.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isChecked = selectedCompanyIds.includes(item.id);
              return (
                <TouchableOpacity
                  style={[styles.multiCompanyItem, isChecked && styles.multiCompanyItemActive]}
                  onPress={() => {
                    setSelectedCompanyIds((prev) =>
                      prev.includes(item.id)
                        ? prev.filter((id) => id !== item.id)
                        : [...prev, item.id]
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isChecked ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isChecked ? Colors.primary : Colors.textMuted}
                    style={{ marginRight: 12 }}
                  />
                  <View style={styles.companyIconBox}>
                    <Ionicons name="business" size={18} color={isChecked ? Colors.primary : Colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.companyName, isChecked && styles.companyNameActive]}>
                      {item.name}
                    </Text>
                    {item.code ? (
                      <Text style={styles.companyMeta}>Code: {item.code}</Text>
                    ) : (
                      <Text style={styles.companyMeta}>Organization Workspace</Text>
                    )}
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{item.status || 'Active'}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Confirm Button */}
        <View style={styles.modalBottomBar}>
          <TouchableOpacity
            style={styles.confirmModalBtn}
            onPress={() => setMultiCompanyModalVisible(false)}
          >
            <Text style={styles.confirmModalBtnText}>
              {selectedCompanyIds.length > 0
                ? `Done (${selectedCompanyIds.length} Companies Selected)`
                : 'Done'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>
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
  roleFilterContainer: {
    padding: Layout.spacing.sm,
    backgroundColor: Colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  rolePillsScroll: {
    gap: 6,
    paddingBottom: Layout.spacing.xs,
  },
  rolePillSmall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  rolePillSmallActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  rolePillSmallText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  rolePillSmallTextActive: {
    color: '#FFF',
    fontFamily: Typography.fontFamily.semiBold,
  },
  quickSelectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  quickSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: 6,
    gap: 4,
  },
  quickSelectText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  quickDeselectBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  quickDeselectText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  // Multi-Company Target Section Styles
  companyTargetSection: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Layout.spacing.md,
    marginBottom: Layout.spacing.lg,
    ...Layout.shadow.card,
  },
  companyTargetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  companyTargetTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.8,
  },
  badgePill: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgePillText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  targetModeRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.sm,
    padding: 3,
    gap: 4,
  },
  targetModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  targetModeBtnActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  targetModeBtnText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  targetModeBtnTextActive: {
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.bold,
  },
  multiSelectTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  multiSelectOpenBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  multiSelectOpenBtnText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  multiSelectOpenBtnSubtitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 1,
  },
  quickToggleAllBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  quickToggleAllText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  selectedChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  companyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
    maxWidth: '48%',
  },
  companyChipText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  emptyMultiHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.sm,
    padding: 10,
    marginTop: 8,
  },
  emptyMultiHintText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    flex: 1,
  },
  allCompaniesNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: Layout.radius.sm,
    padding: 12,
    marginTop: 10,
  },
  allCompaniesNoticeTitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  allCompaniesNoticeSubtitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // Modal Styles
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 6,
    paddingVertical: 6,
  },
  modalActionBtnText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  multiCompanyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.sm,
    padding: 12,
    marginBottom: 8,
  },
  multiCompanyItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  companyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  companyName: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  companyNameActive: {
    color: Colors.primary,
  },
  companyMeta: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: '#16A34A',
  },
  modalBottomBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  confirmModalBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Layout.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalBtnText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: '#FFFFFF',
  },
  centerLoading: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});
