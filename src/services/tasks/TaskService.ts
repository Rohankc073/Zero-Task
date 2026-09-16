import { apiClient, ApiResponse } from '../api/apiClient';
import { Task, ExecutionActivity } from '../../types';
import { TaskEventBus } from './TaskEventBus';

export interface TaskFilterParams {
  status?: string;
  priority?: string;
  department_id?: string;
  project_id?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  progress?: number;
  due_date?: string;
  department_id?: string;
  company_id?: string;
  project_id?: string;
  milestone_id?: string;
  parent_task_id?: string;
  assignee_ids?: string[];
  user_id?: string;
  is_private?: boolean;
}

export interface TaskFilePayload {
  file_url: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  mime_type?: string;
  storage_path?: string;
  user_id?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  progress?: number;
  progress_percentage?: number;
  department_id?: string;
  assignee_ids?: string[];
  user_id?: string;
}

export interface SubtaskItem {
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  assignee_id?: string;
}

export class TaskService {
  /**
   * Fetch tasks with optional filters
   */
  static async getTasks(params: TaskFilterParams = {}): Promise<ApiResponse<Task[]>> {
    const qp: string[] = [];
    if (params.status) qp.push(`status_filter=${encodeURIComponent(params.status)}`);
    if (params.priority) qp.push(`priority_filter=${encodeURIComponent(params.priority)}`);
    if (params.department_id) qp.push(`department_id=${encodeURIComponent(params.department_id)}`);
    if (params.project_id) qp.push(`project_id=${encodeURIComponent(params.project_id)}`);
    if (params.limit) qp.push(`limit=${params.limit}`);
    if (params.offset) qp.push(`offset=${params.offset}`);
    const qs = qp.length > 0 ? `?${qp.join('&')}` : '';

    return apiClient.get<Task[]>(`/tasks${qs}`);
  }

  /**
   * Fetch single task by ID
   */
  static async getTaskById(taskId: string): Promise<ApiResponse<Task>> {
    return apiClient.get<Task>(`/tasks/${taskId}`);
  }

  /**
   * Fetch eligible assignees for creating or delegating a task/subtask
   */
  static async getEligibleAssignees(parentTaskId?: string, companyId?: string): Promise<ApiResponse<any[]>> {
    const qp: string[] = [];
    if (parentTaskId) qp.push(`parent_task_id=${encodeURIComponent(parentTaskId)}`);
    if (companyId) qp.push(`company_id=${encodeURIComponent(companyId)}`);
    const qs = qp.length > 0 ? `?${qp.join('&')}` : '';
    return apiClient.get<any[]>(`/tasks/eligible-assignees${qs}`);
  }

  /**
   * Create a new task
   */
  static async createTask(payload: CreateTaskPayload): Promise<ApiResponse<Task>> {
    const res = await apiClient.post<Task>('/tasks', payload);
    if (res.data) {
      TaskEventBus.emitTaskMutated('created', res.data);
    }
    return res;
  }

  /**
   * Update task details or status
   */
  static async updateTask(taskId: string, payload: UpdateTaskPayload): Promise<ApiResponse<Task>> {
    const body: any = { ...payload };
    if (body.progress !== undefined && body.progress_percentage === undefined) {
      body.progress_percentage = body.progress;
    } else if (body.progress_percentage !== undefined && body.progress === undefined) {
      body.progress = body.progress_percentage;
    }
    const res = await apiClient.patch<Task>(`/tasks/${taskId}`, body);
    if (res.data) {
      TaskEventBus.emitTaskMutated('updated', res.data);
    }
    return res;
  }

  /**
   * Complete task with completion protection
   */
  static async completeTask(taskId: string): Promise<ApiResponse<Task>> {
    const res = await apiClient.post<Task>(`/tasks/${taskId}/complete`);
    if (res.data) {
      TaskEventBus.emitTaskMutated('completed', res.data);
    }
    return res;
  }

  /**
   * Delete task
   */
  static async deleteTask(taskId: string): Promise<ApiResponse<any>> {
    const res = await apiClient.delete(`/tasks/${taskId}`);
    if (!res.error) {
      TaskEventBus.emitTaskMutated('deleted', taskId);
    }
    return res;
  }

  /**
   * Register a file attachment with a task (after uploading binary to MinIO via /storage/upload).
   * Calls FastAPI POST /tasks/{id}/files ? no Supabase.
   */
  static async createTaskFile(taskId: string, payload: TaskFilePayload): Promise<ApiResponse<any>> {
    return apiClient.post(`/tasks/${taskId}/files`, payload);
  }

  /**
   * Decompose parent task into atomic subtasks
   */
  static async segregateTask(taskId: string, subtasks: SubtaskItem[]): Promise<ApiResponse<any>> {
    const res = await apiClient.post(`/tasks/${taskId}/segregate`, {
      parent_task_id: taskId,
      subtasks,
    });
    if (!res.error) {
      TaskEventBus.emitTaskMutated('segregated', taskId);
    }
    return res;
  }

  /**
   * Fetch a task with its parent, subtasks, and other related entities.
   */
  static async getTaskWithHierarchy(taskId: string): Promise<Task | null> {
    if (!taskId) return null;
    const res = await this.getTaskById(taskId);
    return res.data;
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
    const res = await apiClient.post(`/tasks/${taskId}/activity`, {
      task_id: taskId,
      user_id: userId,
      event_type: eventType,
      metadata,
      project_id: projectId,
      milestone_id: milestoneId,
    });
    return !res.error;
  }

  /**
   * Fetch the activity timeline for a task.
   */
  static async getTaskActivity(taskId: string): Promise<ExecutionActivity[]> {
    const res = await apiClient.get<ExecutionActivity[]>(`/tasks/${taskId}/activity`);
    return res.data || [];
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
    const res = await this.createTask({
      title,
      description,
      priority,
      due_date: dueDate || undefined,
      parent_task_id: parentTaskId,
      milestone_id: milestoneId,
      department_id: departmentId,
      assignee_ids: assigneeId ? [assigneeId] : [],
    });

    if (res.data) {
      await this.logActivity(
        parentTaskId,
        creatorId,
        'subtask_created',
        { subtask_title: title, subtask_id: res.data.id },
        undefined,
        milestoneId
      );
      return res.data;
    }
    return null;
  }
}
