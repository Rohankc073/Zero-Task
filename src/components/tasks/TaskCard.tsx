import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { Avatar } from '../ui/Avatar';

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    description?: string | null;
    status: 'To Do' | 'In Progress' | 'Done' | 'Blocked' | string;
    priority: 'Low' | 'Medium' | 'High' | 'Urgent' | string;
    due_date?: string | null;
    assignee?: { full_name?: string } | null;
    parent_task_id?: string | null;
    departments?: { name?: string } | null;
    subtasks?: any[];
  };
  onPress: () => void;
  onToggleComplete?: () => void;
  onMarkDone?: () => void;
}

function priorityColor(priority: string): string {
  switch (priority?.toUpperCase()) {
    case 'HIGH':
    case 'URGENT':
      return Colors.danger;
    case 'MEDIUM':
      return Colors.warning;
    default:
      return Colors.success;
  }
}

function priorityIconName(priority: string): keyof typeof Ionicons.glyphMap {
  switch (priority?.toUpperCase()) {
    case 'HIGH':
    case 'URGENT':
      return 'flag';
    case 'MEDIUM':
      return 'flag-outline';
    default:
      return 'remove-outline';
  }
}

function dueDateLabel(dateStr?: string | null, isDone?: boolean): { label: string; color: string; isOverdue: boolean } {
  if (!dateStr) return { label: '', color: Colors.textMuted, isOverdue: false };
  const now = new Date();
  const due = new Date(dateStr);
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diff < 0 && !isDone) {
    const days = Math.abs(diff);
    return {
      label: days === 1 ? 'Yesterday' : `${days}d ago`,
      color: Colors.danger,
      isOverdue: true,
    };
  }
  if (diff === 0 && !isDone) return { label: 'Today', color: Colors.danger, isOverdue: false };
  if (diff <= 2 && !isDone) return { label: `${diff}d left`, color: Colors.warning, isOverdue: false };
  return {
    label: due.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
    color: isDone ? Colors.textMuted : Colors.textSecondary,
    isOverdue: false,
  };
}

import { AnimatedPressable } from '../ui/AnimatedPressable';

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onPress,
  onToggleComplete,
  onMarkDone,
}) => {
  const isDone = task.status === 'Done' || task.status === 'DONE';
  const pColor = priorityColor(task.priority);
  const { label: dateLabel, color: dateColor, isOverdue } = dueDateLabel(task.due_date, isDone);
  const projectName = task.departments?.name || '';

  return (
    <AnimatedPressable
      onPress={onPress}
      scaleTo={0.98}
      style={[
        styles.row,
        isDone && styles.rowDone,
        isOverdue && styles.rowOverdue,
        task.parent_task_id && styles.rowSubTask,
      ]}
    >
      {/* Checkbox */}
      <TouchableOpacity
        onPress={onToggleComplete || onMarkDone}
        style={[styles.checkbox, isDone && styles.checkboxDone, isOverdue && styles.checkboxOverdue]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isDone && <Ionicons name="checkmark" size={10} color={Colors.textInverse} />}
      </TouchableOpacity>

      {/* Priority icon */}
      <Ionicons
        name={priorityIconName(task.priority)}
        size={14}
        color={isOverdue ? Colors.danger : pColor}
        style={{ marginRight: 2 }}
      />

      {/* Title + project */}
      <View style={styles.body}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text
            numberOfLines={1}
            style={[styles.title, isDone && styles.titleDone, isOverdue && { color: Colors.textPrimary }]}
          >
            {task.title}
          </Text>
          {isOverdue && (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueBadgeText}>OVERDUE</Text>
            </View>
          )}
          {task.subtasks && task.subtasks.length > 0 && (
            <View style={styles.breakdownBadge}>
              <Ionicons name="git-branch-outline" size={10} color={Colors.primary} />
              <Text style={styles.breakdownBadgeText}>{task.subtasks.length} subtasks</Text>
            </View>
          )}
        </View>
        {projectName ? (
          <Text numberOfLines={1} style={styles.project}>{projectName}</Text>
        ) : task.description ? (
          <Text numberOfLines={1} style={styles.project}>{task.description}</Text>
        ) : null}
      </View>

      {/* Assignee avatar */}
      {task.assignee?.full_name && (
        <Avatar name={task.assignee.full_name} size={22} style={{ marginRight: 6 }} />
      )}

      {/* Priority label */}
      <Text style={[styles.priority, { color: isOverdue ? Colors.danger : pColor }]}>{task.priority}</Text>

      {/* Deadline */}
      {dateLabel ? (
        <Text style={[styles.date, { color: dateColor, fontFamily: isOverdue ? Typography.fontFamily.semiBold : Typography.fontFamily.medium }]}>
          {dateLabel}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    gap: Layout.spacing.xs,
  },
  rowDone: {
    opacity: 0.55,
    backgroundColor: Colors.surfaceSecondary,
  },
  rowOverdue: {
    backgroundColor: '#FFF5F5',
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  rowSubTask: {
    marginLeft: Layout.spacing.xxl,
    borderLeftWidth: 2,
    borderLeftColor: Colors.borderSubtle,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: Layout.radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Layout.spacing.xs,
  },
  checkboxDone: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  checkboxOverdue: {
    borderColor: Colors.danger,
  },
  overdueBadge: {
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  overdueBadgeText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.danger,
    letterSpacing: 0.5,
  },
  breakdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  breakdownBadgeText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  project: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  priority: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    minWidth: 40,
    textAlign: 'right',
  },
  date: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    minWidth: 44,
    textAlign: 'right',
  },
});
