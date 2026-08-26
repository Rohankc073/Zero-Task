import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { TaskCard } from '../../../src/components/tasks/TaskCard';
import { TabPills } from '../../../src/components/ui/TabPills';
import { TaskSkeleton } from '../../../src/components/Skeleton';
import { useTasks } from '../../../src/hooks/useCoreEngine';
import { useAuth } from '../../../src/context/AuthContext';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { Task } from '../../../src/types';

import TaskPreviewModal from '../../../src/components/TaskPreviewModal';

export default function ExecutionPortal() {
  const router = useRouter();
  const { profile } = useAuth();
  const { tasks, loading, setTasks } = useTasks();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [classificationFilter, setClassificationFilter] = useState<'Operational' | 'Follow-up' | 'Review / Approval' | 'Escalation'>('Operational');

  // Filter tasks based on classification for the Execution Team
  const filteredTasks = tasks.filter(t => t.execution_classification === classificationFilter);

  const classificationTabs = [
    { key: 'Operational', label: 'Operational' },
    { key: 'Follow-up', label: 'Follow-up' },
    { key: 'Review / Approval', label: 'Review / Approval' },
    { key: 'Escalation', label: 'Escalation' },
  ];

  if (loading && tasks.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ZeroTaskHeader />
        <View style={styles.header}>
          <Text style={styles.title}>Execution Portal</Text>
        </View>
        <TaskSkeleton />
        <TaskSkeleton />
        <TaskSkeleton />
      </SafeAreaView>
    );
  }

  // Fallback for non-authorized users:
  if (profile?.role !== 'Execution Team' && profile?.role !== 'Founder') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ZeroTaskHeader />
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.borderStrong} />
          <Text style={styles.emptyTitle}>Access Denied</Text>
          <Text style={styles.emptySubtitle}>You do not have permission to view the execution portal.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      <View style={styles.header}>
        <Text style={styles.title}>Execution Portal</Text>
        <Text style={styles.subtitle}>Triage and manage cross-functional execution tasks.</Text>
        <TabPills
          tabs={classificationTabs}
          activeKey={classificationFilter}
          onChange={k => setClassificationFilter(k as any)}
          style={{ marginTop: Layout.spacing.md }}
        />
      </View>

      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <FlashList
          data={filteredTasks}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onPress={() => setSelectedTaskId(item.id)}
              onToggleComplete={() => {}}
            />
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.borderStrong} />
              <Text style={styles.emptyTitle}>No tasks found</Text>
              <Text style={styles.emptySubtitle}>
                No tasks currently classified as {classificationFilter}.
              </Text>
            </View>
          }
        />
      </View>

      {/* Task Detail & Segregation Modal */}
      {selectedTaskId && (
        <TaskPreviewModal
          taskId={selectedTaskId}
          visible={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={() => {
            // refreshed automatically on task queries
          }}
        />
      )}
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
  title: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: Layout.spacing.xs,
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
});
