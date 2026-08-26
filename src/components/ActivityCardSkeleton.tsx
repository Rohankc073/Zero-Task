import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { Colors, Layout } from '../theme/tokens';

export const ActivityCardSkeleton = () => {
  return (
    <View style={styles.card}>
      <View style={styles.contentRow}>
        {/* Avatar Skeleton */}
        <MotiView
          transition={{ type: 'timing', duration: 800, loop: true }}
          from={{ opacity: 0.3 }}
          animate={{ opacity: 0.7 }}
          style={styles.avatarSkeleton}
        />

        <View style={styles.mainContent}>
          {/* Header Row: Name/Role & Time */}
          <View style={styles.headerRow}>
            <MotiView
              transition={{ type: 'timing', duration: 800, loop: true }}
              from={{ opacity: 0.3 }}
              animate={{ opacity: 0.7 }}
              style={styles.nameSkeleton}
            />
            <MotiView
              transition={{ type: 'timing', duration: 800, loop: true }}
              from={{ opacity: 0.3 }}
              animate={{ opacity: 0.7 }}
              style={styles.timeSkeleton}
            />
          </View>

          {/* Description Lines */}
          <MotiView
            transition={{ type: 'timing', duration: 800, loop: true }}
            from={{ opacity: 0.3 }}
            animate={{ opacity: 0.7 }}
            style={styles.descLine1}
          />
          <MotiView
            transition={{ type: 'timing', duration: 800, loop: true }}
            from={{ opacity: 0.3 }}
            animate={{ opacity: 0.7 }}
            style={styles.descLine2}
          />

          {/* Action Badge */}
          <View style={styles.footerRow}>
            <MotiView
              transition={{ type: 'timing', duration: 800, loop: true }}
              from={{ opacity: 0.3 }}
              animate={{ opacity: 0.7 }}
              style={styles.badgeSkeleton}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

export const ActivityFeedSkeletons = ({ count = 5 }: { count?: number }) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <ActivityCardSkeleton key={`skeleton-${index}`} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    padding: Layout.spacing.lg,
    marginBottom: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Layout.shadow.card,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarSkeleton: {
    width: 44,
    height: 44,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceMuted,
    marginRight: Layout.spacing.md,
  },
  mainContent: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Layout.spacing.sm,
  },
  nameSkeleton: {
    width: 140,
    height: 16,
    borderRadius: Layout.radius.xs,
    backgroundColor: Colors.surfaceMuted,
  },
  timeSkeleton: {
    width: 60,
    height: 12,
    borderRadius: Layout.radius.xs,
    backgroundColor: Colors.surfaceMuted,
  },
  descLine1: {
    width: '92%',
    height: 14,
    borderRadius: Layout.radius.xs,
    backgroundColor: Colors.surfaceMuted,
    marginBottom: 6,
  },
  descLine2: {
    width: '65%',
    height: 14,
    borderRadius: Layout.radius.xs,
    backgroundColor: Colors.surfaceMuted,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeSkeleton: {
    width: 110,
    height: 22,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceMuted,
  },
});
