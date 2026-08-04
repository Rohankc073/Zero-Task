import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Task } from '../types';

interface TaskCardProps {
  task: Task;
  onPress?: () => void;
  onMarkDone?: () => void;
}

export const TaskCard = React.memo(({ task, onPress, onMarkDone }: TaskCardProps) => {
  const getPriorityStyle = (priority: Task['priority']) => {
    switch (priority) {
      case 'Urgent': return { backgroundColor: '#dc2626' }; // Dark Red
      case 'High': return { backgroundColor: '#ef4444' }; // Red
      case 'Medium': return { backgroundColor: '#e1c37a' }; // Gold
      case 'Low': return { backgroundColor: '#9ca3af' }; // Gray
      default: return { backgroundColor: '#9ca3af' };
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'Done': return '#16a34a';
      case 'Awaiting Review': return '#ca8a04';
      case 'In Progress': return '#e1c37a';
      case 'To Do': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const formatDueDate = (dateString: string | null) => {
    if (!dateString) return 'No due date';
    const due = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = due.getDate() === today.getDate() && due.getMonth() === today.getMonth() && due.getFullYear() === today.getFullYear();
    const isTomorrow = due.getDate() === tomorrow.getDate() && due.getMonth() === tomorrow.getMonth() && due.getFullYear() === tomorrow.getFullYear();

    if (isToday) return 'Due Today';
    if (isTomorrow) return 'Due Tomorrow';
    return `Due: ${due.toLocaleDateString()}`;
  };

  const progress = task.progress || 0;

  return (
    <TouchableOpacity 
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {task.title}
        </Text>
        <View style={[styles.priorityBadge, getPriorityStyle(task.priority)]}>
          <Text style={styles.priorityText}>{task.priority}</Text>
        </View>
      </View>
      
      {task.parent_task_id ? (
        <Text style={styles.subTaskLabel}>↳ Sub-task</Text>
      ) : null}

      {task.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}
      
      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Progress</Text>
          <Text style={styles.progressValue}>{progress}%</Text>
        </View>
        <View style={styles.progressBarBackground}>
          <View 
            style={[
              styles.progressBarFill, 
              { width: `${progress}%`, backgroundColor: getStatusColor(task.status) }
            ]} 
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.status, { color: getStatusColor(task.status) }]}>
          {task.status}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.dueDate, task.due_date && formatDueDate(task.due_date).includes('Today') ? { color: '#ef4444', marginRight: onMarkDone ? 10 : 0 } : { marginRight: onMarkDone ? 10 : 0 }]}>
            {formatDueDate(task.due_date)}
          </Text>
          {onMarkDone && (
            <TouchableOpacity 
              onPress={(e) => { e.stopPropagation(); onMarkDone(); }} 
              style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}
            >
              <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>MARK DONE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f141a',
    flex: 1,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  subTaskLabel: {
    fontSize: 12,
    color: '#e1c37a',
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    color: '#4b5563',
    fontSize: 14,
    marginBottom: 12,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 12,
    color: '#0f141a',
    fontWeight: 'bold',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
  },
  dueDate: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
});
