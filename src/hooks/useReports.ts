import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Period } from '../components/ui/PeriodSelector';
import { ReportService, CompleteReportData, ReportFilterOptions } from '../services/reports/ReportService';

export function useReports(
  initialPeriod: Period = 'All Time',
  initialFilters: ReportFilterOptions = {}
) {
  const { profile } = useAuth();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [filters, setFilters] = useState<ReportFilterOptions>(initialFilters);

  const [rawTasks, setRawTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReportingDataset = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch departments
      const { data: deptsData, error: deptsError } = await supabase
        .from('departments')
        .select('id, name')
        .order('name');
      if (deptsError) throw deptsError;

      // 2. Fetch users
      let usersQuery = supabase
        .from('users')
        .select('id, full_name, role, department_id, email')
        .eq('is_approved', true)
        .order('full_name');

      if (profile.role === 'Department Head' && profile.department_id) {
        usersQuery = usersQuery.eq('department_id', profile.department_id);
      } else if (profile.role === 'Manager' && profile.department_id) {
        usersQuery = usersQuery.eq('department_id', profile.department_id);
      }

      const { data: usersData, error: usersError } = await usersQuery;
      if (usersError) throw usersError;

      // 3. Fetch canonical tasks scoped by role
      let tasksQuery = supabase
        .from('tasks')
        .select(`
          *,
          departments(id, name),
          task_assignees(user_id, users:users(id, full_name, role))
        `)
        .order('created_at', { ascending: false });

      // Apply role-based database constraints
      if (profile.role === 'Department Head' && profile.department_id) {
        tasksQuery = tasksQuery.eq('department_id', profile.department_id);
      } else if (profile.role === 'Manager' && profile.department_id) {
        tasksQuery = tasksQuery.eq('department_id', profile.department_id);
      }

      const { data: tasksData, error: tasksError } = await tasksQuery;
      if (tasksError) throw tasksError;

      let filteredTasks = tasksData || [];
      if (profile.role === 'Employee' || profile.role === 'Execution Team') {
        filteredTasks = filteredTasks.filter(
          (t: any) =>
            t.created_by === profile.id ||
            t.user_id === profile.id ||
            t.task_assignees?.some((a: any) => a.user_id === profile.id)
        );
      }

      setDepartments(deptsData || []);
      setUsers(usersData || []);
      setRawTasks(filteredTasks);
    } catch (err: any) {
      console.error('Error fetching report dataset:', err);
      setError(err.message || 'Failed to load report dataset');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchReportingDataset();

    const channel = supabase
      .channel('reports_tasks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchReportingDataset();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReportingDataset]);

  // Derived canonical report metrics
  const reportData: CompleteReportData = useMemo(() => {
    return ReportService.generateReport(
      rawTasks,
      users,
      departments,
      period,
      filters
    );
  }, [rawTasks, users, departments, period, filters]);

  const updateFilter = (key: keyof ReportFilterOptions, value: string | undefined) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === 'ALL' ? undefined : value,
    }));
  };

  const resetFilters = () => {
    setFilters({});
  };

  return {
    loading,
    error,
    period,
    setPeriod,
    filters,
    updateFilter,
    resetFilters,
    reportData,
    departments,
    users,
    refetch: fetchReportingDataset,
  };
}
