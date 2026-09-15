import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../../types';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { getDaysLeft } from '../../utils/dateUtils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CompactTaskRowProps {
  task: Task;
  onPress: (taskId: string) => void;
  onDelete?: (task: Task) => void;
  canDelete?: boolean;
}

export const CompactTaskRow: React.FC<CompactTaskRowProps> = ({
  task,
  onPress,
  onDelete,
  canDelete = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  const isDone = task.status === 'Done' || (task.status as any) === 'Completed';
  const isInProgress = task.status === 'In Progress';
  const isOverdue = !!(task.due_date && new Date(task.due_date) < new Date() && !isDone);

  const childCount = (task as any).child_count || task.subtasks?.length || 0;
  const hasVoiceNotes = ((task as any).voice_notes?.length > 0) || (task as any).has_voice_notes;
  const hasFiles = ((task as any).files?.length > 0) || (task as any).has_attachments;

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const getPriorityColor = () => {
    switch (task.priority?.toUpperCase()) {
      case 'URGENT':
      case 'HIGH':
        return Colors.danger;
      case 'MEDIUM':
        return Colors.warning;
      default:
        return Colors.success;
    }
  };

  const getStatusColor = () => {
    if (isDone) return Colors.success;
    if (isInProgress) return Colors.primary;
    if (isOverdue) return Colors.danger;
    return Colors.textSecondary;
  };

  const formatDueDate = () => {
    if (!task.due_date) return null;
    const diff = getDaysLeft(task.due_date);
    if (diff < 0) return 'Overdue';
    if (diff === 0) return 'Today';
    if (diff <= 3) return `${diff}d left`;
    return new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dueLabel = formatDueDate();

  // Assignee name
  const assigneeName = (task as any).assignee?.full_name ||
    (task as any).assignee?.name ||
    (task as any).assignees?.[0]?.user?.full_name ||
    (task as any).assignees?.[0]?.user?.name ||
    null;

  return (
    <View style={[styles.container, isDone && styles.containerDone, isOverdue && styles.containerOverdue]}>
      {/* ── Main Compact Row Header ── */}
      <TouchableOpacity
        style={styles.rowMain}
        onPress={() => onPress(task.id)}
        activeOpacity={0.7}
      >
        {/* Status Indicator Icon */}
        <Ionicons
          name={isDone ? 'checkmark-circle' : isInProgress ? 'play-circle' : 'ellipse-outline'}
          size={18}
          color={getStatusColor()}
          style={styles.statusIcon}
        />

        {/* Task Title & Essential Badges */}
        <View style={styles.titleColumn}>
          <Text
            style={[styles.taskTitle, isDone && styles.taskTitleDone]}
            numberOfLines={1}
          >
            {task.title}
          </Text>

          {/* Compact Sub-line: Priority, Due, Badges */}
          <View style={styles.metaRow}>
            {/* Priority dot + label */}
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor() + '18' }]}>
              <View style={[styles.priorityDot, { backgroundColor: getPriorityColor() }]} />
              <Text style={[styles.priorityText, { color: getPriorityColor() }]}>
                {task.priority || 'Normal'}
              </Text>
            </View>

            {/* Due date if present */}
            {dueLabel && (
              <View style={[styles.dueBadge, isOverdue && styles.dueBadgeOverdue]}>
                <Ionicons
                  name={isOverdue ? 'alert-circle-outline' : 'calendar-outline'}
                  size={11}
                  color={isOverdue ? Colors.danger : Colors.textMuted}
                />
                <Text style={[styles.dueText, isOverdue && styles.dueTextOverdue]}>
                  {dueLabel}
                </Text>
              </View>
            )}

            {/* Subtask count */}
            {childCount > 0 && (
              <View style={styles.iconBadge}>
                <Ionicons name="git-branch-outline" size={11} color={Colors.primary} />
                <Text style={styles.iconBadgeText}>{childCount}</Text>
              </View>
            )}

            {/* Voice note indicator */}
            {hasVoiceNotes && (
              <View style={[styles.iconBadge, { backgroundColor: Colors.infoLight }]}>
                <Ionicons name="mic" size={11} color={Colors.info} />
              </View>
            )}

            {/* Attachment indicator */}
            {hasFiles && (
              <View style={[styles.iconBadge, { backgroundColor: Colors.surfaceSubtle }]}>
                <Ionicons name="attach" size={11} color={Colors.textSecondary} />
              </View>
            )}
          </View>
        </View>

        {/* Right side: Dropdown Expand Toggle & Workspace Arrow */}
        <TouchableOpacity
          style={styles.expandToggle}
          onPress={toggleExpand}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* ── Expandable Details Dropdown ── */}
      {expanded && (
        <View style={styles.dropdownContent}>
          {task.description ? (
            <Text style={styles.descriptionText} numberOfLines={3}>
              {task.description}
            </Text>
          ) : null}

          <View style={styles.dropdownMetaGrid}>
            {assigneeName && (
              <View style={styles.dropdownMetaItem}>
                <Text style={styles.dropdownMetaLabel}>Assignee</Text>
                <Text style={styles.dropdownMetaValue} numberOfLines={1}>{assigneeName}</Text>
              </View>
            )}

            <View style={styles.dropdownMetaItem}>
              <Text style={styles.dropdownMetaLabel}>Status</Text>
              <Text style={[styles.dropdownMetaValue, { color: getStatusColor() }]}>
                {task.status} {task.progress !== undefined ? `(${task.progress}%)` : ''}
              </Text>
            </View>

            {(task as any).creator?.full_name && (
              <View style={styles.dropdownMetaItem}>
                <Text style={styles.dropdownMetaLabel}>Created by</Text>
                <Text style={styles.dropdownMetaValue} numberOfLines={1}>
                  {(task as any).creator.full_name}
                </Text>
              </View>
            )}
          </View>

          {/* Quick Action Footer */}
          <View style={styles.dropdownActions}>
            <TouchableOpacity
              style={styles.workspaceBtn}
              onPress={() => onPress(task.id)}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={14} color={Colors.textInverse} />
              <Text style={styles.workspaceBtnText}>Open Task Workspace</Text>
            </TouchableOpacity>

            {canDelete && onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => onDelete(task)}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color={Colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 8,
    overflow: 'hidden',
  },
  containerDone: {
    opacity: 0.75,
    backgroundColor: Colors.surfaceSubtle,
  },
  containerOverdue: {
    borderColor: Colors.dangerLight,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  statusIcon: {
    marginRight: 10,
  },
  titleColumn: {
    flex: 1,
    marginRight: 8,
  },
  taskTitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
    lineHeight: 18,
    marginBottom: 4,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
    gap: 4,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    textTransform: 'capitalize',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceSubtle,
  },
  dueBadgeOverdue: {
    backgroundColor: Colors.dangerLight,
  },
  dueText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  dueTextOverdue: {
    color: Colors.danger,
    fontFamily: Typography.fontFamily.bold,
  },
  iconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.primaryLight,
  },
  iconBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  expandToggle: {
    padding: 4,
  },
  dropdownContent: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSubtle,
  },
  descriptionText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: 8,
  },
  dropdownMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  dropdownMetaItem: {
    minWidth: 90,
  },
  dropdownMetaLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  dropdownMetaValue: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  dropdownActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  workspaceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Layout.radius.md,
    gap: 6,
  },
  workspaceBtnText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
  },
  deleteBtn: {
    padding: 8,
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
