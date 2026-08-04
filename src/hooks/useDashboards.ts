import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useEmployeeData() {
  const { profile } = useAuth();
  const [upcomingTasks, setUpcomingTasks] = useState<any[]>([]);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [doneTasks, setDoneTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('*, projects(name)')
      .eq('user_id', profile.id)
      .order('due_date', { ascending: true });

    if (!tasksError && tasksData) {
      const now = new Date();
      const upcoming: any[] = [];
      const active: any[] = [];
      const done: any[] = [];

      tasksData.forEach(task => {
        if (task.status === 'Done') {
          done.push(task);
        } else {
          if (task.due_date) {
            const dueDate = new Date(task.due_date);
            const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (diffHours > 48) {
              upcoming.push(task);
            } else {
              active.push(task);
            }
          } else {
            active.push(task);
          }
        }
      });

      setUpcomingTasks(upcoming);
      setActiveTasks(active);
      setDoneTasks(done.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()).slice(0, 10));
    }

    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markTaskDone = async (taskId: string) => {
    await supabase.from('tasks').update({ status: 'Done', updated_at: new Date().toISOString() }).eq('id', taskId);
    fetchData(); // refresh
  };

  return useMemo(() => ({
    upcomingTasks,
    activeTasks,
    doneTasks,
    loading,
    refetch: fetchData,
    markTaskDone
  }), [upcomingTasks, activeTasks, doneTasks, loading, fetchData]);
}

export function useManagerData() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'Employee')
      .eq('is_approved', false);
      
    setPendingApprovals(count || 0);

    if (profile.department_id) {
      const { data: empData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('department_id', profile.department_id)
        .eq('role', 'Employee');
      if (empData) setEmployees(empData);
    }

    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*, projects(name), users(full_name)')
      .order('created_at', { ascending: false });

    if (tasksData) setTasks(tasksData);

    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return useMemo(() => ({
    tasks,
    employees,
    pendingApprovals,
    loading,
    refetch: fetchData
  }), [tasks, employees, pendingApprovals, loading, fetchData]);
}

export function useDepartmentHeadData() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'Manager')
      .eq('is_approved', false);
      
    setPendingApprovals(count || 0);

    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*, projects(name), users(full_name)')
      .order('created_at', { ascending: false });

    if (tasksData) setTasks(tasksData);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return useMemo(() => ({
    tasks,
    pendingApprovals,
    loading,
    refetch: fetchData
  }), [tasks, pendingApprovals, loading, fetchData]);
}

export function useFounderData() {
  const [systemVelocity, setSystemVelocity] = useState<number>(0);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  
  // New SaaS Metrics
  const [mrr, setMrr] = useState<number>(0);
  const [activeWorkspaces, setActiveWorkspaces] = useState<number>(0);
  const [profitMargin, setProfitMargin] = useState<number>(70);
  const [clientRoi, setClientRoi] = useState<number>(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Pending Department Head approvals
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'Department Head')
      .eq('is_approved', false);
      
    setPendingApprovals(count || 0);

    // System Velocity: Total tasks completed in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { count: tasksCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Done')
      .gte('updated_at', sevenDaysAgo.toISOString());
      
    const completedTasks = tasksCount || 0;
    setSystemVelocity(completedTasks);
    
    // SaaS Metric calculations
    setClientRoi(completedTasks * 1.5); // Mock ROI: 1.5 hours saved per task

    // Fetch active projects for MRR and Workspace count
    const { data: activeProjectsData } = await supabase
      .from('projects')
      .select('id')
      .eq('status', 'Active');
      
    if (activeProjectsData) {
      setActiveWorkspaces(activeProjectsData.length);
      setMrr(activeProjectsData.length * 1500); // Mock MRR: $1500 per active project
    }

    // Fetch Recent Client Activity (projects ordered by updated_at with owner info)
    const { data: recentProjectsData } = await supabase
      .from('projects')
      .select('*, owner:users!owner_id(full_name, role)')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (recentProjectsData) {
      setRecentActivity(recentProjectsData);
    }


    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  return useMemo(() => ({
    systemVelocity,
    pendingApprovals,
    mrr,
    activeWorkspaces,
    profitMargin,
    clientRoi,
    recentActivity,
    loading,
    refetch: fetchData
  }), [systemVelocity, pendingApprovals, mrr, activeWorkspaces, profitMargin, clientRoi, recentActivity, loading, fetchData]);
}
