import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { FilterState, FilterCategory } from '../hooks/useFilteredTasks';

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
    paddingVertical: 10,
    backgroundColor: '#f7f6f2',
  },
  categoryContainer: {
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 20,
    marginBottom: 6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  activeChip: {
    backgroundColor: '#e1c37a',
    borderColor: '#e1c37a',
  },
  chipText: {
    fontSize: 14,
    color: '#0f141a',
    fontWeight: '500',
  },
  activeChipText: {
    fontWeight: 'bold',
  }
});
