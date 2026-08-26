import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Layout } from '../../theme/tokens';

type BadgeVariant = 'priority' | 'status';
type Priority = 'Low' | 'Medium' | 'High' | 'Urgent' | string;
type Status = 'To Do' | 'In Progress' | 'Done' | 'Blocked' | string;

interface BadgeProps {
  label: string;
  priority?: Priority;
  status?: Status;
  style?: ViewStyle;
}

function getPriorityColors(priority: string) {
  switch (priority?.toUpperCase()) {
    case 'URGENT':
      return { bg: Colors.priorityUrgentBg, text: Colors.priorityUrgentText, border: Colors.priorityUrgentBorder };
    case 'HIGH':
      return { bg: Colors.priorityHighBg, text: Colors.priorityHighText, border: Colors.priorityHighBorder };
    case 'MEDIUM':
      return { bg: Colors.priorityMedBg, text: Colors.priorityMedText, border: Colors.priorityMedBorder };
    default: // Low
      return { bg: Colors.priorityLowBg, text: Colors.priorityLowText, border: Colors.priorityLowBorder };
  }
}

function getStatusColors(status: string) {
  switch (status) {
    case 'In Progress':
      return { bg: Colors.statusProgressBg, text: Colors.statusProgressText };
    case 'Done':
      return { bg: Colors.statusDoneBg, text: Colors.statusDoneText };
    case 'Blocked':
      return { bg: Colors.statusBlockedBg, text: Colors.statusBlockedText };
    default: // To Do
      return { bg: Colors.statusTodoBg, text: Colors.statusTodoText };
  }
}

export const PriorityBadge: React.FC<{ priority: Priority; style?: ViewStyle }> = ({ priority, style }) => {
  const colors = getPriorityColors(priority);
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1 }, style]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{priority}</Text>
    </View>
  );
};

export const StatusBadge: React.FC<{ status: Status; style?: ViewStyle }> = ({ status, style }) => {
  const colors = getStatusColors(status);
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{status}</Text>
    </View>
  );
};

// Generic badge with custom colors
export const Badge: React.FC<BadgeProps> = ({ label, priority, status, style }) => {
  if (priority) {
    return <PriorityBadge priority={priority} style={style} />;
  }
  if (status) {
    return <StatusBadge status={status} style={style} />;
  }
  return (
    <View style={[styles.badge, { backgroundColor: Colors.surfaceSecondary }, style]}>
      <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: 3,
    borderRadius: Layout.radius.sm,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
  },
});
