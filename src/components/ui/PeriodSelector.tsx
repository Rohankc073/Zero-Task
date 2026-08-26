import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../theme/tokens';

export type Period = 
  | 'All Time'
  | 'Last 7 Days'
  | 'Last 14 Days'
  | 'Last 1 Month'
  | 'Last 3 Months'
  | 'Last 6 Months'
  | 'Last 9 Months'
  | 'Last 1 Year'
  | 'This Week'
  | 'This Month'
  | 'Last 30 Days';

const PERIODS: Period[] = [
  'All Time',
  'Last 7 Days',
  'Last 14 Days',
  'Last 1 Month',
  'Last 3 Months',
  'Last 6 Months',
  'Last 9 Months',
  'Last 1 Year',
];

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  style?: ViewStyle;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  value,
  onChange,
  style,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.button, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.label}>{value}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.menuItem, value === p && styles.menuItemActive]}
                onPress={() => { onChange(p); setOpen(false); }}
              >
                <Text style={[styles.menuItemText, value === p && styles.menuItemTextActive]}>
                  {p}
                </Text>
                {value === p && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
  },
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.spacing.xl,
  },
  menu: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    minWidth: 200,
    ...Layout.shadow.modal,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.lg,
  },
  menuItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  menuItemText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  menuItemTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
  },
});
