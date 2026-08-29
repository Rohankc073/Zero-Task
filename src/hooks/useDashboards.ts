import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Period } from '../components/ui/PeriodSelector';

export interface TaskMetrics {
  assigned: number;
  inProgress: number;
  completed: number;
  overdue: number;
  progressPercent: number;
  assignedTrend?: number;
  inProgressTrend?: number;
  completedTrend?: number;
  overdueTrend?: number;
}

/**
 * Calculates start and prior comparison periods for dynamic trend calculations.
 */
export function getPeriodDateRanges(period: Period | string): {
  start: Date | null;
  end: Date | null;
  prevStart: Date | null;
  prevEnd: Date | null;
} {
  if (!period || period === 'All Time') {
    return { start: null, end: null, prevStart: null, prevEnd: null };
  }

  // Handle custom date range string format: "Custom: 2026-08-01 to 2026-08-28"
  if (typeof period === 'string' && period.startsWith('Custom:')) {
    const rangeStr = period.replace('Custom:', '').trim();
    const parts = rangeStr.split(' to ');
    if (parts.length === 2 && parts[0] && parts[1]) {
      const start = new Date(parts[0].trim() + 'T00:00:00');
      const end = new Date(parts[1].trim() + 'T23:59:59.999');
      const diffMs = end.getTime() - start.getTime();
      const prevStart = new Date(start.getTime() - diffMs);
      const prevEnd = new Date(start.getTime() - 1);
      return { start, end, prevStart, prevEnd };
    }
  }

  const now = new Date();
  let ms = 0;
  switch (period) {
    case 'Last 7 Days':
    case 'This Week':
      ms = 7 * 24 * 60 * 60 * 1000;
      break;
    case 'Last 14 Days':
      ms = 14 * 24 * 60 * 60 * 1000;
      break;
    case 'Last 1 Month':
    case 'Last 30 Days':
    case 'This Month':
      ms = 30 * 24 * 60 * 60 * 1000;
      break;
    case 'Last 3 Months':
      ms = 90 * 24 * 60 * 60 * 1000;
      break;
    case 'Last 6 Months':
      ms = 180 * 24 * 60 * 60 * 1000;
      break;
    case 'Last 9 Months':
      ms = 270 * 24 * 60 * 60 * 1000;
      break;
    case 'Last 1 Year':
      ms = 365 * 24 * 60 * 60 * 1000;
      break;
    default:
      return { start: null, end: null, prevStart: null, prevEnd: null };
  }

  const start = new Date(now.getTime() - ms);
  const prevEnd = start;
  const prevStart = new Date(start.getTime() - ms);
  return { start, end: null, prevStart, prevEnd };
}

/**
 * Computes canonical metrics strictly on DISTINCT tasks.
 */
