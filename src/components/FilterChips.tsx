import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors, Layout } from '../theme/tokens';

export type FilterOption = 'All' | 'To-Do' | 'In Progress' | 'Done' | 'Overdue' | 'High/Urgent Priority';

interface FilterChipsProps {
  filters: FilterOption[];
  activeFilter: FilterOption;
  onSelect: (filter: FilterOption) => void;
}

export function FilterChips({ filters, activeFilter, onSelect }: FilterChipsProps) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {filters.map(filter => {
          const isActive = activeFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.chip, isActive && styles.activeChip]}
              onPress={() => onSelect(filter)}
            >
              <Text style={[styles.chipText, isActive && styles.activeChipText]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Layout.shadow.card.shadowColor,
    shadowOffset: Layout.shadow.card.shadowOffset,
    shadowOpacity: Layout.shadow.card.shadowOpacity,
    shadowRadius: Layout.shadow.card.shadowRadius,
    elevation: 1,
  },
  activeChip: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeChipText: {
    color: Colors.textInverse,
  },
});
