import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/permissions';

export interface TaskCardProps {
  task: any;
  onPress: () => void;
  showCompany?: boolean;
}

function priorityColor(priority?: string): string {
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

function statusColor(status?: string): { bg: string; text: string; icon?: keyof typeof Ionicons.glyphMap } {
  switch (status?.toUpperCase()) {
    case 'DONE':
    case 'COMPLETED':
      return { bg: Colors.successLight, text: Colors.success, icon: 'checkmark-circle' };
    case 'IN PROGRESS':
      return { bg: Colors.infoLight, text: Colors.info, icon: 'time-outline' };
    default:
      return { bg: Colors.surfaceSecondary, text: Colors.textSecondary, icon: 'radio-button-off-outline' };
  }
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onPress,
  showCompany,
}) => {
  const { profile } = useAuth();
  const superAdmin = isSuperAdmin(profile);
  const now = new Date();

  const isDone = task.status === 'Done' || task.status === 'Completed' || task.status === 'DONE';
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = !!(dueDate && dueDate < now && !isDone);
  const daysOverdue = dueDate && isOverdue
    ? Math.max(1, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const sColor = statusColor(task.status);
  const pColor = priorityColor(task.priority);

  const deptName = task.departments?.name || task.department?.name || 'General';
  const compName = task.companies?.name || task.company?.name || null;

  const progressPct = task.progress !== null && task.progress !== undefined && !isNaN(Number(task.progress))
    ? Number(task.progress)
    : (isDone ? 100 : (task.status === 'In Progress' ? 50 : 0));

  // Extract assignees from task_assignees or single assignee
  let assignees: any[] = [];
  if (Array.isArray(task.task_assignees) && task.task_assignees.length > 0) {
    assignees = task.task_assignees;
  } else if (task.assignee) {
    assignees = [{ users: task.assignee }];
  }

  const subtasksCount = task.subtasks?.length || 0;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isOverdue && styles.cardOverdue,
        isDone && styles.cardDone,
      ]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      {/* ── Top Metadata Row ───────────────────────────────── */}
      <View style={styles.topRow}>
        <View style={styles.badgesLeft}>
          {(superAdmin || showCompany) && compName ? (
            <View style={styles.companyBadge}>
              <Ionicons name="business-outline" size={11} color={Colors.primary} />
              <Text style={styles.companyBadgeText} numberOfLines={1}>
                {compName}
              </Text>
            </View>
          ) : null}

          <View style={styles.deptBadge}>
            <Text style={styles.deptBadgeText}>{deptName}</Text>
          </View>
        </View>

        <View style={styles.tagsRight}>
          {/* Priority Badge */}
          <View style={[styles.priorityBadge, { borderColor: pColor }]}>
            <Text style={[styles.priorityBadgeText, { color: pColor }]}>
              {task.priority || 'Medium'}
            </Text>
          </View>

          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: sColor.bg }]}>
            {sColor.icon && (
              <Ionicons name={sColor.icon} size={11} color={sColor.text} style={{ marginRight: 3 }} />
            )}
            <Text style={[styles.statusBadgeText, { color: sColor.text }]}>
              {task.status || 'To Do'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Task Title & Description ───────────────────────── */}
      <Text
        style={[styles.title, isDone && styles.titleDone]}
        numberOfLines={2}
      >
        {task.title}
      </Text>

      {task.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}

      {/* ── Overdue Banner ─────────────────────────────────── */}
      {isOverdue && (
        <View style={styles.overdueBanner}>
          <Ionicons name="alert-circle" size={13} color={Colors.danger} />
          <Text style={styles.overdueText}>
            {daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`}
            {dueDate ? ` · Due ${dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}` : ''}
          </Text>
        </View>
      )}

      {/* ── Progress Bar ───────────────────────────────────── */}
      <View style={styles.progressRow}>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(100, Math.max(0, progressPct))}%`,
                backgroundColor: isDone ? Colors.success : (isOverdue ? Colors.danger : Colors.primary),
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>{progressPct}%</Text>
      </View>

      {/* ── Footer Row: Assignees, Subtasks & Deadline ─────── */}
      <View style={styles.footerRow}>
        {/* Assignees */}
        <View style={styles.assigneesContainer}>
          {assignees.length > 0 ? (
            <>
              <View style={styles.avatarCluster}>
                {assignees.slice(0, 3).map((a: any, i: number) => (
                  <Avatar
                    key={a.user_id || a.users?.id || i}
                    name={a.users?.full_name || a.users?.name || 'User'}
                    size={22}
                    style={{
                      ...styles.avatarOverlap,
                      zIndex: 10 - i,
                      marginLeft: i > 0 ? -6 : 0,
                    }}
                  />
                ))}
              </View>
              <Text style={styles.assigneeNameText} numberOfLines={1}>
                {assignees
                  .map((a: any) => a.users?.full_name?.split(' ')[0] || a.users?.name?.split(' ')[0] || 'User')
                  .join(', ')}
              </Text>
            </>
          ) : (
            <View style={styles.unassignedRow}>
              <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.unassignedText}>Unassigned</Text>
            </View>
          )}
        </View>

        {/* Right side: Subtasks and Deadline */}
        <View style={styles.footerRight}>
          {subtasksCount > 0 && (
            <View style={styles.subtasksBadge}>
              <Ionicons name="git-branch-outline" size={11} color={Colors.primary} />
              <Text style={styles.subtasksText}>{subtasksCount}</Text>
            </View>
          )}

          {dueDate && !isOverdue && (
            <View style={styles.deadlineBadge}>
              <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.deadlineText}>
                {dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Layout.spacing.md,
    marginHorizontal: Layout.spacing.lg,
    marginBottom: Layout.spacing.md,
    ...Layout.shadow.card,
    gap: 8,
  },
  cardOverdue: {
    backgroundColor: '#FFFBFB',
    borderColor: '#FED7D7',
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
  },
  cardDone: {
    backgroundColor: '#F8FAFC',
    borderColor: Colors.borderSubtle,
    opacity: 0.88,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  companyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: Layout.radius.sm,
    maxWidth: 130,
  },
  companyBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
    color: Colors.primary,
  },
  deptBadge: {
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: Layout.radius.sm,
  },
  deptBadgeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  tagsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  priorityBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 11,
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 21,
    marginTop: 2,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  description: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  overdueText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 11,
    color: Colors.danger,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 10.5,
    color: Colors.textMuted,
    minWidth: 26,
    textAlign: 'right',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    marginTop: 2,
  },
  assigneesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  avatarCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOverlap: {
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  assigneeNameText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  unassignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unassignedText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 11.5,
    color: Colors.textMuted,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtasksBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  subtasksText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
    color: Colors.primary,
  },
  deadlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deadlineText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.textMuted,
  },
});
