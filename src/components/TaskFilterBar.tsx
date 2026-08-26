import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { FilterState, FilterCategory } from '../hooks/useFilteredTasks';
import { Colors, Typography, Layout } from '../theme/tokens';

interface TaskFilterBarProps {
  filters: FilterState;
  onFilterChange: (category: FilterCategory, value: string) => void;
}

const filterOptions = {
  Status: ['All', 'To Do', 'In Progress', 'Awaiting Review', 'Done', 'Overdue'],
  Priority: ['All', 'Low', 'Medium', 'High', 'Urgent'],
  Delegation: ['All', 'Created by Me', 'Assigned to Me', 'Delegated Down']
};

export const TaskFilterBar = ({ filters, onFilterChange }: TaskFilterBarProps) => {
  return (
    <View style={styles.container}>
      {Object.entries(filterOptions).map(([category, options]) => (
        <View key={category} style={styles.categoryContainer}>
          <Text style={styles.categoryTitle}>{category}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {options.map((option) => {
              const isActive = filters[category as FilterCategory] === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.chip, isActive && styles.activeChip]}
                  onPress={() => onFilterChange(category as FilterCategory, option)}
                >
                  <Text style={[styles.chipText, isActive && styles.activeChipText]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Layout.spacing.sm,
    backgroundColor: Colors.canvas,
  },
  categoryContainer: {
    marginBottom: Layout.spacing.md,
  },
  categoryTitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: Layout.spacing.xl,
    marginBottom: Layout.spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: Layout.spacing.xl,
    gap: Layout.spacing.sm,
  },
  chip: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.sm,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginRight: Layout.spacing.sm,
  },
  activeChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  chipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.medium,
  },
  activeChipText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
  }
});
