import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Layout } from '../../theme/tokens';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

import { AnimatedPressable } from './AnimatedPressable';

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const containerStyle = [
    styles.base,
    styles[`size_${size}`],
    styles[`variant_${variant}`],
    (disabled || loading) && styles.disabled,
    style,
  ];

  const labelStyle = [
    styles.label,
    styles[`label_${size}`],
    styles[`label_${variant}`],
    textStyle,
  ];

  return (
    <AnimatedPressable
      style={containerStyle as any}
      onPress={onPress}
      disabled={disabled || loading}
      scaleTo={0.97}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? Colors.textInverse : Colors.primary}
        />
      ) : (
        <Text style={labelStyle}>{title}</Text>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Layout.radius.md,
  },
  // Sizes
  size_sm: { height: 34, paddingHorizontal: Layout.spacing.md },
  size_md: { height: 44, paddingHorizontal: Layout.spacing.xl },
  size_lg: { height: 52, paddingHorizontal: Layout.spacing.xxl },
  // Variants
  variant_primary: {
    backgroundColor: Colors.primary,
  },
  variant_secondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  variant_ghost: {
    backgroundColor: 'transparent',
  },
  variant_danger: {
    backgroundColor: Colors.danger,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: Typography.fontFamily.semiBold,
  },
  label_sm: { fontSize: Typography.fontSize.sm },
  label_md: { fontSize: Typography.fontSize.md },
  label_lg: { fontSize: Typography.fontSize.lg },
  label_primary: { color: Colors.textInverse },
  label_secondary: { color: Colors.textPrimary },
  label_ghost: { color: Colors.primary },
  label_danger: { color: Colors.textInverse },
});
