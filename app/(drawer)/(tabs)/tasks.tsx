import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTasks } from '../../../src/hooks/useCoreEngine';
import { CreateTaskModal, CreateTaskModalRef } from '../../../src/components/CreateTaskModal';
import { useAuth } from '../../../src/context/AuthContext';
import { canDeleteTask } from '../../../src/utils/permissions';
import { TaskService } from '../../../src/services/tasks/TaskService';
import { Task } from '../../../src/types';
import { TaskSkeleton } from '../../../src/components/Skeleton';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { useResponsive } from '../../../src/hooks/useResponsive';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { TabPills } from '../../../src/components/ui/TabPills';
import { Period, PeriodSelector } from '../../../src/components/ui/PeriodSelector';
import { getPeriodDateRanges } from '../../../src/hooks/useDashboards';
import { CompanyFilterSelector } from '../../../src/components/CompanyFilterSelector';
import TaskPreviewModal from '../../../src/components/TaskPreviewModal';
import { CompactTaskRow } from '../../../src/components/tasks/CompactTaskRow';

export default function TaskDashboard() {
  const { tasks, loading, setTasks, refetch } = useTasks();
  const { profile } = useAuth();
  const { isTablet } = useResponsive();
  const modalRef = useRef<CreateTaskModalRef>(null);

  const { status, companyId } = useLocalSearchParams();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>((companyId as string) || null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<'All' | 'Delegated' | 'My Tasks' | 'Assigned to Me'>('All');
  const [scopeFilter, setScopeFilter] = useState<'All' | 'General' | 'Department'>('All');
  const [dateFilter, setDateFilter] = useState<Period>('All Time');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch?.();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch?.();
    }, [refetch])
  );

  const now = new Date();

  const isTaskOverdue = (t: Task) => {
    return !!(t.due_date && new Date(t.due_date) < now && t.status !== 'Done');
  };

  const { start: dateStart, end: dateEnd } = getPeriodDateRanges(dateFilter);

  // Filter tasks by scope, date, company
  const filteredTasks = useMemo(() => {
    const seen = new Set<string>();
    return tasks
      .filter((t) => {
        if (!t?.id || seen.has(t.id)) return false;
        seen.add(t.id);

        // Top-level only for the main explorer view
        if (t.parent_task_id) return false;

        let matchesScope = true;
        if (scopeFilter === 'General') matchesScope = t.department_id === null;
        if (scopeFilter === 'Department') matchesScope = t.department_id !== null;

        let matchesDate = true;
        if (dateStart || dateEnd) {
          const taskCreatedAt = t.created_at ? new Date(t.created_at) : null;
          const taskDueDate = t.due_date ? new Date(t.due_date) : null;
          const taskCompletedAt = (t as any).completed_at ? new Date((t as any).completed_at) : null;

          if (dateStart && dateEnd) {
            matchesDate = !!(
              (taskCreatedAt && taskCreatedAt >= dateStart && taskCreatedAt <= dateEnd) ||
              (taskDueDate && taskDueDate >= dateStart && taskDueDate <= dateEnd) ||
              (taskCompletedAt && taskCompletedAt >= dateStart && taskCompletedAt <= dateEnd)
            );
          } else if (dateStart) {
            matchesDate = !!(
              (taskCreatedAt && taskCreatedAt >= dateStart) ||
              (taskDueDate && taskDueDate >= dateStart) ||
              (taskCompletedAt && taskCompletedAt >= dateStart)
            );
          }
        }

        let matchesCompany = true;
        if (profile?.role === 'Super Admin' && selectedCompanyId) {
          matchesCompany = t.company_id === selectedCompanyId;
        }

        return matchesScope && matchesDate && matchesCompany;
      })
      .sort((a, b) => {
        const aOverdue = isTaskOverdue(a);
        const bOverdue = isTaskOverdue(b);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        const aDone = a.status === 'Done';
        const bDone = b.status === 'Done';
        if (aDone && !bDone) return 1;
        if (!aDone && bDone) return -1;

        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bCreated - aCreated;
      });
  }, [tasks, scopeFilter, dateStart, dateEnd, profile?.role, selectedCompanyId]);

  // Determine Delegated vs My Tasks (Personal) vs Assigned to Me vs Department Tasks
  const isDelegatedTask = useCallback(
    (t: Task) => {
      if (!profile?.id) return false;
      const isCreator = t.created_by === profile.id;
      if (!isCreator) return false;

      const assignees = (t as any).assignees || [];
      if (assignees.length > 0) {
        return assignees.some((a: any) => {
          const uid = a.user_id || a.user?.id || a.id;
          return uid && uid !== profile.id;
        });
      }
      return !!t.user_id && t.user_id !== profile.id;
    },
    [profile?.id]
  );

  const isPersonalTask = useCallback(
    (t: Task) => {
      if (!profile?.id) return false;
      const isCreator = t.created_by === profile.id;
      if (!isCreator) return false;

      const assignees = (t as any).assignees || [];
      if (assignees.length === 0) {
        return !t.user_id || t.user_id === profile.id;
      }
      return assignees.every((a: any) => {
        const uid = a.user_id || a.user?.id || a.id;
        return !uid || uid === profile.id;
      });
    },
    [profile?.id]
  );

  const isAssignedToMe = useCallback(
    (t: Task) => {
      if (!profile?.id) return false;
      const isCreator = t.created_by === profile.id;
      if (isCreator) return false;

      const assignees = (t as any).assignees || [];
      if (assignees.length > 0) {
        return assignees.some((a: any) => {
          const uid = a.user_id || a.user?.id || a.id;
          return uid === profile.id;
        });
      }
      return t.user_id === profile.id;
    },
    [profile?.id]
  );

  const { delegatedTasks, myTasks, assignedToMeTasks, departmentTasks } = useMemo(() => {
    const delegated: Task[] = [];
    const personal: Task[] = [];
    const assigned: Task[] = [];
    const dept: Task[] = [];

    filteredTasks.forEach((t) => {
      if (isDelegatedTask(t)) {
        delegated.push(t);
      } else if (isPersonalTask(t)) {
        personal.push(t);
      } else if (isAssignedToMe(t)) {
        assigned.push(t);
      } else {
        dept.push(t);
      }
    });

    return {
      delegatedTasks: delegated,
      myTasks: personal,
      assignedToMeTasks: assigned,
      departmentTasks: dept,
    };
  }, [filteredTasks, isDelegatedTask, isPersonalTask, isAssignedToMe]);

  const handleDelete = async (task: Task) => {
    if (!canDeleteTask(profile, task)) {
      Alert.alert('Unauthorized', 'You do not have authorization to delete this task.');
      return;
    }
    Alert.alert(
      `Delete "${task.title}"?`,
      "This action will permanently remove this task and its related data.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
            try {
              const res = await TaskService.deleteTask(task.id);
              if (res.error) {
                refetch?.();
                Alert.alert('Delete Failed', res.error.message || 'Failed to delete task');
              }
            } catch (err: any) {
              refetch?.();
              Alert.alert('Error', err.message || 'Failed to delete task');
            }
          },
        },
      ]
    );
  };

  const sectionTabs = [
    { key: 'All', label: `All (${filteredTasks.length})` },
    { key: 'Delegated', label: `Delegated (${delegatedTasks.length})` },
    { key: 'My Tasks', label: `My Tasks (${myTasks.length})` },
    { key: 'Assigned to Me', label: `Assigned to Me (${assignedToMeTasks.length})` },
  ];

  const scopeTabs = [
    { key: 'All', label: 'All Scopes' },
    { key: 'General', label: 'General' },
    { key: 'Department', label: 'Department' },
  ];

  if (loading && tasks.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ZeroTaskHeader />
        <View style={styles.header}>
          <Text style={styles.title}>Tasks</Text>
        </View>
        <TaskSkeleton />
        <TaskSkeleton />
        <TaskSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <ZeroTaskHeader />

      {/* Page Title & Filter Bar */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Tasks</Text>
            <Text style={styles.subtitle}>Hierarchical Workforce Execution</Text>
          </View>
          <PeriodSelector value={dateFilter} onChange={setDateFilter} />
        </View>

        {profile?.role === 'Super Admin' && (
          <View style={{ marginBottom: Layout.spacing.sm }}>
            <CompanyFilterSelector
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={(cId) => setSelectedCompanyId(cId)}
              showAllOption
              allOptionLabel="All Companies"
            />
          </View>
        )}

        {/* Section Tabs: ALL | DELEGATED | MY TASKS | ASSIGNED TO ME */}
        <View style={{ marginBottom: Layout.spacing.xs }}>
          <TabPills
            tabs={sectionTabs}
            activeKey={sectionFilter}
            onChange={(k) => setSectionFilter(k as any)}
          />
        </View>

        {/* Scope Tabs: ALL SCOPES | GENERAL | DEPARTMENT */}
        <TabPills
          tabs={scopeTabs}
          activeKey={scopeFilter}
          onChange={(k) => setScopeFilter(k as any)}
        />
      </View>

      {/* ── Main Task Content ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { maxWidth: 840, width: '100%', alignSelf: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {/* ── SECTION 1: DELEGATED TASKS (Assigned by you to others) ── */}
        {(sectionFilter === 'Delegated' || (sectionFilter === 'All' && delegatedTasks.length > 0)) && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIconCircle, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="paper-plane" size={14} color="#4F46E5" />
                </View>
                <Text style={styles.sectionTitle}>DELEGATED TASKS</Text>
                <View style={[styles.badgePill, { backgroundColor: '#EEF2FF' }]}>
                  <Text style={[styles.badgePillText, { color: '#4F46E5' }]}>{delegatedTasks.length}</Text>
                </View>
              </View>
              <Text style={styles.sectionCaption}>Assigned by you to team members</Text>
            </View>

            {delegatedTasks.length > 0 ? (
              delegatedTasks.map((item) => (
                <CompactTaskRow
                  key={item.id}
                  task={item}
                  onPress={(id) => setPreviewTaskId(id)}
                  onDelete={handleDelete}
                  canDelete={canDeleteTask(profile, item)}
                />
              ))
            ) : (
              <View style={styles.sectionEmptyBox}>
                <Ionicons name="paper-plane-outline" size={24} color={Colors.textMuted} />
                <Text style={styles.sectionEmptyText}>No tasks currently delegated to others</Text>
              </View>
            )}
          </View>
        )}

        {/* ── SECTION 2: MY TASKS (Personal) ── */}
        {(sectionFilter === 'My Tasks' || (sectionFilter === 'All' && (myTasks.length > 0 || delegatedTasks.length === 0))) && (
          <View style={[styles.sectionContainer, sectionFilter === 'All' && delegatedTasks.length > 0 && { marginTop: 18 }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIconCircle, { backgroundColor: Colors.primaryLight }]}>
                  <Ionicons name="person" size={14} color={Colors.primary} />
                </View>
                <Text style={styles.sectionTitle}>MY TASKS</Text>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>{myTasks.length}</Text>
                </View>
              </View>
              <Text style={styles.sectionCaption}>Created by you for yourself</Text>
            </View>

            {myTasks.length > 0 ? (
              myTasks.map((item) => (
                <CompactTaskRow
                  key={item.id}
                  task={item}
                  onPress={(id) => setPreviewTaskId(id)}
                  onDelete={handleDelete}
                  canDelete={canDeleteTask(profile, item)}
                />
              ))
            ) : (
              <View style={styles.sectionEmptyBox}>
                <Ionicons name="checkmark-done-outline" size={24} color={Colors.textMuted} />
                <Text style={styles.sectionEmptyText}>No personal tasks created</Text>
              </View>
            )}
          </View>
        )}

        {/* ── SECTION 3: ASSIGNED TO YOU ── */}
        {(sectionFilter === 'Assigned to Me' || sectionFilter === 'All') && (
          <View style={[styles.sectionContainer, sectionFilter === 'All' && { marginTop: 18 }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIconCircle, { backgroundColor: Colors.infoLight }]}>
                  <Ionicons name="people" size={14} color={Colors.info} />
                </View>
                <Text style={styles.sectionTitle}>ASSIGNED TO YOU</Text>
                <View style={[styles.badgePill, { backgroundColor: Colors.infoLight }]}>
                  <Text style={[styles.badgePillText, { color: Colors.info }]}>{assignedToMeTasks.length}</Text>
                </View>
              </View>
              <Text style={styles.sectionCaption}>Assigned to you by others</Text>
            </View>

            {assignedToMeTasks.length > 0 ? (
              assignedToMeTasks.map((item) => (
                <CompactTaskRow
                  key={item.id}
                  task={item}
                  onPress={(id) => setPreviewTaskId(id)}
                  onDelete={handleDelete}
                  canDelete={canDeleteTask(profile, item)}
                />
              ))
            ) : (
              <View style={styles.sectionEmptyBox}>
                <Ionicons name="clipboard-outline" size={24} color={Colors.textMuted} />
                <Text style={styles.sectionEmptyText}>No incoming assigned tasks</Text>
              </View>
            )}
          </View>
        )}

        {/* ── SECTION 4: DEPARTMENT / TEAM TASKS (for Managers, DH, Admins) ── */}
        {(sectionFilter === 'All' && departmentTasks.length > 0) && (
          <View style={[styles.sectionContainer, { marginTop: 18 }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="business" size={14} color="#059669" />
                </View>
                <Text style={styles.sectionTitle}>DEPARTMENT TASKS</Text>
                <View style={[styles.badgePill, { backgroundColor: '#ECFDF5' }]}>
                  <Text style={[styles.badgePillText, { color: '#059669' }]}>{departmentTasks.length}</Text>
                </View>
              </View>
              <Text style={styles.sectionCaption}>Team execution in your department</Text>
            </View>

            {departmentTasks.map((item) => (
              <CompactTaskRow
                key={item.id}
                task={item}
                onPress={(id) => setPreviewTaskId(id)}
                onDelete={handleDelete}
                canDelete={canDeleteTask(profile, item)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button (+ Add Task) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => modalRef.current?.present()}
        activeOpacity={0.85}
        accessibilityLabel="Create New Task"
      >
        <Ionicons name="add" size={28} color={Colors.textInverse} />
      </TouchableOpacity>

      {/* Create Task Modal */}
      <CreateTaskModal
        ref={modalRef}
        onSuccess={(newTask) => {
          if (newTask?.id) {
            setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)]);
          }
          refetch?.();
        }}
      />

      {/* Task Preview & Authoritative Workspace Modal */}
      <TaskPreviewModal
        visible={!!previewTaskId}
        onClose={() => setPreviewTaskId(null)}
        taskId={previewTaskId || ''}
        isSimplePreview={true}
        onTaskUpdated={(updatedTask) => {
          if (updatedTask) {
            if ((updatedTask as any)._deleted) {
              setTasks((prev) => prev.filter((t) => t.id !== updatedTask.id));
            } else {
              setTasks((prev) =>
                prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t))
              );
            }
          }
        }}
      />
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
    paddingTop: Layout.spacing.sm,
    paddingBottom: Layout.spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Layout.spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: 16,
    paddingBottom: 100,
  },
  sectionContainer: {
    marginBottom: 8,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  sectionCaption: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
    marginLeft: 32,
  },
  badgePill: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
  },
  badgePillText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  sectionEmptyBox: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sectionEmptyText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
