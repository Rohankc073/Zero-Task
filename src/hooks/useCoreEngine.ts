import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Project, Task } from '../types';
import { useAuth } from '../context/AuthContext';

export function useProjects() {
  const { session } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;

    let isMounted = true;
    const cacheKey = `projects_cache_${session.user.id}`;
    
    const fetchProjects = async () => {
      try {
        // Stale: Load from cache instantly
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          setProjects(JSON.parse(cached));
          setLoading(false); // UI is ready, revalidate in background
        } else {
          setLoading(true);
        }

        // Revalidate: Fetch fresh data
        const { data, error } = await supabase
          .from('projects')
          .select('*, tasks(id, status), project_members(users(id, email))')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching projects:', error);
        } else if (isMounted && data) {
          setProjects(data as Project[]);
          AsyncStorage.setItem(cacheKey, JSON.stringify(data));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProjects();

    const channelId = `projects_${Math.random().toString(36).substring(2, 9)}`;
    const subscription = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setProjects((prev) => {
            const updated = [payload.new as Project, ...prev];
            AsyncStorage.setItem(cacheKey, JSON.stringify(updated));
            return updated;
          });
        } else if (payload.eventType === 'UPDATE') {
          setProjects((prev) => {
            const updated = prev.map((p) => (p.id === payload.new.id ? (payload.new as Project) : p));
            AsyncStorage.setItem(cacheKey, JSON.stringify(updated));
            return updated;
          });
        } else if (payload.eventType === 'DELETE') {
          setProjects((prev) => {
            const updated = prev.filter((p) => p.id !== payload.old.id);
            AsyncStorage.setItem(cacheKey, JSON.stringify(updated));
            return updated;
          });
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(subscription);
    };
  }, [session?.user]);

  return { projects, loading, setProjects };
}

export function useTasks(projectId?: string) {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!session?.user) return;
    const cacheKey = `tasks_cache_${session.user.id}_${projectId || 'all'}`;

    try {
      // Revalidate: Fetch fresh data with joined relationships
      let query = supabase
        .from('tasks')
        .select(`
          *,
          departments:departments(id, name),
          companies:companies(id, name),
          task_assignees:task_assignees(
            user_id,
            users:users(id, full_name, name, avatar_url, role)
          )
        `)
        .order('created_at', { ascending: false });
      
      if (projectId) {
        const { data: milestones } = await supabase.from('project_milestones').select('id').eq('project_id', projectId);
        const mIds = (milestones || []).map((m: any) => m.id);
        if (mIds.length > 0) {
          query = query.in('milestone_id', mIds);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching tasks:', error);
      } else if (data) {
        setTasks(data as Task[]);
        AsyncStorage.setItem(cacheKey, JSON.stringify(data));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, projectId]);

  useEffect(() => {
    if (!session?.user) return;
    const cacheKey = `tasks_cache_${session.user.id}_${projectId || 'all'}`;

    // Stale: Load from cache instantly
    AsyncStorage.getItem(cacheKey).then(cached => {
      if (cached) {
        try {
          setTasks(JSON.parse(cached));
          setLoading(false);
        } catch (e) {}
      }
    });

    fetchTasks();

    const channelId = `tasks_channel_${Math.random().toString(36).substring(2, 9)}`;
    const subscription = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [session?.user?.id, projectId, fetchTasks]);

  return { tasks, loading, setTasks, refetch: fetchTasks };
}