export function computeTaskMetrics(
  allTasks: any[],
  period: Period = 'All Time'
): { metrics: TaskMetrics; scopedTasks: any[] } {
  const now = new Date();
  const { start, end, prevStart, prevEnd } = getPeriodDateRanges(period);

  // Filter tasks belonging to current period
  const scopedTasks = allTasks.filter(t => {
    if (!start && !end) return true; // All Time
    const taskDate = new Date(t.created_at || t.updated_at || now);
    const completedDate = t.completed_at ? new Date(t.completed_at) : null;
    const dueDate = t.due_date ? new Date(t.due_date) : null;

    if (start && end) {
      return (
        (taskDate >= start && taskDate <= end) ||
        (completedDate && completedDate >= start && completedDate <= end) ||
        (dueDate && dueDate >= start && dueDate <= end)
      );
    }
    if (start) {
      return taskDate >= start || (completedDate && completedDate >= start);
    }
    return true;
  });

  // Filter tasks belonging to previous period for real trend calculation
  const prevTasks = allTasks.filter(t => {
    if (!prevStart || !prevEnd) return false;
    const taskDate = new Date(t.created_at || t.updated_at || now);
    const completedDate = t.completed_at ? new Date(t.completed_at) : null;
    return (taskDate >= prevStart && taskDate < prevEnd) || (completedDate && completedDate >= prevStart && completedDate < prevEnd);
  });

  // Distinct count helpers for current period
  let assigned = scopedTasks.length;
  let inProgress = 0;
  let completed = 0;
  let overdue = 0;
  let totalProgressAccumulator = 0;

  scopedTasks.forEach(t => {
    const isDone = t.status === 'Done' || t.status === 'Completed';
    const isProg = t.status === 'In Progress';
    const isOver = t.due_date && new Date(t.due_date) < now && !isDone;

    if (isDone) completed++;
    if (isProg) inProgress++;
    if (isOver) overdue++;

    // Calculate individual task progress with safe status-based fallback
    let p = 0;
    if (t.progress !== null && t.progress !== undefined && !isNaN(Number(t.progress))) {
      p = Number(t.progress);
    } else if (isDone) {
      p = 100;
    } else if (isProg) {
      p = 50;
    } else {
      p = 0;
    }
    totalProgressAccumulator += Math.min(100, Math.max(0, p));
  });

  const progressPercent = scopedTasks.length > 0
    ? Math.round(totalProgressAccumulator / scopedTasks.length)
    : 0;

  // Previous period counts
  let prevAssigned = prevTasks.length;
  let prevInProgress = 0;
  let prevCompleted = 0;
  let prevOverdue = 0;

  prevTasks.forEach(t => {
    const isDone = t.status === 'Done' || t.status === 'Completed';
    const isProg = t.status === 'In Progress';
    const isOver = t.due_date && new Date(t.due_date) < now && !isDone;

    if (isDone) prevCompleted++;
    if (isProg) prevInProgress++;
    if (isOver) prevOverdue++;
  });

  // Calculate real trends ONLY if previous period data exists
  const calcTrend = (curr: number, prev: number): number | undefined => {
    if (prev <= 0 || !start) return undefined;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const metrics: TaskMetrics = {
    assigned,
    inProgress,
    completed,
    overdue,
    progressPercent,
    assignedTrend: calcTrend(assigned, prevAssigned),
    inProgressTrend: calcTrend(inProgress, prevInProgress),
    completedTrend: calcTrend(completed, prevCompleted),
    overdueTrend: calcTrend(overdue, prevOverdue),
  };

  return { metrics, scopedTasks };
}

// ─────────────────────────────────────────────────────────────────
// 1. FOUNDER DATA HOOK
// ─────────────────────────────────────────────────────────────────
export function useFounderData(period: Period = 'All Time') {
  const [tasks, setTasks] = useState<any[]>([]);
  const [peoplePerformance, setPeoplePerformance] = useState<any[]>([]);
  const [departmentPerformance, setDepartmentPerformance] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch pending user approvals
      const { count: pendingCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_approved', false);
      setPendingApprovals(pendingCount || 0);

      // 2. Fetch canonical tasks dataset with assignees and departments
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*, departments(id, name), task_assignees(user_id, users:users(id, full_name, role))')
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      const allTasks = tasksData || [];
      setTasks(allTasks);

      // 3. Fetch all users and departments for breakdowns
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, role, department_id');

      const { data: deptsData } = await supabase
        .from('departments')
        .select('id, name');

      const now = new Date();
      const userMap: Record<string, any> = {};
      const deptMap: Record<string, any> = {};

      usersData?.forEach(u => {
        userMap[u.id] = { ...u, active: 0, completed: 0, overdue: 0, total: 0 };
      });
      deptsData?.forEach(d => {
        deptMap[d.id] = { ...d, active: 0, completed: 0, overdue: 0, total: 0 };
      });

      allTasks.forEach(t => {
        const isDone = t.status === 'Done' || t.status === 'Completed';
        const isOverdue = t.due_date && new Date(t.due_date) < now && !isDone;
        const isActive = t.status === 'To Do' || t.status === 'In Progress';

        // Map by assignees
        if (t.task_assignees && t.task_assignees.length > 0) {
          t.task_assignees.forEach((a: any) => {
            const uid = a.user_id;
            if (uid && userMap[uid]) {
              userMap[uid].total++;
              if (isActive) userMap[uid].active++;
              if (isDone) userMap[uid].completed++;
              if (isOverdue) userMap[uid].overdue++;
            }
          });
        }

        // Map by department
        if (t.department_id && deptMap[t.department_id]) {
          deptMap[t.department_id].total++;
          if (isActive) deptMap[t.department_id].active++;
          if (isDone) deptMap[t.department_id].completed++;
          if (isOverdue) deptMap[t.department_id].overdue++;
        }
      });

      setPeoplePerformance(Object.values(userMap).filter(u => u.total > 0).sort((a, b) => b.total - a.total));
      setDepartmentPerformance(Object.values(deptMap).sort((a, b) => b.total - a.total));
    } catch (err: any) {
      console.error('Error in useFounderData:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('founder_dashboard_tasks_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const { metrics, scopedTasks } = useMemo(() => {
    return computeTaskMetrics(tasks, period);
  }, [tasks, period]);

  return {
    metrics,
    tasks: scopedTasks,
    allTasks: tasks,
    peoplePerformance,
    departmentPerformance,
    pendingApprovals,
    loading,
    error,
    refetch: fetchData,
  };
}

// ─────────────────────────────────────────────────────────────────
// 2. DEPARTMENT HEAD DATA HOOK
// ─────────────────────────────────────────────────────────────────
export function useDepartmentHeadData(period: Period = 'All Time') {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [teamExecution, setTeamExecution] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);

    try {
      // Pending approvals in department
      const { count: pendingCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_approved', false)
        .eq('department_id', profile.department_id || '');
      setPendingApprovals(pendingCount || 0);

      // Canonical tasks dataset (RLS handles department visibility)
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*, departments(id, name), task_assignees(user_id, users:users(id, full_name, role))')
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      const allTasks = tasksData || [];
      setTasks(allTasks);

      // Team breakdown
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, role')
        .eq('department_id', profile.department_id || '');

      const userMap: Record<string, any> = {};
      usersData?.forEach(u => {
        userMap[u.id] = { ...u, active: 0, completed: 0, overdue: 0, total: 0 };
      });

      const now = new Date();
      allTasks.forEach(t => {
        const isDone = t.status === 'Done' || t.status === 'Completed';
        const isOverdue = t.due_date && new Date(t.due_date) < now && !isDone;
        const isActive = t.status === 'To Do' || t.status === 'In Progress';

        if (t.task_assignees && t.task_assignees.length > 0) {
          t.task_assignees.forEach((a: any) => {
            const uid = a.user_id;
            if (uid && userMap[uid]) {
              userMap[uid].total++;
              if (isActive) userMap[uid].active++;
              if (isDone) userMap[uid].completed++;
              if (isOverdue) userMap[uid].overdue++;
            }
          });
        }
      });

      setTeamExecution(Object.values(userMap).filter(u => u.total > 0).sort((a, b) => b.total - a.total));
    } catch (err: any) {
      console.error('Error in useDepartmentHeadData:', err);
      setError(err.message || 'Failed to load department data');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('dept_dashboard_tasks_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const { metrics, scopedTasks } = useMemo(() => {
    return computeTaskMetrics(tasks, period);
  }, [tasks, period]);

  return {
    metrics,
    tasks: scopedTasks,
    teamExecution,
    pendingApprovals,
    loading,
    error,
    refetch: fetchData,
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. MANAGER DATA HOOK
// ─────────────────────────────────────────────────────────────────
export function useManagerData(period: Period = 'All Time') {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [teamExecution, setTeamExecution] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);

    try {
      // Pending approvals
      const { count: pendingCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_approved', false)
        .eq('department_id', profile.department_id || '');
      setPendingApprovals(pendingCount || 0);

      // Canonical tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*, departments(id, name), task_assignees(user_id, users:users(id, full_name, role))')
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      const allTasks = tasksData || [];
      setTasks(allTasks);

      // Team users
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, role')
        .eq('department_id', profile.department_id || '');

      const userMap: Record<string, any> = {};
      usersData?.forEach(u => {
        userMap[u.id] = { ...u, active: 0, completed: 0, overdue: 0, total: 0 };
      });

      const now = new Date();
      allTasks.forEach(t => {
        const isDone = t.status === 'Done' || t.status === 'Completed';
        const isOverdue = t.due_date && new Date(t.due_date) < now && !isDone;
        const isActive = t.status === 'To Do' || t.status === 'In Progress';

        if (t.task_assignees && t.task_assignees.length > 0) {
          t.task_assignees.forEach((a: any) => {
            const uid = a.user_id;
            if (uid && userMap[uid]) {
              userMap[uid].total++;
              if (isActive) userMap[uid].active++;
              if (isDone) userMap[uid].completed++;
              if (isOverdue) userMap[uid].overdue++;
            }
          });
        }
      });

      setTeamExecution(Object.values(userMap).filter(u => u.total > 0).sort((a, b) => b.total - a.total));
    } catch (err: any) {
      console.error('Error in useManagerData:', err);
      setError(err.message || 'Failed to load manager data');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('mgr_dashboard_tasks_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const { metrics, scopedTasks } = useMemo(() => {
    return computeTaskMetrics(tasks, period);
  }, [tasks, period]);

  return {
    metrics,
    tasks: scopedTasks,
    teamExecution,
    pendingApprovals,
    loading,
    error,
    refetch: fetchData,
  };
}

// ─────────────────────────────────────────────────────────────────
// 4. EMPLOYEE DATA HOOK
// ─────────────────────────────────────────────────────────────────
export function useEmployeeData(period: Period = 'All Time') {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);

    try {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*, departments(id, name), task_assignees(user_id, users:users(id, full_name, role))')
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      setTasks(tasksData || []);
    } catch (err: any) {
      console.error('Error in useEmployeeData:', err);
      setError(err.message || 'Failed to load employee data');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('emp_dashboard_tasks_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const markTaskDone = async (taskId: string) => {
    await supabase.from('tasks').update({ status: 'Done', updated_at: new Date().toISOString() }).eq('id', taskId);
    fetchData();
  };

  const { metrics, scopedTasks } = useMemo(() => {
    return computeTaskMetrics(tasks, period);
  }, [tasks, period]);

  return {
    metrics,
    tasks: scopedTasks,
    loading,
    error,
    refetch: fetchData,
    markTaskDone,
  };
}
