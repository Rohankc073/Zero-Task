import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl } from '../config';
import { AdapterSession, AdapterResponse } from '../types';

export const SESSION_STORAGE_KEY = '@zerotask_self_hosted_session';

class HttpClient {
  private currentSession: AdapterSession | null = null;
  private isRefreshing: boolean = false;
  private refreshSubscribers: Array<(session: AdapterSession | null) => void> = [];

  async loadStoredSession(): Promise<AdapterSession | null> {
    try {
      const data = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (data) {
        this.currentSession = JSON.parse(data);
        return this.currentSession;
      }
    } catch (e) {
      console.warn('[Adapter HttpClient] Failed to load stored session:', e);
    }
    return null;
  }

  async saveSession(session: AdapterSession | null): Promise<void> {
    this.currentSession = session;
    try {
      if (session) {
        await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('[Adapter HttpClient] Failed to persist session:', e);
    }
  }

  getSession(): AdapterSession | null {
    return this.currentSession;
  }

  getAccessToken(): string | null {
    return this.currentSession?.access_token || null;
  }

  private onTokenRefreshed(session: AdapterSession | null) {
    this.refreshSubscribers.forEach((cb) => cb(session));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (session: AdapterSession | null) => void) {
    this.refreshSubscribers.push(cb);
  }

  async refreshAccessToken(): Promise<AdapterSession | null> {
    const refreshToken = this.currentSession?.refresh_token;
    if (!refreshToken) {
      await this.saveSession(null);
      return null;
    }

    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.addRefreshSubscriber(resolve);
      });
    }

    this.isRefreshing = true;

    try {
      const url = `${getApiUrl()}/auth/refresh`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        await this.saveSession(null);
        this.onTokenRefreshed(null);
        return null;
      }

      const data = await res.json();
      const newSession: AdapterSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      };

      await this.saveSession(newSession);
      this.onTokenRefreshed(newSession);
      return newSession;
    } catch (err) {
      console.error('[Adapter HttpClient] Token refresh failed:', err);
      await this.saveSession(null);
      this.onTokenRefreshed(null);
      return null;
    } finally {
      this.isRefreshing = false;
    }
  }

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<AdapterResponse<T>> {
    const baseUrl = getApiUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 401 Unauthorized with token refresh and retry
      if (response.status === 401 && !isRetry && this.currentSession?.refresh_token) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.request<T>(endpoint, options, true);
        }
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errBody = await response.json();
          errMessage = errBody.detail || errBody.message || errMessage;
        } catch {
          // ignore non-json error responses
        }
        return {
          data: null,
          error: {
            message: errMessage,
            status: response.status,
            code: `HTTP_${response.status}`,
          },
        };
      }

      // 204 No Content
      if (response.status === 204) {
        return { data: null, error: null };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: {
          message: err?.message || 'Network request failed',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  get<T = any>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  post<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  patch<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  put<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  delete<T = any>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }
}

export const httpClient = new HttpClient();
