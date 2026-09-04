import { apiClient, UserSession, ApiResponse } from '../api/apiClient';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthStatus {
  authenticated: boolean;
  user: UserSession['user'] | null;
}

export const AuthService = {
  /**
   * Authenticate with email and password
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<UserSession>> {
    const res = await apiClient.post<UserSession>('/auth/login', {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    });

    if (res.data) {
      await apiClient.saveSession(res.data);
    }
    return res;
  },

  /**
   * Log out and revoke refresh token
   */
  async logout(): Promise<ApiResponse<null>> {
    const session = apiClient.getSession();
    if (session?.refresh_token) {
      try {
        await apiClient.post('/auth/logout', { refresh_token: session.refresh_token });
      } catch (e) {
        // Continue local logout even if server fails
      }
    }
    await apiClient.saveSession(null);
    return { data: null, error: null };
  },

  /**
   * Refresh JWT access token using rotation
   */
  async refresh(): Promise<UserSession | null> {
    return apiClient.refreshAccessToken();
  },

  /**
   * Fetch current authenticated user profile
   */
  async getCurrentUser(): Promise<ApiResponse<UserSession['user']>> {
    return apiClient.get<UserSession['user']>('/auth/me');
  },

  /**
   * Change user password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<any>> {
    return apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  /**
   * Request password reset link / email
   */
  async requestPasswordReset(email: string): Promise<ApiResponse<any>> {
    return apiClient.post('/auth/request-password-reset', {
      email: email.trim().toLowerCase(),
    });
  },

  /**
   * Check current auth status
   */
  async getStatus(): Promise<AuthStatus> {
    const session = apiClient.getSession() || (await apiClient.loadStoredSession());
    if (!session?.access_token) {
      return { authenticated: false, user: null };
    }
    const res = await this.getCurrentUser();
    if (res.data) {
      return { authenticated: true, user: res.data };
    }
    return { authenticated: false, user: null };
  },
};
