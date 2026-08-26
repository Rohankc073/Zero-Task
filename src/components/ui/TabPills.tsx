import React from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, Typography, Layout } from '../../theme/tokens';

import { AnimatedPressable } from './AnimatedPressable';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface TabPillsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  style?: ViewStyle;
}

export const TabPills: React.FC<TabPillsProps> = ({
  tabs,
  activeKey,
  onChange,
  style,
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.container, style]}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        return (
          <AnimatedPressable
            key={tab.key}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onChange(tab.key)}
            scaleTo={0.95}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {tab.label}
              {tab.count !== undefined && ` (${tab.count})`}
            </Text>
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Layout.spacing.xs,
    paddingBottom: Layout.spacing.sm,
  },
  pill: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
  },
});
