import { apiClient } from '../api/apiClient';
import { User, Task } from '../../types';

export interface ChildTaskInput {
  title: string;
  description?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent' | string;
  due_date?: string | null;
  assignee_id?: string | null;
  assignee_ids?: string[];
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
    
    // Cannot segregate a subtask (only 1-level hierarchy allowed)
    if (task.parent_task_id || task.parent?.id) {
      return false;
    }

    // Founder Privacy Protection
    if (task.is_private && task.created_by !== user.id && task.creator?.role === 'Founder') {
      return false;
    }

    // 1. Founder & Super Admin can segregate organizational tasks
    if (user.role === 'Founder' || user.role === 'Super Admin') return true;

    // 2. Execution Team can segregate tasks
    if (user.role === 'Execution Team') return true;

    // 3. Creator
    if (task.created_by === user.id || task.creator_id === user.id || task.user_id === user.id) return true;

    // 4. Primary assignee or task_assignees member
    if (task.assignees?.some((a: any) => a.user?.id === user.id || a.user_id === user.id)) return true;
    if (task.task_assignees?.some((a: any) => a.user_id === user.id)) return true;

    // 5. Department Head of same department
    if (user.role === 'Department Head' && (!user.department_id || user.department_id === task.department_id)) {
      return true;
    }

    // 6. Manager of same department
    if (user.role === 'Manager' && (!user.department_id || user.department_id === task.department_id)) {
      return true;
    }

    return true;
  }

  /**
   * Executes atomic task segregation via FastAPI POST /tasks/{id}/segregate.
   * Canonical runtime: FastAPI → PostgreSQL. Does NOT use Supabase.
   */
  static async segregateTask(
    parentTaskId: string,
    childTasks: ChildTaskInput[]
  ): Promise<{ success: boolean; created_count: number; child_ids: string[]; error?: string }> {
    if (!parentTaskId) return { success: false, created_count: 0, child_ids: [], error: 'Invalid parent task' };
    if (!childTasks || childTasks.length === 0) return { success: false, created_count: 0, child_ids: [], error: 'At least one subtask is required' };

    try {
      const res = await apiClient.post<{ success: boolean; created_count: number; child_ids: string[]; child_task_ids?: string[] }>(
        `/tasks/${parentTaskId}/segregate`,
        { child_tasks: childTasks }
      );

      if (res.error) {
        console.error('[TaskSegregationService] segregateTask error:', res.error.message);
        return { success: false, created_count: 0, child_ids: [], error: res.error.message };
      }

      return {
        success: res.data?.success || false,
        created_count: res.data?.created_count || 0,
        child_ids: res.data?.child_ids || res.data?.child_task_ids || [],
      };
    } catch (err: any) {
      console.error('[TaskSegregationService] segregateTask exception:', err);
      return { success: false, created_count: 0, child_ids: [], error: err?.message || 'Failed to decompose task' };
    }
  }

  /**
   * Fetches all child subtasks belonging to a parent task.
   * Canonical runtime: reads from the parent task's embedded `subtasks` array (already loaded by FastAPI).
   * Falls back to GET /tasks/{id} if needed.
   * Does NOT use Supabase.
   */
  static async getSubtasks(parentTaskId: string): Promise<Task[]> {
    if (!parentTaskId) return [];
    try {
      const res = await apiClient.get<any>(`/tasks/${parentTaskId}`);
      if (res.error) {
        console.error('[TaskSegregationService] getSubtasks error:', res.error.message);
        return [];
      }
      // FastAPI returns subtasks embedded in the parent task response
      return (res.data?.subtasks || []) as Task[];
    } catch (err) {
      console.error('[TaskSegregationService] getSubtasks exception:', err);
      return [];
    }
  }

  /**
   * Computes derived execution progress metrics from child subtasks.
   * Product rule: derivedPercentage = round((completed / total) * 100)
   */
  static calculateSubtaskProgress(subtasks: Task[]): SubtaskProgress {
    if (!subtasks || subtasks.length === 0) {
      return { total: 0, completed: 0, inProgress: 0, todo: 0, derivedPercentage: 0 };
    }

    const total = subtasks.length;
    let completed = 0;
    let inProgress = 0;
    let todo = 0;

    subtasks.forEach(t => {
      const isDone = t.status === 'Done' || (t.status as string) === 'Completed';
      const isOngoing = t.status === 'In Progress';
      
      if (isDone) {
        completed++;
      } else if (isOngoing) {
        inProgress++;
      } else {
        todo++;
      }
    });

    const derivedPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      todo,
      derivedPercentage,
    };
  }
}
