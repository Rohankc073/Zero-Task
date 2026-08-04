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
          backgroundColor: '#e5e7eb',
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
  <View style={[styles.chatRow, isMine ? styles.chatRowRight : styles.chatRowLeft]}>
    <View style={[styles.chatBubble, isMine ? styles.chatBubbleRight : styles.chatBubbleLeft]}>
      <Skeleton width={isMine ? 180 : 220} height={16} className="mb-2" />
      <Skeleton width={isMine ? 120 : 160} height={16} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
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
  },
  chatRowLeft: {
    justifyContent: 'flex-start',
  },
  chatRowRight: {
    justifyContent: 'flex-end',
  },
  chatBubble: {
    padding: 16,
    borderRadius: 16,
    maxWidth: '80%',
  },
  chatBubbleLeft: {
    backgroundColor: 'white',
    borderTopLeftRadius: 4,
  },
  chatBubbleRight: {
    backgroundColor: '#0f141a',
    borderTopRightRadius: 4,
  }
});
