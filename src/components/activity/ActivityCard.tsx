import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../theme/tokens';

interface ActivityCardProps {
  item: {
    id: string;
    description: string;
    action_type: string;
    created_at: string;
    user?: {
      full_name?: string | null;
      role?: string;
      avatar_url?: string | null;
    };
  };
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onDeleteSingle: (id: string) => void;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  item,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  onDeleteSingle,
}) => {
  const renderRightActions = () => (
    <TouchableOpacity onPress={() => onDeleteSingle(item.id)} style={styles.deleteAction} activeOpacity={0.8}>
      <Ionicons color="#FFFFFF" name="trash-outline" size={20} />
      <Text style={styles.deleteActionText}>Delete</Text>
    </TouchableOpacity>
  );

  const getActionBadge = (type: string) => {
    switch (type) {
      case 'MILESTONE_UPDATE':
        return { label: 'Milestone', bg: Colors.statusProgressBg, text: Colors.statusProgressText };
      case 'USER_APPROVED':
        return { label: 'Approval', bg: Colors.statusDoneBg, text: Colors.statusDoneText };
      default:
        return { label: 'Task Event', bg: Colors.surfaceSubtle, text: Colors.textSecondary };
    }
  };

  const badge = getActionBadge(item.action_type);
  const initials = item.user?.full_name
    ? item.user.full_name.substring(0, 2).toUpperCase()
    : 'ZT';

  return (
    <Swipeable enabled={!isSelectionMode} friction={2} overshootRight={false} renderRightActions={renderRightActions}>
      <TouchableOpacity 
        style={[styles.card, isSelected && styles.cardSelected]} 
        onPress={() => isSelectionMode && onToggleSelect(item.id)}
        onLongPress={() => onToggleSelect(item.id)}
        activeOpacity={0.9}
      >
        {isSelectionMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
            {isSelected && <Ionicons color="#FFFFFF" name="checkmark" size={14} />}
          </View>
        )}

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text numberOfLines={1} style={styles.userName}>
              {item.user?.full_name || 'System User'}
            </Text>
            <Text style={styles.userRole}>({item.user?.role || 'Member'})</Text>
            <Text style={styles.timestamp}>{item.created_at}</Text>
          </View>

          <Text style={styles.description}>{item.description}</Text>

          <View style={styles.footerRow}>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.text }]}>
                {badge.label}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    padding: Layout.spacing.md,
    marginHorizontal: Layout.spacing.lg,
    marginVertical: Layout.spacing.xs,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E9E9E7',
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    marginRight: Layout.spacing.sm,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Layout.spacing.md,
  },
  avatarText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: Layout.spacing.xxs,
  },
  userName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    marginRight: Layout.spacing.xs,
  },
  userRole: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginRight: 'auto',
  },
  timestamp: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  description: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
    lineHeight: Typography.lineHeight.base,
    marginVertical: Layout.spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Layout.spacing.xxs,
  },
  badge: {
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: Layout.spacing.xxs,
    borderRadius: Layout.radius.xs,
  },
  badgeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    letterSpacing: Typography.letterSpacing.wide,
  },
  deleteAction: {
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginVertical: Layout.spacing.xs,
    marginRight: Layout.spacing.lg,
    borderRadius: Layout.radius.md,
  },
  deleteActionText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textInverse,
    marginTop: 2,
  },
});
