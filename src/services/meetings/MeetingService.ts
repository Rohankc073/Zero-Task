import { apiClient, ApiResponse } from '../api/apiClient';
import { Meeting } from '../../types';

export interface CreateMeetingPayload {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  location?: string;
  meeting_url?: string;
  participant_ids?: string[];
  company_id?: string | null;
}

export interface UpdateMeetingPayload {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  meeting_url?: string;
  status?: string;
}

export const MeetingService = {
  /**
   * Fetch meetings with optional date / status filtering
   */
  async getMeetings(params: { status?: string; start_date?: string; end_date?: string } = {}): Promise<ApiResponse<Meeting[]>> {
    const qp: string[] = [];
    if (params.status) qp.push(`status=${encodeURIComponent(params.status)}`);
    if (params.start_date) qp.push(`start_date=${encodeURIComponent(params.start_date)}`);
    if (params.end_date) qp.push(`end_date=${encodeURIComponent(params.end_date)}`);
    const qs = qp.length > 0 ? `?${qp.join('&')}` : '';

    return apiClient.get<Meeting[]>(`/meetings${qs}`);
  },

  /**
   * Fetch single meeting details
   */
  async getMeetingById(id: string): Promise<ApiResponse<Meeting>> {
    return apiClient.get<Meeting>(`/meetings/${id}`);
  },

  /**
   * Schedule a new meeting
   */
  async createMeeting(payload: CreateMeetingPayload): Promise<ApiResponse<Meeting>> {
    return apiClient.post<Meeting>('/meetings', payload);
  },

  /**
   * Reschedule or update a meeting
   */
  async updateMeeting(id: string, payload: UpdateMeetingPayload): Promise<ApiResponse<Meeting>> {
    return apiClient.patch<Meeting>(`/meetings/${id}`, payload);
  },

  /**
   * Cancel a meeting
   */
  async cancelMeeting(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/meetings/${id}`);
  },

  /**
   * Process meeting approval (Approve / Reject) with reason
   */
  async processMeetingApproval(meetingId: string, decision: 'Approved' | 'Rejected', reason?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/meetings/${meetingId}/approval`, {
      action: decision,
      decision_reason: reason,
    });
  },

  /**
   * Fetch eligible meeting participants strictly filtered by role hierarchy and company isolation
   */
  async getEligibleParticipants(): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>('/meetings/eligible-participants');
  },
};
