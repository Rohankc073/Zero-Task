import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDepartmentHeadData } from '../../hooks/useDashboards';
import { useFilteredTasks } from '../../hooks/useFilteredTasks';
import { useAuth } from '../../context/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';
import { TaskFilterBar } from '../TaskFilterBar';
import { TaskCard } from '../TaskCard';
import TaskPreviewModal from '../TaskPreviewModal';
import { Task } from '../../types';
import { ROIWidget } from '../ROIWidget';

export function DepartmentHeadDashboard() {
  const router = useRouter();
  const { profile } = useAuth();
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  
  const { tasks: rawTasks, pendingApprovals, loading, refetch } = useDepartmentHeadData();
  const { filters, updateFilter, filteredTasks } = useFilteredTasks(rawTasks, profile?.id);

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const summary = React.useMemo(() => {
    let assignedToMe = 0;
    let delegatedDown = 0;
    rawTasks.forEach(t => {
      if (t.user_id === profile?.id) assignedToMe++;
      else delegatedDown++;
    });
    return { assignedToMe, delegatedDown };
  }, [rawTasks, profile]);

  const nestedTasks = React.useMemo(() => {
    const topLevelTasks = filteredTasks.filter(t => !t.parent_task_id);
    const subTasks = filteredTasks.filter(t => t.parent_task_id);
    const result: (Task & { isSubTask?: boolean })[] = [];
    
    topLevelTasks.forEach(parent => {
      result.push(parent);
      const children = subTasks.filter(t => t.parent_task_id === parent.id);
      children.forEach(child => result.push({ ...child, isSubTask: true }));
    });
    
    const orphans = subTasks.filter(sub => !topLevelTasks.find(p => p.id === sub.parent_task_id));
    orphans.forEach(orphan => result.push({ ...orphan, isSubTask: true }));

    return result;
  }, [filteredTasks]);

  if (loading && rawTasks.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {pendingApprovals > 0 && (
        <TouchableOpacity 
          style={styles.alertBanner} 
          onPress={() => router.push('/approvals')}
        >
          <Ionicons name="warning-outline" size={24} color="#f7f6f2" />
          <Text style={styles.alertText}>Action Required: {pendingApprovals} Pending Manager Registrations</Text>
          <Ionicons name="chevron-forward" size={20} color="#f7f6f2" />
        </TouchableOpacity>
      )}


      {/* Delegation Summary Widget */}
      <View style={styles.summaryWidget}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Assigned to Me</Text>
          <Text style={styles.summaryValue}>{summary.assignedToMe}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Delegated Down</Text>
          <Text style={styles.summaryValueGold}>{summary.delegatedDown}</Text>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Unified Task List</Text>
      </View>

      <View>
        <TaskFilterBar 
          filters={filters} 
          onFilterChange={updateFilter} 
        />
      </View>

      <FlatList
        data={nestedTasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={[item.isSubTask && styles.subTaskContainer]}>
            {item.isSubTask && <View style={styles.treeBranch} />}
            <View style={{ flex: 1 }}>
              <TaskCard 
                task={item} 
                onPress={() => setSelectedTaskId(item.id)} 
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tasks found for the current filters.</Text>
          </View>
        }
      />

      <TaskPreviewModal 
        taskId={selectedTaskId}
        visible={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBanner: {
    flexDirection: 'row',
    backgroundColor: '#0f141a',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertText: {
    color: '#f7f6f2',
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 10,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 5,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f141a',
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  summaryWidget: {
    flexDirection: 'row',
    backgroundColor: '#0f141a',
    margin: 20,
    marginBottom: 0,
    borderRadius: 16,
    padding: 20,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  summaryValue: {
    color: '#f7f6f2',
    fontSize: 28,
    fontWeight: 'bold',
  },
  summaryValueGold: {
    color: '#e1c37a',
    fontSize: 28,
    fontWeight: 'bold',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
  },
  subTaskContainer: {
    flexDirection: 'row',
    marginLeft: 20,
  },
  treeBranch: {
    width: 2,
    backgroundColor: '#e1c37a',
    marginRight: 15,
    marginTop: 20,
    marginBottom: 30,
    borderRadius: 2,
  }
});
