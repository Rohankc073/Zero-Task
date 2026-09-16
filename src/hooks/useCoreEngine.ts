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

import { TaskService } from '../services/tasks/TaskService';
import { TaskEventBus } from '../services/tasks/TaskEventBus';

export function useTasks(projectId?: string) {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const getCacheKey = useCallback(() => {
    if (!session?.user) return null;
    const compId = (session.user as any).company_id || 'nocompany';
    return `@zerotask_tasks_cache_${compId}_${session.user.id}_${projectId || 'all'}`;
  }, [session?.user, projectId]);

  const fetchTasks = useCallback(async () => {
    if (!session?.user) return;
    const cacheKey = getCacheKey();

    try {
      const res = await TaskService.getTasks(projectId ? { project_id: projectId } : {});
      if (res.data) {
        const unique = Array.from(
          new Map(
            (res.data as Task[])
              .filter((t) => t && t.id)
              .map((t) => [t.id, t])
          ).values()
        );
        setTasks(unique);
        if (cacheKey) {
          AsyncStorage.setItem(cacheKey, JSON.stringify(unique));
        }
      } else if (res.error) {
        const errorMsg = String(res.error.message || '').toLowerCase();
        const isTransient =
          res.error.status === 500 ||
          res.error.status === 502 ||
          res.error.status === 503 ||
          res.error.status === 504 ||
          res.error.code === 'NETWORK_ERROR' ||
          errorMsg.includes('500') ||
          errorMsg.includes('502') ||
          errorMsg.includes('503') ||
          errorMsg.includes('bad gateway') ||
          errorMsg.includes('internal server error') ||
          errorMsg.includes('network');

        if (!isTransient) {
          console.warn('[useTasks] Fetch tasks warning:', res.error.message);
        } else {
          console.log('[useTasks] Fetch tasks transient issue, preserved cached tasks:', res.error.message);
        }
        // Preserve existing cached tasks on failure; DO NOT reset to empty!
      }
    } catch (err) {
      console.error('[useTasks] Exception fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user, projectId, getCacheKey]);

  useEffect(() => {
    if (!session?.user) return;
    let isMounted = true;
    const cacheKey = getCacheKey();

    // Stale-while-revalidate: Load from cache instantly
    if (cacheKey) {
      AsyncStorage.getItem(cacheKey).then((cached) => {
        if (cached && isMounted) {
          try {
            const parsed = JSON.parse(cached);
            const unique = Array.from(
              new Map(
                (parsed as Task[])
                  .filter((t) => t && t.id)
                  .map((t) => [t.id, t])
              ).values()
            );
            setTasks(unique);
            setLoading(false);
          } catch (e) {}
        }
      });
    }

    fetchTasks();

    // Subscribe to canonical real-time TaskEventBus (WebSocket + local mutations)
    const unsubscribe = TaskEventBus.subscribe(() => {
      fetchTasks();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [session?.user?.id, projectId, fetchTasks, getCacheKey]);

  return { tasks, loading, setTasks, refetch: fetchTasks };
}
