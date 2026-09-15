const isIgnoredDashboardError = (err: any): boolean => {
  if (!err) return false;
  const msg = String(err.message || err || '').toLowerCase();
  const code = String(err.code || '');
  const status = err.status;
  return (
    status === 401 ||
    status === 403 ||
    code === '401' ||
    code === 'C@3' ||
    code === 'HTTP_401' ||
    code === 'HTTP_403' ||
    code === 'NETWORK_ERROR' ||
    code === 'ERR_NETWORK' ||
    msg.includes('credentials') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('not authenticated') ||
    msg.includes('http 401') ||
    msg.includes('fetch failed') ||
    msg.includes('connectexception') ||
    msg.includes('network error')
  );
};

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { Period } from '../components/ui/PeriodSelector';
import { isTaskOverdue } from '../utils/dateUtils';
import { TaskService } from '../services/tasks/TaskService';
import { TaskEventBus } from '../services/tasks/TaskEventBus';
import { UserService } from '../services/users/UserService';
import { apiClient } from '../services/api/apiClient';

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
  subtasksAssigned?: number;
  subtasksInProgress?: number;
  subtasksCompleted?: number;
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
    const isOver = isTaskOverdue(t.due_date, isDone);

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

  let subtasksAssigned = 0;
  let subtasksInProgress = 0;
  let subtasksCompleted = 0;

  scopedTasks.forEach(t => {
    const isSubtask = !!t.parent_task_id || (t.depth && t.depth > 1);
    const isDone = t.status === 'Done' || t.status === 'Completed';
    const isProg = t.status === 'In Progress';
    if (isSubtask) {
      subtasksAssigned++;
      if (isDone) subtasksCompleted++;
      if (isProg) subtasksInProgress++;
    }
  });

  prevTasks.forEach(t => {
    const isDone = t.status === 'Done' || t.status === 'Completed';
    const isProg = t.status === 'In Progress';
    const isOver = isTaskOverdue(t.due_date, isDone);

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
    subtasksAssigned,
    subtasksInProgress,
    subtasksCompleted,
  };

  return { metrics, scopedTasks };
}

