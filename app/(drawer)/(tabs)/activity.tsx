import React, { useState, useCallback, useRef } from 'react';

import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useActivityFeed } from '../../../src/hooks/useActivityFeed';
import { ActivityCard } from '../../../src/components/activity/ActivityCard';
import { ActivityFeedSkeletons } from '../../../src/components/ActivityCardSkeleton';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { AuditLog } from '../../../src/types';
import { 
  Activity, 
  Eye, 
  Trash2, 
  CheckSquare, 
  Square, 
  X,
  CheckCheck
} from 'lucide-react-native';

export default function ActivityFeedScreen() {
  const { 
    activities, 
    loading, 
    refreshing, 
    handleRefresh, 
    deleteActivity, 
    deleteBatchActivities 
  } = useActivityFeed();

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Store references to swipeables to close them on action
  const swipeableRefs = useRef<{ [key: string]: Swipeable | null }>({});

  // Single Activity Deletion Confirmation
  const handleDeleteSingle = (id: string) => {
    swipeableRefs.current[id]?.close();

    Alert.alert(
      'Delete Activity Log?',
      'This entry will be permanently removed from the audit record.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteActivity(id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ]
    );
  };

  // Render Right Swipe Drawer
  const renderRightDeleteAction = (id: string) => {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.deleteRightAction}
        onPress={() => handleDeleteSingle(id)}
      >
        <Trash2 size={20} color={Colors.textInverse} />
        <Text style={styles.deleteRightActionText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  // Toggle Multi-Select Mode
  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      setIsSelectionMode(true);
    }
  };

  // Toggle selection for a single item
  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Long Press to trigger selection mode on item
  const handleLongPressCard = (id: string) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // Toggle Select All / Deselect All
  const handleSelectAllToggle = () => {
    if (selectedIds.size === activities.length && activities.length > 0) {
      setSelectedIds(new Set());
    } else {
      const allIds = activities.map((a) => a.id);
      setSelectedIds(new Set(allIds));
    }
  };

  // Batch Delete Execution
  const handleDeleteBatch = () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    Alert.alert(
      'Delete Selected Logs?',
      `Are you sure you want to delete ${count} selected activity log(s)?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const idsToDelete = Array.from(selectedIds);
            await deleteBatchActivities(idsToDelete);
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const renderActivityCard = useCallback(
    ({ item }: { item: AuditLog }) => {
      const isSelected = selectedIds.has(item.id);

      return (
        <ActivityCard
          item={item}
          isSelectionMode={isSelectionMode}
          isSelected={isSelected}
          onToggleSelect={() => toggleSelectId(item.id)}
          onDeleteSingle={() => handleDeleteSingle(item.id)}
        />
      );
    },
    [isSelectionMode, selectedIds]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ZeroTaskHeader />
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerBadge}>
            <Eye size={14} color={Colors.primary} />
            <Text style={styles.headerBadgeText}>FOUNDER FEED</Text>
          </View>

          <View style={styles.headerButtonsRow}>
            {/* Multi-Select Toggle Button */}
            <TouchableOpacity
              style={[
                styles.selectToggleHeaderBtn,
                isSelectionMode && styles.selectToggleHeaderBtnActive,
              ]}
              onPress={toggleSelectionMode}
              activeOpacity={0.7}
            >
              {isSelectionMode ? (
                <CheckSquare size={14} color={Colors.primary} />
              ) : (
                <Square size={14} color={Colors.textSecondary} />
              )}
              <Text
                style={[
                  styles.selectToggleHeaderBtnText,
                  isSelectionMode && styles.selectToggleHeaderBtnTextActive,
                ]}
              >
                {isSelectionMode ? 'Done' : 'Select'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.mainTitle}>Activity</Text>
        <Text style={styles.subTitle}>
          Real-time organizational operations
        </Text>
      </View>

      {/* Main Content Area */}
      {loading ? (
        // 5 Shimmering Moti Skeleton Cards on Mount
        <ActivityFeedSkeletons count={5} />
      ) : (
        <View style={styles.listContainer}>
          <FlashList
            data={activities}
            keyExtractor={(item) => item.id}
            renderItem={renderActivityCard}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            contentContainerStyle={[
              styles.listContent,
              isSelectionMode && { paddingBottom: 110 }
            ]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Activity size={24} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>Feed Empty</Text>
                <Text style={styles.emptySubtitle}>
                  No activities recorded yet.
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* Floating / Sticky Bulk Action Bar */}
      {isSelectionMode && (
        <View style={styles.bulkActionBar}>
          <View style={styles.bulkInfoContainer}>
            <Text style={styles.bulkCountText}>
              {selectedIds.size} Selected
            </Text>
          </View>

          <View style={styles.bulkButtonsRow}>
            {/* Select All / Deselect All */}
            <TouchableOpacity
              style={styles.bulkButtonSecondary}
              onPress={handleSelectAllToggle}
              activeOpacity={0.7}
            >
              <CheckCheck size={16} color={Colors.textSecondary} />
              <Text style={styles.bulkButtonSecondaryText}>
                {selectedIds.size === activities.length && activities.length > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </Text>
            </TouchableOpacity>

            {/* Cancel Selection */}
            <TouchableOpacity
              style={styles.bulkButtonSecondary}
              onPress={toggleSelectionMode}
              activeOpacity={0.7}
            >
              <X size={16} color={Colors.textSecondary} />
              <Text style={styles.bulkButtonSecondaryText}>Cancel</Text>
            </TouchableOpacity>

            {/* Bulk Delete */}
            <TouchableOpacity
              style={[
                styles.bulkDeleteButton,
                selectedIds.size === 0 && styles.bulkDeleteButtonDisabled,
              ]}
              onPress={handleDeleteBatch}
              disabled={selectedIds.size === 0}
              activeOpacity={0.8}
            >
              <Trash2 size={16} color={Colors.textInverse} />
              <Text style={styles.bulkDeleteButtonText}>
                Delete ({selectedIds.size})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  header: {
    paddingHorizontal: Layout.spacing.xl,
    paddingTop: Layout.spacing.md,
    paddingBottom: Layout.spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Layout.spacing.sm,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: Layout.spacing.xxs,
    borderRadius: Layout.radius.full,
    gap: 4,
  },
  headerBadgeText: {
    color: Colors.primary,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: Typography.letterSpacing.wide,
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.xs,
  },
  selectToggleHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: Layout.spacing.xxs,
    borderRadius: Layout.radius.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
  },
  selectToggleHeaderBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  selectToggleHeaderBtnText: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.semiBold,
  },
  selectToggleHeaderBtnTextActive: {
    color: Colors.primary,
  },
  mainTitle: {
    fontSize: Typography.fontSize.xxl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    letterSpacing: Typography.letterSpacing.tight,
  },
  subTitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    fontFamily: Typography.fontFamily.regular,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingVertical: Layout.spacing.md,
  },
  deleteRightAction: {
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: Layout.radius.md,
    marginBottom: Layout.spacing.xs,
    marginLeft: Layout.spacing.xs,
    gap: 4,
  },
  deleteRightActionText: {
    color: Colors.textInverse,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.semiBold,
  },
  bulkActionBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    ...Layout.shadow.modal,
    flexDirection: 'column',
    gap: Layout.spacing.sm,
  },
  bulkInfoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bulkCountText: {
    color: Colors.primary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
  },
  bulkButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Layout.spacing.sm,
  },
  bulkButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: Layout.spacing.xs,
    borderRadius: Layout.radius.sm,
    gap: 4,
  },
  bulkButtonSecondaryText: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
  },
  bulkDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.danger,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    borderRadius: Layout.radius.sm,
    gap: 4,
  },
  bulkDeleteButtonDisabled: {
    opacity: 0.5,
  },
  bulkDeleteButtonText: {
    color: Colors.textInverse,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.semiBold,
  },
  emptyContainer: {
    padding: Layout.spacing.section,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Layout.spacing.section,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Layout.spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.xs,
  },
  emptySubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
