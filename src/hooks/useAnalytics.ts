import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Task } from '../types';

export interface EmployeeMetrics {
  total_open_tasks: number;
  tasks_due_this_week: number;
  completion_percentage: number;
}

export interface ManagerProjectMetric {
  project_id: string;
  project_name: string;
  total_tasks: number;
  todo_tasks: number;
  in_progress_tasks: number;
  done_tasks: number;
}

export interface TeamWorkloadMetric {
  user_id: string;
  user_name: string;
  assigned_tasks: number;
}

export function useEmployeeMetrics() {
  const { session } = useAuth();
  const [metrics, setMetrics] = useState<EmployeeMetrics | null>(null);
  const [tasksForToday, setTasksForToday] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    
    try {
      // 1. Fetch aggregated metrics via RPC
      const { data: metricsData, error: metricsError } = await supabase.rpc(
        'get_employee_dashboard_metrics',
        { user_uuid: session.user.id }
      );
      
      if (metricsError) throw metricsError;
      if (metricsData) setMetrics(metricsData as EmployeeMetrics);

      // 2. Fetch action items for today (due today or overdue, not done)
      // For simplicity in UI, just grabbing latest active tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id)
        .neq('status', 'Done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(5);
        
      if (tasksError) throw tasksError;
      if (tasksData) setTasksForToday(tasksData as Task[]);

    } catch (err) {
      console.error('Error fetching employee metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  return {
    metrics,
    tasksForToday,
    loading,
    fetchMetrics
  };
}

export function useManagerMetrics() {
  const [projectMetrics, setProjectMetrics] = useState<ManagerProjectMetric[]>([]);
  const [teamWorkload, setTeamWorkload] = useState<TeamWorkloadMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    
    try {
      // 1. Fetch project analytics via RPC
      const { data: projData, error: projError } = await supabase.rpc('get_manager_project_analytics');
      if (projError) throw projError;
      if (projData) setProjectMetrics(projData as ManagerProjectMetric[]);

      // 2. Fetch team workload via RPC
      const { data: teamData, error: teamError } = await supabase.rpc('get_team_workload');
      if (teamError) throw teamError;
      if (teamData) setTeamWorkload(teamData as TeamWorkloadMetric[]);

    } catch (err) {
      console.error('Error fetching manager metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    projectMetrics,
    teamWorkload,
    loading,
    fetchMetrics
  };
}
