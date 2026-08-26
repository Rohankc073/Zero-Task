import { supabase } from '../../lib/supabase';
import { User, Task } from '../../types';

export interface ChildTaskInput {
  title: string;
  description?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent' | string;
  due_date?: string | null;
  assignee_id?: string | null;
  execution_classification?: string;
}

export interface SubtaskProgress {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  derivedPercentage: number;
}

export class TaskSegregationService {
  /**
   * Evaluates if a user is authorized to break down / segregate a given task.
   */
  static canSegregateTask(user: User | null, task: any): boolean {
    if (!user || !task) return false;
    
    // 1. Founder can segregate any task
    if (user.role === 'Founder') return true;

    // 2. Execution Team can segregate tasks
    if (user.role === 'Execution Team') return true;

    // 3. Primary assignee or task_assignees member
    if (task.user_id === user.id) return true;
    if (task.assignees?.some((a: any) => a.user?.id === user.id || a.user_id === user.id)) return true;
    if (task.task_assignees?.some((a: any) => a.user_id === user.id)) return true;

    // 4. Department Head of same department
    if (user.role === 'Department Head' && (!user.department_id || user.department_id === task.department_id)) {
      return true;
    }

    // 5. Manager of same department
    if (user.role === 'Manager' && (!user.department_id || user.department_id === task.department_id)) {
      return true;
    }

    return false;
  }

  /**
   * Executes atomic task segregation via Postgres RPC.
   */
  static async segregateTask(
    parentTaskId: string,
    childTasks: ChildTaskInput[]
  ): Promise<{ success: boolean; created_count: number; child_ids: string[]; error?: string }> {
    if (!parentTaskId) return { success: false, created_count: 0, child_ids: [], error: 'Invalid parent task' };
    if (!childTasks || childTasks.length === 0) return { success: false, created_count: 0, child_ids: [], error: 'At least one subtask is required' };

    try {
      const { data, error } = await supabase.rpc('segregate_task', {
        p_parent_task_id: parentTaskId,
        p_child_tasks: childTasks,
      });

      if (error) {
        console.error('Error in segregate_task RPC:', error);
        return { success: false, created_count: 0, child_ids: [], error: error.message };
      }

      return {
        success: data?.success || false,
        created_count: data?.created_count || 0,
        child_ids: data?.child_ids || [],
      };
    } catch (err: any) {
      console.error('Failed to segregate task:', err);
      return { success: false, created_count: 0, child_ids: [], error: err.message || 'Failed to decompose task' };
    }
  }

  /**
   * Fetches all child subtasks belonging to a parent task.
   */
  static async getSubtasks(parentTaskId: string): Promise<Task[]> {
    if (!parentTaskId) return [];
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:users!user_id(id, full_name, role, email, avatar_url),
          assignees:task_assignees(user:users!user_id(id, full_name, role, avatar_url))
        `)
        .eq('parent_task_id', parentTaskId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching subtasks:', error);
        return [];
      }

      return (data || []) as Task[];
    } catch (err) {
      console.error('Error getting subtasks:', err);
      return [];
    }
  }

  /**
   * Computes derived execution progress metrics from child subtasks.
   */
  static calculateSubtaskProgress(subtasks: Task[]): SubtaskProgress {
    if (!subtasks || subtasks.length === 0) {
      return { total: 0, completed: 0, inProgress: 0, todo: 0, derivedPercentage: 0 };
    }

    const total = subtasks.length;
    let completed = 0;
    let inProgress = 0;
    let todo = 0;
    let totalProgressSum = 0;

    subtasks.forEach(t => {
      const isDone = t.status === 'Done';
      const isOngoing = t.status === 'In Progress';
      
      if (isDone) {
        completed++;
        totalProgressSum += 100;
      } else if (isOngoing) {
        inProgress++;
        totalProgressSum += (t.progress || 50);
      } else {
        todo++;
        totalProgressSum += (t.progress || 0);
      }
    });

    const derivedPercentage = Math.round(totalProgressSum / total);

    return {
      total,
      completed,
      inProgress,
      todo,
      derivedPercentage,
    };
  }
}
