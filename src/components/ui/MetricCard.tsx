import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../theme/tokens';

import { AnimatedPressable } from './AnimatedPressable';

interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  value: number | string;
  label: string;
  trend?: number;       // e.g. 12 means +12%, -5 means -5%
  style?: ViewStyle;
  onPress?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  iconColor,
  iconBg,
  value,
  label,
  trend,
  style,
  onPress,
}) => {
  const trendUp = trend !== undefined && trend >= 0;
  const trendColor = trendUp ? Colors.success : Colors.danger;
  const trendIcon = trendUp ? 'arrow-up' : 'arrow-down';

  const content = (
    <View style={[styles.card, style]}>
      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>

      {/* Number */}
      <Text style={styles.value}>{value}</Text>

      {/* Label */}
      <Text style={styles.label}>{label}</Text>

      {/* Trend */}
      {trend !== undefined && (
        <View style={styles.trendRow}>
          <Ionicons name={trendIcon as any} size={10} color={trendColor} />
          <Text style={[styles.trendText, { color: trendColor }]}>
            {Math.abs(trend)}%
          </Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} scaleTo={0.96}>
        {content}
      </AnimatedPressable>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Layout.spacing.md,
    alignItems: 'center',
    minWidth: 88,
    ...Layout.shadow.card,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Layout.spacing.xs,
  },
  value: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 22,
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  trendText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 10,
  },
});
