import { apiClient, ApiResponse } from '../api/apiClient';

export interface PasswordResetItem {
  id: string;
  email: string;
  requester_id?: string;
  requester_name?: string;
  requester_role?: string;
  approver_id?: string;
  approver_name?: string;
  company_id?: string;
  company_name?: string;
  department_name?: string;
  status: 'Pending' | 'Approved' | 'Completed' | 'Rejected' | 'Expired';
  rejection_reason?: string;
  created_at: string;
  approved_at?: string;
  completed_at?: string;
  expires_at?: string;
}

export interface PasswordResetRequestResult {
  status: string;
  message: string;
  target_role?: string;
  approver_role?: string;
  request_id?: string;
  created_at?: string;
}

export class PasswordResetService {
  /**
   * Submit a password reset request
   */
  static async requestPasswordReset(email: string): Promise<ApiResponse<PasswordResetRequestResult>> {
    return apiClient.post<PasswordResetRequestResult>('/auth/password-reset/request', {
      email: email.trim().toLowerCase(),
    });
  }

  /**
   * Check status of user's own active request
   */
  static async getMyRequestStatus(email: string): Promise<ApiResponse<PasswordResetItem>> {
    return apiClient.get<PasswordResetItem>(
      `/auth/password-reset/my-request?email=${encodeURIComponent(email.trim().toLowerCase())}`
    );
  }

  /**
   * List password reset requests for authorized approver (Founder / Super Admin)
   */
  static async listRequests(statusFilter?: string): Promise<ApiResponse<PasswordResetItem[]>> {
    const qs = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : '';
    return apiClient.get<PasswordResetItem[]>(`/auth/password-reset/requests${qs}`);
  }

  /**
   * Get single request details
   */
  static async getRequest(requestId: string): Promise<ApiResponse<PasswordResetItem>> {
    return apiClient.get<PasswordResetItem>(`/auth/password-reset/requests/${requestId}`);
  }

  /**
   * Approve a password reset request
   */
  static async approveRequest(requestId: string): Promise<ApiResponse<{ status: string; message: string }>> {
    return apiClient.post<{ status: string; message: string }>(`/auth/password-reset/requests/${requestId}/approve`);
  }

  /**
   * Reject a password reset request
   */
  static async rejectRequest(
    requestId: string,
    reason?: string
  ): Promise<ApiResponse<{ status: string; message: string }>> {
    return apiClient.post<{ status: string; message: string }>(`/auth/password-reset/requests/${requestId}/reject`, {
      reason,
    });
  }

  /**
   * Establish new password and complete reset (revoking previous sessions)
   */
  static async completeReset(
    requestId: string,
    newPassword: string
  ): Promise<ApiResponse<{ status: string; message: string }>> {
    return apiClient.post<{ status: string; message: string }>(`/auth/password-reset/requests/${requestId}/complete`, {
      new_password: newPassword,
    });
  }
}
