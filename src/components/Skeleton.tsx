import React from 'react';
import { View, StyleSheet, DimensionValue } from 'react-native';
import { MotiView } from 'moti';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  className?: string;
}

export const Skeleton = ({ width = '100%', height = 20, radius = 8, className }: SkeletonProps) => {
  return (
    <MotiView
      transition={{
        type: 'timing',
        duration: 1000,
        loop: true,
      }}
      from={{ opacity: 0.3 }}
      animate={{ opacity: 0.7 }}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: '#C3B7A5',
        },
      ]}
      className={className}
    />
  );
};

export const TaskSkeleton = () => (
  <View style={styles.card}>
    <View style={styles.header}>
      <Skeleton width="60%" height={24} />
      <Skeleton width={60} height={20} radius={12} />
    </View>
    <View style={styles.spacer} />
    <Skeleton width="100%" height={8} radius={4} />
    <View style={styles.spacer} />
    <View style={styles.footer}>
      <Skeleton width={80} height={16} />
      <Skeleton width={40} height={16} />
      <Skeleton width={32} height={32} radius={16} />
    </View>
  </View>
);

export const ChatMessageSkeleton = ({ isMine = false }: { isMine?: boolean }) => (
  <View style={styles.chatRow}>
    <Skeleton width={40} height={40} radius={8} className="mr-3" />
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <Skeleton width={100} height={16} className="mr-2" />
        <Skeleton width={60} height={12} />
      </View>
      <Skeleton width="80%" height={16} className="mb-2" />
      <Skeleton width="60%" height={16} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F0E8DA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C3B7A5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spacer: {
    height: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatRow: {
    flexDirection: 'row',
    marginBottom: 16,
    width: '100%',
    paddingHorizontal: 16,
  }
});
