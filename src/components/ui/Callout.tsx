import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

interface CalloutProps {
  icon?: keyof typeof Ionicons.glyphMap | string;
  emoji?: string;
  text: string;
  style?: ViewStyle;
}

export const Callout: React.FC<CalloutProps> = ({ icon, emoji, text, style }) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        {emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : icon ? (
          <Ionicons name={icon as any} size={20} color={Colors.textPrimary} />
        ) : (
          <Ionicons name="information-circle-outline" size={20} color={Colors.textPrimary} />
        )}
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.sm,
    padding: Layout.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: Layout.spacing.sm,
  },
  iconContainer: {
    marginRight: Layout.spacing.sm,
    marginTop: 2,
  },
  emoji: {
    fontSize: 18,
  },
  text: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: Typography.lineHeight.base,
  },
});
