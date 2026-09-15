import { httpClient } from '../../adapter/fastapi/httpClient';
import { ApiResponse } from '../api/apiClient';

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  user?: {
    id: string;
    full_name?: string;
    email?: string;
    avatar_url?: string;
    role?: string;
  };
}

export const CommentService = {
  async getComments(taskId: string): Promise<ApiResponse<TaskComment[]>> {
    return httpClient.get<TaskComment[]>(`/tasks/${taskId}/comments`) as any;
  },

  async addComment(taskId: string, content: string): Promise<ApiResponse<TaskComment>> {
    return httpClient.post<TaskComment>(`/tasks/${taskId}/comments`, { content }) as any;
  },

  async updateComment(taskId: string, commentId: string, content: string): Promise<ApiResponse<TaskComment>> {
    return httpClient.patch<TaskComment>(`/tasks/${taskId}/comments/${commentId}`, { content }) as any;
  },

  async deleteComment(taskId: string, commentId: string): Promise<ApiResponse<any>> {
    return httpClient.delete(`/tasks/${taskId}/comments/${commentId}`) as any;
  },
};
