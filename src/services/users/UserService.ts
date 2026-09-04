import { apiClient, ApiResponse } from '../api/apiClient';
import { User, Department, Designation } from '../../types';

export interface UserFilterParams {
  department_id?: string;
  role?: string;
  search?: string;
}

export const UserService = {
  /**
   * Fetch users with optional department / role filter
   */
  async getUsers(params: UserFilterParams = {}): Promise<ApiResponse<User[]>> {
    const qp: string[] = [];
    if (params.department_id) qp.push(`department_id=${encodeURIComponent(params.department_id)}`);
    if (params.role) qp.push(`role=${encodeURIComponent(params.role)}`);
    if (params.search) qp.push(`search=${encodeURIComponent(params.search)}`);
    const qs = qp.length > 0 ? `?${qp.join('&')}` : '';

    return apiClient.get<User[]>(`/users${qs}`);
  },

  /**
   * Fetch single user profile by ID
   */
  async getUserById(id: string): Promise<ApiResponse<User>> {
    return apiClient.get<User>(`/users/${id}`);
  },

  /**
   * Update user details (e.g. name, role, department, designation)
   */
  async updateUser(id: string, updates: Partial<User>): Promise<ApiResponse<User>> {
    return apiClient.patch<User>(`/users/${id}`, updates);
  },

  /**
   * Fetch all organizational departments
   */
  async getDepartments(): Promise<ApiResponse<Department[]>> {
    return apiClient.get<Department[]>('/users/departments');
  },

  /**
   * Fetch all designations
   */
  async getDesignations(): Promise<ApiResponse<Designation[]>> {
    return apiClient.get<Designation[]>('/users/designations');
  },

  /**
   * Register push notification token with backend
   */
  async registerPushToken(token: string, platform: string = 'unknown'): Promise<ApiResponse<any>> {
    return apiClient.post('/notifications/push-token', { token, platform });
  },
};

