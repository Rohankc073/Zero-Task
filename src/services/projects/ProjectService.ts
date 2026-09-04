import { apiClient, ApiResponse } from '../api/apiClient';
import { Project, ProjectMilestone, Task } from '../../types';

export class ProjectService {
  /**
   * Fetch all projects
   */
  static async getProjects(): Promise<ApiResponse<Project[]>> {
    return apiClient.get<Project[]>('/projects');
  }

  /**
   * Create a new project
   */
  static async createProject(payload: { name: string; description?: string; department_id?: string }): Promise<ApiResponse<Project>> {
    return apiClient.post<Project>('/projects', payload);
  }

  /**
   * Fetch a project with its milestones and tasks.
   */
  static async getProjectDetails(projectId: string): Promise<{ project: Project | null; milestones: ProjectMilestone[]; tasks: Task[] }> {
    const projRes = await apiClient.get<Project>(`/projects/${projectId}`);
    const tasksRes = await apiClient.get<Task[]>(`/tasks?project_id=${encodeURIComponent(projectId)}`);

    return {
      project: projRes.data,
      milestones: [],
      tasks: tasksRes.data || [],
    };
  }

  /**
   * Create a new milestone for a project
   */
  static async createMilestone(
    projectId: string,
    title: string,
    description: string,
    dueDate: string,
    creatorId: string
  ): Promise<ProjectMilestone | null> {
    const res = await apiClient.post<ProjectMilestone>(`/projects/${projectId}/milestones`, {
      title,
      description: description || null,
      due_date: dueDate || null,
      created_by: creatorId,
      owner_id: creatorId,
    });
    return res.data;
  }
}
