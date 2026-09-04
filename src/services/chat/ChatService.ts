import { apiClient, ApiResponse } from '../api/apiClient';

export interface ChatChannel {
  id: string;
  name: string;
  type: 'public' | 'department' | 'management' | 'direct';
  department_id?: string | null;
  company_id: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at: string;
  user?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  };
}

export const ChatService = {
  /**
   * Fetch all channels accessible to current user
   */
  async getChannels(): Promise<ApiResponse<ChatChannel[]>> {
    return apiClient.get<ChatChannel[]>('/chat/channels');
  },

  /**
   * Fetch message history for a channel
   */
  async getMessages(channelId: string, limit = 50, before?: string): Promise<ApiResponse<ChatMessage[]>> {
    const qp = [`limit=${limit}`];
    if (before) qp.push(`before=${encodeURIComponent(before)}`);
    return apiClient.get<ChatMessage[]>(`/chat/channels/${channelId}/messages?${qp.join('&')}`);
  },

  /**
   * Post a message to a channel
   */
  async sendMessage(
    channelId: string,
    content: string,
    attachment?: { url: string; name: string }
  ): Promise<ApiResponse<ChatMessage>> {
    return apiClient.post<ChatMessage>(`/chat/channels/${channelId}/messages`, {
      content,
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
    });
  },

  /**
   * Get or create a direct 1:1 chat channel with a target user
   */
  async getOrCreateDirectChannel(targetUserId: string): Promise<ApiResponse<ChatChannel>> {
    return apiClient.post<ChatChannel>('/chat/direct', {
      target_user_id: targetUserId,
    });
  },

  /**
   * Subscribe to real-time chat messages across channels
   */
  subscribeToMessages(callback: (message: ChatMessage) => void): () => void {
    return apiClient.subscribeWebSocket((event, payload) => {
      if (event === 'NEW_MESSAGE' || event === 'chat_message') {
        const msg = payload.record || payload;
        callback(msg);
      }
    });
  },
};
