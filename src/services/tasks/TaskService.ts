import { supabase } from '../../lib/supabase';
import { Task, ExecutionActivity, User } from '../../types';

export class TaskService {
  /**
   * Fetch a task with its parent, subtasks, and other related entities.
   */
  static async getTaskWithHierarchy(taskId: string): Promise<Task | null> {
    if (!taskId) return null;
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          subtasks:tasks!parent_task_id(*),
          parent:tasks!parent_task_id(id, title, status),
          assignees:task_assignees(user:users!user_id(id, full_name, role, department:departments(id, name))),
          creator:users!created_by(id, full_name, role, department:departments(id, name))
        `)
        .eq('id', taskId)
        .maybeSingle();

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Error fetching task hierarchy:', error);
        }
        return null;
      }
      
      return data as any;
    } catch (err) {
      return null;
    }
  }

  /**
   * Log an execution activity (e.g. status change, comment added).
   */
  static async logActivity(
    taskId: string,
    userId: string,
    eventType: string,
    metadata: any = {},
    projectId?: string,
    milestoneId?: string
  ): Promise<boolean> {
    const payload: Partial<ExecutionActivity> = {
      task_id: taskId,
      user_id: userId,
      event_type: eventType,
      metadata
    };
    
    if (projectId) payload.project_id = projectId;
    if (milestoneId) payload.milestone_id = milestoneId;

    const { error } = await supabase
      .from('execution_activity')
      .insert(payload);

    if (error) {
      console.error('Error logging activity:', error);
      return false;
    }
    return true;
  }

  /**
   * Fetch the activity timeline for a task.
   */
  static async getTaskActivity(taskId: string): Promise<ExecutionActivity[]> {
    const { data, error } = await supabase
      .from('execution_activity')
      .select(`
        *,
        user:users!user_id(id, email, full_name, role, avatar_url)
      `)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching task activity:', error);
      return [];
    }
    
    return data as ExecutionActivity[];
  }

  /**
   * Create a subtask
   */
  static async createSubtask(
    parentTaskId: string,
    title: string,
    description: string,
    priority: string,
    dueDate: string,
    assigneeId: string,
    creatorId: string,
    milestoneId?: string,
    departmentId?: string
  ): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        parent_task_id: parentTaskId,
        title,
        description,
        priority,
        due_date: dueDate || null,
        created_by: creatorId,
        milestone_id: milestoneId || null,
        department_id: departmentId || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating subtask:', error);
      return null;
    }

    if (assigneeId) {
      await supabase.from('task_assignees').insert({
        task_id: data.id,
        user_id: assigneeId
      });
    }

    await this.logActivity(parentTaskId, creatorId, 'subtask_created', { subtask_title: title, subtask_id: data.id }, undefined, milestoneId);

    return data as Task;
  }
}
