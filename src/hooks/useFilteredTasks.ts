import { useState, useMemo } from 'react';
import { Task } from '../types';

export type FilterCategory = 'Status' | 'Priority' | 'Delegation';

export interface FilterState {
  Status: string;
  Priority: string;
  Delegation: string;
}

export const useFilteredTasks = (rawTasks: Task[], currentUserId: string | undefined) => {
  const [filters, setFilters] = useState<FilterState>({
    Status: 'All',
    Priority: 'All',
    Delegation: 'All',
  });

  const filteredTasks = useMemo(() => {
    return rawTasks
      .map(task => {
        // Overdue calculation
        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'Done';
        return { ...task, isOverdue };
      })
      .filter(task => {
        // Status Filter
        if (filters.Status !== 'All') {
          if (filters.Status === 'Overdue') {
            if (!task.isOverdue) return false;
          } else {
            if (task.status !== filters.Status) return false;
          }
        }

        // Priority Filter
        if (filters.Priority !== 'All') {
          if (task.priority !== filters.Priority) return false;
        }

        // Delegation Filter
        if (filters.Delegation !== 'All' && currentUserId) {
          if (filters.Delegation === 'Assigned to Me' && task.user_id !== currentUserId) return false;
          if (filters.Delegation === 'Delegated Down' && task.user_id === currentUserId) return false;
        }

        return true;
      });
  }, [rawTasks, filters, currentUserId]);

  const updateFilter = (category: FilterCategory, value: string) => {
    setFilters(prev => ({ ...prev, [category]: value }));
  };

  return { filters, updateFilter, filteredTasks };
};
