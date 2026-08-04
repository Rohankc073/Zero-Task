import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  activeChip: {
    backgroundColor: '#0f141a',
    borderColor: '#0f141a',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeChipText: {
    color: '#e1c37a',
  },
});
