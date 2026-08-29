import React, { useRef, useState } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
  Animated,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TaskCard } from '../../../src/components/tasks/TaskCard';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useTasks } from '../../../src/hooks/useCoreEngine';
import { CreateTaskModal, CreateTaskModalRef } from '../../../src/components/CreateTaskModal';
import { Swipeable } from 'react-native-gesture-handler';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { canDeleteTask } from '../../../src/utils/permissions';
import { Task, TaskStatus } from '../../../src/types';
import { OfflineManager } from '../../../src/lib/OfflineManager';
import { TaskSkeleton } from '../../../src/components/Skeleton';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { TabPills } from '../../../src/components/ui/TabPills';
import { Period, PeriodSelector } from '../../../src/components/ui/PeriodSelector';
import { getPeriodDateRanges } from '../../../src/hooks/useDashboards';
import { CompanyFilterSelector } from '../../../src/components/CompanyFilterSelector';

export default function TaskDashboard() {
  const router = useRouter();
  const { tasks, loading, setTasks } = useTasks();
  const { profile } = useAuth();
  const modalRef = useRef<CreateTaskModalRef>(null);

  const { status, companyId } = useLocalSearchParams();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(companyId as string || null);
  const [filter, setFilter] = useState<'All' | TaskStatus | 'Overdue'>((status as any) || 'All');
  const [scopeFilter, setScopeFilter] = useState<'All' | 'General' | 'Department'>('All');
  const [dateFilter, setDateFilter] = useState<Period>('All Time');

  const now = new Date();

  const isTaskOverdue = (t: Task) => {
    return !!(t.due_date && new Date(t.due_date) < now && t.status !== 'Done');
  };

  const overdueCount = tasks.filter(isTaskOverdue).length;

  const { start: dateStart, end: dateEnd } = getPeriodDateRanges(dateFilter);

  const filteredTasks = tasks
    .filter(t => {
      let matchesStatus = true;
      if (filter === 'All') {
        matchesStatus = true;
      } else if (filter === 'Overdue') {
        matchesStatus = isTaskOverdue(t);
      } else {
        matchesStatus = t.status?.toLowerCase() === filter.toLowerCase();
      }

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

      return matchesStatus && matchesScope && matchesDate && matchesCompany;
    })
    .sort((a, b) => {
      const aOverdue = isTaskOverdue(a);
      const bOverdue = isTaskOverdue(b);

      // 1. Overdue tasks always appear at the top
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      // If both are overdue, sort by oldest deadline first (most urgent)
      if (aOverdue && bOverdue) {
        const aDue = a.due_date ? new Date(a.due_date).getTime() : 0;
        const bDue = b.due_date ? new Date(b.due_date).getTime() : 0;
        return aDue - bDue;
      }

      // 2. Completed / Done tasks always sort towards the bottom
      const aDone = a.status === 'Done';
      const bDone = b.status === 'Done';
      if (aDone && !bDone) return 1;
      if (!aDone && bDone) return -1;

      // 3. Priority ranking for active tasks (Urgent > High > Medium > Low)
      const priorityWeight = (p?: string) => {
        switch (p?.toUpperCase()) {
          case 'URGENT': return 4;
          case 'HIGH': return 3;
          case 'MEDIUM': return 2;
          default: return 1;
        }
      };
      const pDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
      // 2. Then by creation date (newest first)
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bCreated - aCreated;
    });

  const handleToggleComplete = async (task: Task) => {
    if (task.status === 'Done') {
      Alert.alert('Task Completed', 'This task has been marked as done and cannot be reverted. You can delete it if it is no longer needed.');
      return;
    }

    Alert.alert('Mark task as completed?', task.title, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Mark as Completed', 
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const newStatus = 'Done';
          const newProgress = 100;
          
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, progress: newProgress } : t));

          try {
            const { error } = await supabase.from('tasks').update({ status: newStatus, progress: newProgress }).eq('id', task.id);
            if (error) throw error;
          } catch (err: any) {
            if (err.message === 'Failed to fetch' || err.message.includes('network')) {
              OfflineManager.enqueueMutation({
                table: 'tasks',
                action: 'UPDATE',
                payload: { status: newStatus, progress: newProgress },
                matchKey: 'id',
                matchValue: task.id,
              });
            } else {
              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status, progress: task.progress } : t));
              Alert.alert('Error', err.message);
            }
          }
        }
      }
    ]);
  };

  const handleDelete = async (task: Task) => {
    if (!canDeleteTask(profile, task)) {
      Alert.alert('Unauthorized', 'Only the task creator or founder can delete this task.');
      return;
    }
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setTasks(prev => prev.filter(t => t.id !== task.id));
          try {
            const { error } = await supabase.from('tasks').delete().eq('id', task.id);
            if (error) throw error;
          } catch (err: any) {
            if (err.message === 'Failed to fetch' || err.message.includes('network')) {
              OfflineManager.enqueueMutation({
                table: 'tasks',
                action: 'DELETE',
                payload: {},
                matchKey: 'id',
                matchValue: task.id,
              });
            } else {
              Alert.alert('Error', err.message);
            }
          }
        }
      }
    ]);
  };

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, task: Task) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    if (task.status === 'Done') {
      return (
        <TouchableOpacity
          onPress={() => handleDelete(task)}
          style={[styles.swipeAction, { backgroundColor: Colors.danger, borderRadius: Layout.radius.md, marginVertical: 2, marginRight: Layout.spacing.lg, justifyContent: 'center', alignItems: 'center', width: 72 }]}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="trash-outline" size={22} color={Colors.textInverse} />
          </Animated.View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={() => handleToggleComplete(task)}
        style={[styles.swipeAction, { backgroundColor: Colors.success, borderRadius: Layout.radius.md, marginVertical: 2, marginRight: Layout.spacing.lg, justifyContent: 'center', alignItems: 'center', width: 72 }]}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="checkmark" size={22} color={Colors.textInverse} />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderLeftActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, task: Task) => {
    const scale = dragX.interpolate({
      inputRange: [0, 100],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });

    if (task.status === 'Done') {
      return (
        <TouchableOpacity
          onPress={() => handleDelete(task)}
          style={[styles.swipeAction, { backgroundColor: Colors.danger, borderRadius: Layout.radius.md, marginVertical: 2, marginLeft: Layout.spacing.lg, justifyContent: 'center', alignItems: 'center', width: 72 }]}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="trash-outline" size={22} color={Colors.textInverse} />
          </Animated.View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={() => handleToggleComplete(task)}
        style={[styles.swipeAction, { backgroundColor: Colors.success, borderRadius: Layout.radius.md, marginVertical: 2, marginLeft: Layout.spacing.lg, justifyContent: 'center', alignItems: 'center', width: 72 }]}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="checkmark" size={22} color={Colors.textInverse} />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const statusTabs = [
    { key: 'All', label: 'All', count: tasks.length },
    { key: 'To Do', label: 'To Do', count: tasks.filter(t => t.status === 'To Do').length },
    { key: 'In Progress', label: 'In Progress', count: tasks.filter(t => t.status === 'In Progress').length },
    { key: 'Done', label: 'Done', count: tasks.filter(t => t.status === 'Done').length },
    { key: 'Overdue', label: 'Overdue', count: overdueCount },
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

      {/* Page title + filters */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Tasks</Text>
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

        <TabPills
          tabs={scopeTabs}
          activeKey={scopeFilter}
          onChange={k => setScopeFilter(k as any)}
          style={{ marginBottom: Layout.spacing.sm }}
        />

        <TabPills
          tabs={statusTabs}
          activeKey={filter}
          onChange={k => setFilter(k as any)}
        />
      </View>

      {/* Task List */}
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <FlashList
          data={filteredTasks}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <Swipeable
              renderRightActions={(p, d) => renderRightActions(p, d, item)}
              renderLeftActions={(p, d) => renderLeftActions(p, d, item)}
              friction={2}
            >
              <TaskCard
                task={item}
                onPress={() => router.push(`/task/${item.id}` as any)}
              />
            </Swipeable>
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.borderStrong} />
              <Text style={styles.emptyTitle}>No tasks found</Text>
              <Text style={styles.emptySubtitle}>
                {filter !== 'All' ? `No ${filter} tasks in this scope.` : 'Add a task to get started.'}
              </Text>
            </View>
          }
        />
      </View>



      <CreateTaskModal
        ref={modalRef}
        onSuccess={(newTask) => {
          if (newTask) {
            setTasks(prev => [newTask, ...prev]);
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
    paddingTop: Layout.spacing.md,
    paddingBottom: Layout.spacing.md,
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
  listContent: {
    paddingBottom: 80,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: Layout.spacing.sm,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textSecondary,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  fab: {
    position: 'absolute',
    bottom: Layout.spacing.xl,
    right: Layout.spacing.lg,
    width: 56,
    height: 56,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  swipeAction: {
    flex: 1,
  },
});