// ─────────────────────────────────────────────────────────────────
// 1. FOUNDER DATA HOOK
// ─────────────────────────────────────────────────────────────────
export function useFounderData(period: Period = 'All Time') {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [peoplePerformance, setPeoplePerformance] = useState<any[]>([]);
  const [departmentPerformance, setDepartmentPerformance] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tasksRef = useRef<any[]>([]);
  tasksRef.current = tasks;

  const getCacheKey = useCallback(() => {
    if (!profile?.id) return null;
    const compId = profile.company_id || 'nocompany';
    return `@zerotask_dashboard_tasks_${compId}_${profile.id}`;
  }, [profile?.id, profile?.company_id]);

  const fetchData = useCallback(async (isBackground: boolean = false) => {
    if (!profile?.id) return;
    console.log(`[HOME_TASK_FETCH_START] user_id=${profile.id} company_id=${profile.company_id || 'unknown'}`);
    // Only show full loading spinner when we have NO data yet and this is not a background refresh
    if (tasksRef.current.length === 0 && !isBackground) {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch pending approvals via FastAPI
      try {
        const appRes = await apiClient.get('/approvals');
        setPendingApprovals(Array.isArray(appRes.data) ? appRes.data.length : 0);
      } catch {}

      // 2. Fetch canonical tasks dataset via FastAPI
      const tasksRes = await TaskService.getTasks();
      let allTasks = tasksRef.current;
      if (tasksRes.data) {
        allTasks = tasksRes.data;
        setTasks(allTasks);
        console.log(`[HOME_TASK_FETCH_SUCCESS] count=${allTasks.length}`);
        const cacheKey = getCacheKey();
        if (cacheKey) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(allTasks));
        }
      } else if (tasksRes.error) {
        console.warn('[useFounderData] TaskService warning:', tasksRes.error.message);
      }

      // 3. Fetch users and departments for breakdowns
      let usersData: any[] = [];
      let deptsData: any[] = [];
      try {
        const uRes = await UserService.getUsers();
        if (uRes.data) usersData = uRes.data;
        const dRes = await UserService.getDepartments();
        if (dRes.data) deptsData = dRes.data;
      } catch {}

      const userMap: Record<string, any> = {};
      const deptMap: Record<string, any> = {};

      usersData.forEach((u: any) => {
        userMap[u.id] = { ...u, active: 0, completed: 0, overdue: 0, total: 0 };
      });
      deptsData.forEach((d: any) => {
        deptMap[d.id] = { ...d, active: 0, completed: 0, overdue: 0, total: 0 };
      });

      allTasks.forEach((t: any) => {
        const isDone = t.status === 'Done' || t.status === 'Completed';
        const isOverdue = isTaskOverdue(t.due_date, isDone);
        const isActive = t.status === 'To Do' || t.status === 'In Progress';

        // Map by assignees
        const assigneesList = t.assignees || t.task_assignees || [];
        if (assigneesList.length > 0) {
          assigneesList.forEach((a: any) => {
            const uid = a.user_id || a.user?.id || a.id;
            if (uid && userMap[uid]) {
              userMap[uid].total++;
              if (isActive) userMap[uid].active++;
              if (isDone) userMap[uid].completed++;
              if (isOverdue) userMap[uid].overdue++;
            }
          });
        } else if (t.user_id && userMap[t.user_id]) {
          userMap[t.user_id].total++;
          if (isActive) userMap[t.user_id].active++;
          if (isDone) userMap[t.user_id].completed++;
          if (isOverdue) userMap[t.user_id].overdue++;
        }

        // Map by department
        if (t.department_id && deptMap[t.department_id]) {
          deptMap[t.department_id].total++;
          if (isActive) deptMap[t.department_id].active++;
          if (isDone) deptMap[t.department_id].completed++;
          if (isOverdue) deptMap[t.department_id].overdue++;
        }
      });

      setPeoplePerformance(Object.values(userMap).filter((u) => u.total > 0).sort((a, b) => b.total - a.total));
      setDepartmentPerformance(Object.values(deptMap).sort((a, b) => b.total - a.total));
    } catch (err: any) {
      if (!isIgnoredDashboardError(err)) console.error('Error in useFounderData:', err);
      setError(err.message || 'Failed to load dashboard data');
      // PRESERVE existing valid tasks state; DO NOT overwrite with [] on network failure!
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, getCacheKey]);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = getCacheKey();
    if (cacheKey) {
      AsyncStorage.getItem(cacheKey).then((cached) => {
        if (cached && isMounted) {
          try {
            const parsed = JSON.parse(cached);
            setTasks(parsed);
            setLoading(false);
          } catch {}
        }
      });
    }

    fetchData();

    const unsub = TaskEventBus.subscribe(() => {
      fetchData(true);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [profile?.id, getCacheKey]);

  const { metrics, scopedTasks } = useMemo(() => {
    const res = computeTaskMetrics(tasks, period);
    console.log(`[HOME_TASK_METRICS] assigned=${res.metrics.assigned} in_progress=${res.metrics.inProgress} completed=${res.metrics.completed} overdue=${res.metrics.overdue}`);
    return res;
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

  const tasksRef = useRef<any[]>([]);
  tasksRef.current = tasks;

  const getCacheKey = useCallback(() => {
    if (!profile?.id) return null;
    const compId = profile.company_id || 'nocompany';
    return `@zerotask_dashboard_tasks_${compId}_${profile.id}`;
  }, [profile?.id, profile?.company_id]);

  const fetchData = useCallback(async (isBackground: boolean = false) => {
    if (!profile?.id) return;
    console.log(`[HOME_TASK_FETCH_START] user_id=${profile.id} company_id=${profile.company_id || 'unknown'}`);
    if (tasksRef.current.length === 0 && !isBackground) {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Pending approvals via FastAPI
      try {
        const appRes = await apiClient.get('/approvals');
        setPendingApprovals(Array.isArray(appRes.data) ? appRes.data.length : 0);
      } catch {}

      // 2. Canonical tasks dataset via FastAPI
      const tasksRes = await TaskService.getTasks();
      let allTasks = tasksRef.current;
      if (tasksRes.data) {
        allTasks = tasksRes.data;
        setTasks(allTasks);
        console.log(`[HOME_TASK_FETCH_SUCCESS] count=${allTasks.length}`);
        const cacheKey = getCacheKey();
        if (cacheKey) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(allTasks));
        }
      } else if (tasksRes.error) {
        console.warn('[useDepartmentHeadData] TaskService warning:', tasksRes.error.message);
      }

      // 3. Team users via FastAPI
      let usersData: any[] = [];
      try {
        const uRes = await UserService.getUsers(
          profile.department_id ? { department_id: profile.department_id } : {}
        );
        if (uRes.data) usersData = uRes.data;
      } catch {}

      const userMap: Record<string, any> = {};
      usersData.forEach((u: any) => {
        userMap[u.id] = { ...u, active: 0, completed: 0, overdue: 0, total: 0 };
      });

      allTasks.forEach((t: any) => {
        const isDone = t.status === 'Done' || t.status === 'Completed';
        const isOverdue = isTaskOverdue(t.due_date, isDone);
        const isActive = t.status === 'To Do' || t.status === 'In Progress';

        const assigneesList = t.assignees || t.task_assignees || [];
        if (assigneesList.length > 0) {
          assigneesList.forEach((a: any) => {
            const uid = a.user_id || a.user?.id || a.id;
            if (uid && userMap[uid]) {
              userMap[uid].total++;
              if (isActive) userMap[uid].active++;
              if (isDone) userMap[uid].completed++;
              if (isOverdue) userMap[uid].overdue++;
            }
          });
        } else if (t.user_id && userMap[t.user_id]) {
          userMap[t.user_id].total++;
          if (isActive) userMap[t.user_id].active++;
          if (isDone) userMap[t.user_id].completed++;
          if (isOverdue) userMap[t.user_id].overdue++;
        }
      });

      setTeamExecution(Object.values(userMap).filter((u) => u.total > 0).sort((a, b) => b.total - a.total));
    } catch (err: any) {
      if (!isIgnoredDashboardError(err)) console.error('Error in useDepartmentHeadData:', err);
      setError(err.message || 'Failed to load department data');
      // Preserve existing valid state
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, profile?.department_id, getCacheKey]);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = getCacheKey();
    if (cacheKey) {
      AsyncStorage.getItem(cacheKey).then((cached) => {
        if (cached && isMounted) {
          try {
            const parsed = JSON.parse(cached);
            setTasks(parsed);
            setLoading(false);
          } catch {}
        }
      });
    }

    fetchData();

    const unsub = TaskEventBus.subscribe(() => {
      fetchData(true);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [profile?.id, getCacheKey]);

  const { metrics, scopedTasks } = useMemo(() => {
    const res = computeTaskMetrics(tasks, period);
    console.log(`[HOME_TASK_METRICS] assigned=${res.metrics.assigned} in_progress=${res.metrics.inProgress} completed=${res.metrics.completed} overdue=${res.metrics.overdue}`);
    return res;
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

  const tasksRef = useRef<any[]>([]);
  tasksRef.current = tasks;

  const getCacheKey = useCallback(() => {
    if (!profile?.id) return null;
    const compId = profile.company_id || 'nocompany';
    return `@zerotask_dashboard_tasks_${compId}_${profile.id}`;
  }, [profile?.id, profile?.company_id]);

  const fetchData = useCallback(async (isBackground: boolean = false) => {
    if (!profile?.id) return;
    console.log(`[HOME_TASK_FETCH_START] user_id=${profile.id} company_id=${profile.company_id || 'unknown'}`);
    if (tasksRef.current.length === 0 && !isBackground) {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Pending approvals via FastAPI
      try {
        const appRes = await apiClient.get('/approvals');
        setPendingApprovals(Array.isArray(appRes.data) ? appRes.data.length : 0);
      } catch {}

      // 2. Canonical tasks via FastAPI
      const tasksRes = await TaskService.getTasks();
      let allTasks = tasksRef.current;
      if (tasksRes.data) {
        allTasks = tasksRes.data;
        setTasks(allTasks);
        console.log(`[HOME_TASK_FETCH_SUCCESS] count=${allTasks.length}`);
        const cacheKey = getCacheKey();
        if (cacheKey) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(allTasks));
        }
      } else if (tasksRes.error) {
        console.warn('[useManagerData] TaskService warning:', tasksRes.error.message);
      }

      // 3. Team users via FastAPI
      let usersData: any[] = [];
      try {
        const uRes = await UserService.getUsers(
          profile.department_id ? { department_id: profile.department_id } : {}
        );
        if (uRes.data) usersData = uRes.data;
      } catch {}

      const userMap: Record<string, any> = {};
      usersData.forEach((u: any) => {
        userMap[u.id] = { ...u, active: 0, completed: 0, overdue: 0, total: 0 };
      });

      allTasks.forEach((t: any) => {
        const isDone = t.status === 'Done' || t.status === 'Completed';
        const isOverdue = isTaskOverdue(t.due_date, isDone);
        const isActive = t.status === 'To Do' || t.status === 'In Progress';

        const assigneesList = t.assignees || t.task_assignees || [];
        if (assigneesList.length > 0) {
          assigneesList.forEach((a: any) => {
            const uid = a.user_id || a.user?.id || a.id;
            if (uid && userMap[uid]) {
              userMap[uid].total++;
              if (isActive) userMap[uid].active++;
              if (isDone) userMap[uid].completed++;
              if (isOverdue) userMap[uid].overdue++;
            }
          });
        } else if (t.user_id && userMap[t.user_id]) {
          userMap[t.user_id].total++;
          if (isActive) userMap[t.user_id].active++;
          if (isDone) userMap[t.user_id].completed++;
          if (isOverdue) userMap[t.user_id].overdue++;
        }
      });

      setTeamExecution(Object.values(userMap).filter((u) => u.total > 0).sort((a, b) => b.total - a.total));
    } catch (err: any) {
      if (!isIgnoredDashboardError(err)) console.error('Error in useManagerData:', err);
      setError(err.message || 'Failed to load manager data');
      // Preserve existing valid state
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, profile?.department_id, getCacheKey]);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = getCacheKey();
    if (cacheKey) {
      AsyncStorage.getItem(cacheKey).then((cached) => {
        if (cached && isMounted) {
          try {
            const parsed = JSON.parse(cached);
            setTasks(parsed);
            setLoading(false);
          } catch {}
        }
      });
    }

    fetchData();

    const unsub = TaskEventBus.subscribe(() => {
      fetchData(true);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [profile?.id, getCacheKey]);

  const { metrics, scopedTasks } = useMemo(() => {
    const res = computeTaskMetrics(tasks, period);
    console.log(`[HOME_TASK_METRICS] assigned=${res.metrics.assigned} in_progress=${res.metrics.inProgress} completed=${res.metrics.completed} overdue=${res.metrics.overdue}`);
    return res;
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

  const tasksRef = useRef<any[]>([]);
  tasksRef.current = tasks;

  const getCacheKey = useCallback(() => {
    if (!profile?.id) return null;
    const compId = profile.company_id || 'nocompany';
    return `@zerotask_dashboard_tasks_${compId}_${profile.id}`;
  }, [profile?.id, profile?.company_id]);

  const fetchData = useCallback(async (isBackground: boolean = false) => {
    if (!profile?.id) return;
    console.log(`[HOME_TASK_FETCH_START] user_id=${profile.id} company_id=${profile.company_id || 'unknown'}`);
    if (tasksRef.current.length === 0 && !isBackground) {
      setLoading(true);
    }
    setError(null);

    try {
      // FastAPI TaskService.getTasks returns all tasks authorized for this employee
      const tasksRes = await TaskService.getTasks();
      if (tasksRes.data) {
        const freshTasks = tasksRes.data;
        setTasks(freshTasks);
        console.log(`[HOME_TASK_FETCH_SUCCESS] count=${freshTasks.length}`);
        const cacheKey = getCacheKey();
        if (cacheKey) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(freshTasks));
        }
      } else if (tasksRes.error) {
        console.warn('[useEmployeeData] TaskService warning:', tasksRes.error.message);
      }
    } catch (err: any) {
      if (!isIgnoredDashboardError(err)) console.error('Error in useEmployeeData:', err);
      setError(err.message || 'Failed to load employee data');
      // PRESERVE existing valid tasks state; DO NOT overwrite with [] on network failure!
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, getCacheKey]);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = getCacheKey();
    if (cacheKey) {
      AsyncStorage.getItem(cacheKey).then((cached) => {
        if (cached && isMounted) {
          try {
            const parsed = JSON.parse(cached);
            setTasks(parsed);
            setLoading(false);
          } catch {}
        }
      });
    }

    fetchData();

    const unsub = TaskEventBus.subscribe(() => {
      fetchData(true);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [profile?.id, getCacheKey]);

  const markTaskDone = async (taskId: string) => {
    await TaskService.completeTask(taskId);
    fetchData();
  };

  const { metrics, scopedTasks } = useMemo(() => {
    const res = computeTaskMetrics(tasks, period);
    console.log(`[HOME_TASK_METRICS] assigned=${res.metrics.assigned} in_progress=${res.metrics.inProgress} completed=${res.metrics.completed} overdue=${res.metrics.overdue}`);
    return res;
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
