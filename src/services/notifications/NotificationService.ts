import { apiClient, ApiResponse } from '../api/apiClient';

export interface InAppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  metadata?: Record<string, any>;
  created_at: string;
}

export const NotificationService = {
  /**
   * Fetch in-app notifications
   */
  async getNotifications(params: { unread_only?: boolean; limit?: number } = {}): Promise<ApiResponse<InAppNotification[]>> {
    const qp: string[] = [];
    if (params.unread_only) qp.push('unread_only=true');
    if (params.limit) qp.push(`limit=${params.limit}`);
    const qs = qp.length > 0 ? `?${qp.join('&')}` : '';

    return apiClient.get<InAppNotification[]>(`/notifications${qs}`);
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
    return apiClient.get<{ count: number }>('/notifications/unread-count');
  },

  /**
   * Mark a single notification as read
   */
  async markAsRead(id: string): Promise<ApiResponse<any>> {
    return apiClient.patch(`/notifications/${id}/read`);
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<ApiResponse<any>> {
    return apiClient.patch('/notifications/read-all');
  },

  /**
   * Register push notification token with backend
   */
  async registerPushToken(token: string, platform: string = 'unknown'): Promise<ApiResponse<any>> {
    return apiClient.post('/notifications/push-token', {
      token,
      platform,
    });
  },

  /**
   * Subscribe to real-time notification alerts
   */
  subscribeToNotifications(callback: (notification: InAppNotification) => void): () => void {
    return apiClient.subscribeWebSocket((event, payload) => {
      if (event === 'NEW_NOTIFICATION' || event === 'notification') {
        const notif = payload.record || payload;
        callback(notif);
      }
    });
  },
};

