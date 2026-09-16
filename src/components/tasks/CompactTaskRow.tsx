import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../../types';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { getDaysLeft } from '../../utils/dateUtils';
import { TaskService } from '../../services/tasks/TaskService';
import { Avatar } from '../ui/Avatar';

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
  const [subtasks, setSubtasks] = useState<Task[]>(task.subtasks || []);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);

  const isDone = task.status === 'Done' || (task.status as any) === 'Completed';
  const isInProgress = task.status === 'In Progress';
  const isOverdue = !!(task.due_date && new Date(task.due_date) < new Date() && !isDone);

  const childCount = (task as any).child_count || subtasks.length || task.subtasks?.length || 0;
  const hasVoiceNotes = ((task as any).voice_notes?.length > 0) || (task as any).has_voice_notes;
  const hasFiles = ((task as any).files?.length > 0) || (task as any).has_attachments;

  // Sync subtasks if task.subtasks changes from parent
  useEffect(() => {
    if (task.subtasks && task.subtasks.length > 0) {
      setSubtasks(task.subtasks);
    }
  }, [task.subtasks]);

  const loadSubtasks = useCallback(async () => {
    try {
      setLoadingSubtasks(true);
      const res = await TaskService.getTaskById(task.id);
      if (res.data?.subtasks) {
        setSubtasks(res.data.subtasks);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingSubtasks(false);
    }
  }, [task.id]);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const nextState = !expanded;
    setExpanded(nextState);
    if (nextState && (subtasks.length === 0 || subtasks.length < childCount)) {
      loadSubtasks();
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toUpperCase()) {
      case 'URGENT':
      case 'HIGH':
        return Colors.danger;
      case 'MEDIUM':
        return Colors.warning;
      default:
        return Colors.success;
    }
  };

  const getStatusColor = (status?: string, done?: boolean, inProg?: boolean, overdue?: boolean) => {
    if (done || status === 'Done' || (status as any) === 'Completed') return Colors.success;
    if (inProg || status === 'In Progress') return Colors.primary;
    if (overdue) return Colors.danger;
    return Colors.textSecondary;
  };

  const formatDueDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const diff = getDaysLeft(dateStr);
    if (diff < 0) return 'Overdue';
    if (diff === 0) return 'Today';
    if (diff <= 3) return `${diff}d left`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dueLabel = formatDueDate(task.due_date);

  // Collect all assignees for the task
  const assigneesList: Array<{ id: string; name: string }> = useMemo(() => {
    const list: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();

    if ((task as any).assignees && Array.isArray((task as any).assignees)) {
      (task as any).assignees.forEach((a: any) => {
        const u = a.user || a;
        const uid = u.id || a.user_id;
        const name = u.full_name || u.name || (u.email ? u.email.split('@')[0] : null);
        if (uid && name && !seen.has(uid)) {
          seen.add(uid);
          list.push({ id: uid, name });
        }
      });
    }

    if (task.assignee) {
      const u = task.assignee;
      const uid = u.id;
      const name = u.full_name || u.name || (u.email ? u.email.split('@')[0] : null);
      if (uid && name && !seen.has(uid)) {
        seen.add(uid);
        list.push({ id: uid, name });
      }
    }

    return list;
  }, [task]);

  const renderSubtaskItem = (
    sub: Task,
    indexStr: string,
    depth: number,
    isLast: boolean,
    totalCount: number
  ) => {
    const sDone = sub.status === 'Done' || (sub.status as any) === 'Completed';
    const sInProg = sub.status === 'In Progress';
    const sOverdue = !!(sub.due_date && new Date(sub.due_date) < new Date() && !sDone);
    const sDue = formatDueDate(sub.due_date);

    // Extract subtask assignees
    const sAssignees: string[] = [];
    if ((sub as any).assignees && Array.isArray((sub as any).assignees)) {
      (sub as any).assignees.forEach((a: any) => {
        const u = a.user || a;
        const name = u.full_name || u.name || (u.email ? u.email.split('@')[0] : null);
        if (name && !sAssignees.includes(name)) sAssignees.push(name);
      });
    }
    if (sAssignees.length === 0 && (sub.assignee || (sub as any).user_id)) {
      const name = sub.assignee?.full_name || sub.assignee?.name || 'Assigned';
      sAssignees.push(name);
    }

    const children: Task[] = (sub as any).subtasks || [];
    const directChildCount = (sub as any).child_count || children.length || 0;

    return (
      <View key={sub.id || `sub_${indexStr}`} style={styles.subtaskTreeBlock}>
        <View style={styles.subtaskTreeRow}>
          {/* Tree Branch Visual Connector */}
          <View style={styles.treeGuideColumn}>
            <View
              style={[
                styles.treeVerticalLine,
                isLast && totalCount > 1 && { height: '50%' },
                totalCount === 1 && { height: '50%' },
              ]}
            />
            <View style={styles.treeBranchLine} />
          </View>

          {/* Subtask Interactive Card */}
          <TouchableOpacity
            style={[
              styles.subtaskItemCard,
              depth > 0 && styles.childSubtaskItemCard,
              sDone && styles.subtaskItemCardDone,
            ]}
            onPress={() => onPress(sub.id)}
            activeOpacity={0.7}
          >
            {/* Subtask Number/Letter Indicator */}
            <View
              style={[
                styles.subtaskBadgeIndex,
                depth > 0 && styles.childSubtaskBadgeIndex,
                sDone && styles.subtaskBadgeIndexDone,
              ]}
            >
              <Text
                style={[
                  styles.subtaskBadgeIndexText,
                  depth > 0 && styles.childSubtaskBadgeIndexText,
                  sDone && styles.subtaskBadgeIndexTextDone,
                ]}
              >
                {indexStr}
              </Text>
            </View>

            {/* Subtask Content Column */}
            <View style={styles.subtaskContentCol}>
              <Text
                style={[styles.subtaskItemTitle, sDone && styles.subtaskItemTitleDone]}
                numberOfLines={1}
              >
                {sub.title}
              </Text>

              <View style={styles.subtaskMetaRow}>
                {/* Status chip */}
                <View
                  style={[
                    styles.subtaskStatusChip,
                    { backgroundColor: getStatusColor(sub.status, sDone, sInProg, sOverdue) + '18' },
                  ]}
                >
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: getStatusColor(sub.status, sDone, sInProg, sOverdue) },
                    ]}
                  />
                  <Text
                    style={[
                      styles.subtaskStatusChipText,
                      { color: getStatusColor(sub.status, sDone, sInProg, sOverdue) },
                    ]}
                  >
                    {sub.status || 'To Do'}
                  </Text>
                </View>

                {/* Priority */}
                <View
                  style={[
                    styles.subtaskPriorityChip,
                    { backgroundColor: getPriorityColor(sub.priority) + '14' },
                  ]}
                >
                  <Text
                    style={[
                      styles.subtaskPriorityChipText,
                      { color: getPriorityColor(sub.priority) },
                    ]}
                  >
                    {sub.priority || 'Medium'}
                  </Text>
                </View>

                {/* Due date if any */}
                {sDue && (
                  <View style={[styles.dueBadge, sOverdue && styles.dueBadgeOverdue]}>
                    <Text style={[styles.dueText, sOverdue && styles.dueTextOverdue]}>
                      {sDue}
                    </Text>
                  </View>
                )}

                {/* Assignees */}
                {sAssignees.length > 0 && (
                  <View style={styles.subtaskAssigneesChip}>
                    <Ionicons name="person-outline" size={10} color={Colors.textSecondary} />
                    <Text style={styles.subtaskAssigneesText} numberOfLines={1}>
                      {sAssignees.join(', ')}
                    </Text>
                  </View>
                )}

                {/* Nested subtask count badge if any */}
                {directChildCount > 0 && (
                  <View style={styles.subtaskHasChildrenChip}>
                    <Ionicons name="git-branch-outline" size={10} color={Colors.primary} />
                    <Text style={styles.subtaskHasChildrenText}>
                      {directChildCount} {directChildCount === 1 ? 'subtask' : 'subtasks'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Drill down forward arrow */}
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Nested Child Subtasks (e.g. Phase 1 of 2 under Phase 2) ── */}
        {children.length > 0 && (
          <View style={styles.nestedSubtasksContainer}>
            {children.map((childSub, cIdx) =>
              renderSubtaskItem(
                childSub,
                `${indexStr}.${cIdx + 1}`,
                depth + 1,
                cIdx === children.length - 1,
                children.length
              )
            )}
          </View>
        )}
      </View>
    );
  };

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
          color={getStatusColor(task.status, isDone, isInProgress, isOverdue)}
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
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) + '18' }]}>
              <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
              <Text style={[styles.priorityText, { color: getPriorityColor(task.priority) }]}>
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

            {/* Subtask count clickable toggle */}
            {childCount > 0 && (
              <TouchableOpacity
                style={[styles.iconBadge, expanded && { backgroundColor: Colors.primary }]}
                onPress={toggleExpand}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="git-branch-outline"
                  size={11}
                  color={expanded ? Colors.textInverse : Colors.primary}
                />
                <Text style={[styles.iconBadgeText, expanded && { color: Colors.textInverse }]}>
                  {childCount}
                </Text>
              </TouchableOpacity>
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

        {/* Right side: Dropdown Expand Toggle Chevron */}
        <TouchableOpacity
          style={styles.expandToggle}
          onPress={toggleExpand}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          accessibilityLabel={expanded ? 'Collapse Subtasks' : 'View Subtasks'}
        >
          <View style={[styles.chevronCircle, expanded && styles.chevronCircleActive]}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={expanded ? Colors.primary : Colors.textSecondary}
            />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* ── Expandable Details & Subtasks Dropdown ── */}
      {expanded && (
        <View style={styles.dropdownContent}>
          {/* Subtasks Section Inside Main Task Dropdown */}
          <View style={styles.subtasksSection}>
            <View style={styles.subtasksSectionHeader}>
              <View style={styles.subtasksHeaderTitleRow}>
                <Ionicons name="git-network-outline" size={14} color={Colors.primary} />
                <Text style={styles.subtasksHeaderTitle}>
                  Subtasks {subtasks.length > 0 ? `(${subtasks.length})` : childCount > 0 ? `(${childCount})` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onPress(task.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text style={styles.addSubtaskLink}>+ Add Subtask</Text>
              </TouchableOpacity>
            </View>

            {loadingSubtasks && subtasks.length === 0 ? (
              <View style={styles.subtasksLoadingBox}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.subtasksLoadingText}>Loading subtasks...</Text>
              </View>
            ) : subtasks.length > 0 ? (
              <View style={styles.subtasksTreeList}>
                {subtasks.map((sub, sIdx) =>
                  renderSubtaskItem(
                    sub,
                    `${sIdx + 1}`,
                    0,
                    sIdx === subtasks.length - 1,
                    subtasks.length
                  )
                )}
              </View>
            ) : (
              <View style={styles.subtasksEmptyCard}>
                <Ionicons name="git-commit-outline" size={18} color={Colors.textMuted} />
                <Text style={styles.subtasksEmptyText}>No subtasks created yet</Text>
                <TouchableOpacity
                  style={styles.subtaskCreateQuickBtn}
                  onPress={() => onPress(task.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={14} color={Colors.primary} />
                  <Text style={styles.subtaskCreateQuickText}>Add First Subtask</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Task Description */}
          {task.description ? (
            <View style={styles.dropdownDescBox}>
              <Text style={styles.descriptionLabel}>Description</Text>
              <Text style={styles.descriptionText} numberOfLines={3}>
                {task.description}
              </Text>
            </View>
          ) : null}

          {/* Allotted Assignees & Meta Grid */}
          <View style={styles.dropdownMetaGrid}>
            <View style={styles.dropdownMetaItem}>
              <Text style={styles.dropdownMetaLabel}>Status</Text>
              <Text style={[styles.dropdownMetaValue, { color: getStatusColor(task.status, isDone, isInProgress, isOverdue) }]}>
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

          {/* Assignees Section */}
          {assigneesList.length > 0 && (
            <View style={styles.assigneesBox}>
              <Text style={styles.dropdownMetaLabel}>
                Assigned To ({assigneesList.length})
              </Text>
              <View style={styles.assigneesPillRow}>
                {assigneesList.map((a) => (
                  <View key={a.id} style={styles.assigneePill}>
                    <Avatar name={a.name} size={18} />
                    <Text style={styles.assigneePillName} numberOfLines={1}>{a.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

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
                accessibilityLabel="Delete Task"
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
    padding: 2,
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronCircleActive: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownContent: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: '#FAFBFD',
  },
  subtasksSection: {
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: 10,
  },
  subtasksSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  subtasksHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtasksHeaderTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addSubtaskLink: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  subtasksLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  subtasksLoadingText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  subtasksTreeList: {
    gap: 8,
  },
  subtaskTreeBlock: {
    width: '100%',
  },
  subtaskTreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nestedSubtasksContainer: {
    marginLeft: 20,
    marginTop: 6,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#CBD5E1',
    gap: 6,
  },
  childSubtaskItemCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  childSubtaskBadgeIndex: {
    backgroundColor: '#EEF2FF',
    width: 28,
    height: 20,
    borderRadius: 10,
  },
  childSubtaskBadgeIndexText: {
    color: '#4F46E5',
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
  },
  subtaskHasChildrenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
  },
  subtaskHasChildrenText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  treeGuideColumn: {
    width: 22,
    alignSelf: 'stretch',
    position: 'relative',
    justifyContent: 'center',
  },
  treeVerticalLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 9,
    width: 2,
    backgroundColor: '#CBD5E1',
  },
  treeBranchLine: {
    position: 'absolute',
    top: '50%',
    left: 9,
    width: 13,
    height: 2,
    marginTop: -1,
    backgroundColor: '#CBD5E1',
  },
  subtaskItemCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    minHeight: 46,
  },
  subtaskItemCardDone: {
    backgroundColor: '#F8FAFC',
    opacity: 0.75,
  },
  subtaskBadgeIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskBadgeIndexDone: {
    backgroundColor: Colors.surfaceSubtle,
  },
  subtaskBadgeIndexText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  subtaskBadgeIndexTextDone: {
    color: Colors.textMuted,
  },
  subtaskContentCol: {
    flex: 1,
  },
  subtaskItemTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtaskItemTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  subtaskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  subtaskStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
  },
  subtaskStatusChipText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
  },
  subtaskPriorityChip: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
  },
  subtaskPriorityChipText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.semiBold,
  },
  subtaskAssigneesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
    maxWidth: 130,
  },
  subtaskAssigneesText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  subtasksEmptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 4,
  },
  subtasksEmptyText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  subtaskCreateQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Layout.radius.sm,
    backgroundColor: Colors.primaryLight,
  },
  subtaskCreateQuickText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  dropdownDescBox: {
    marginBottom: 8,
  },
  descriptionLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  descriptionText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  assigneesBox: {
    marginBottom: 10,
  },
  assigneesPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  assigneePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  assigneePillName: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
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
