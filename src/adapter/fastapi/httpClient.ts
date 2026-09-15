import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl } from '../config';
import { AdapterSession, AdapterResponse } from '../types';

export const SESSION_STORAGE_KEY = '@zerotask_self_hosted_session';

class HttpClient {
  private currentSession: AdapterSession | null = null;
  private isRefreshing: boolean = false;
  private refreshSubscribers: Array<(session: AdapterSession | null) => void> = [];
  private authStateListeners: Set<(event: 'SIGNED_IN' | 'SIGNED_OUT', session: AdapterSession | null) => void> = new Set();

  constructor() {
    this.loadStoredSession();
  }

  setAuthStateListener(listener: (event: 'SIGNED_IN' | 'SIGNED_OUT', session: AdapterSession | null) => void) {
    this.authStateListeners.add(listener);
  }

  addAuthStateListener(listener: (event: 'SIGNED_IN' | 'SIGNED_OUT', session: AdapterSession | null) => void): () => void {
    this.authStateListeners.add(listener);
    return () => {
      this.authStateListeners.delete(listener);
    };
  }

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

    this.authStateListeners.forEach((listener) => {
      try {
        listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
      } catch (err) {
        console.error('[Adapter HttpClient] Error in authStateListener:', err);
      }
    });
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

  private refreshPromise: Promise<AdapterSession | null> | null = null;

  async refreshAccessToken(): Promise<AdapterSession | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.currentSession?.refresh_token;
    if (!refreshToken) {
      return null;
    }

    this.refreshPromise = (async () => {
      try {
        const url = `${getApiUrl()}/auth/refresh`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!res.ok) {
          if (res.status === 401) {
            console.log('[Adapter HttpClient] Refresh token expired or revoked, clearing session');
            await this.saveSession(null);
            this.onTokenRefreshed(null);
          }
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
        console.error('[Adapter HttpClient] Token refresh network error:', err);
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
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
      'bypass-tunnel-reminder': 'true',
      ...(options.headers as Record<string, string>),
    };

    if (!this.currentSession) {
      await this.loadStoredSession();
    }

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

      // Handle transient 502/503/504 Bad Gateway blips from localtunnel/ngrok/proxies
      if ((response.status === 502 || response.status === 503 || response.status === 504) && (typeof isRetry === 'number' ? isRetry < 2 : !isRetry)) {
        const nextRetry = typeof isRetry === 'number' ? isRetry + 1 : 1;
        await new Promise((resolve) => setTimeout(resolve, 400 * nextRetry));
        return this.request<T>(endpoint, options, nextRetry as any);
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errBody = await response.json();
          if (errBody) {
            if (typeof errBody.detail === 'string') {
              errMessage = errBody.detail;
            } else if (Array.isArray(errBody.detail)) {
              errMessage = errBody.detail
                .map((d: any) => (d.loc ? `${d.loc.slice(1).join('.')}: ` : '') + (d.msg || JSON.stringify(d)))
                .join('; ');
            } else if (typeof errBody.message === 'string') {
              errMessage = errBody.message;
            } else if (typeof errBody === 'string') {
              errMessage = errBody;
            } else {
              errMessage = JSON.stringify(errBody);
            }
          }
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
      const errMsg = String(err?.message || '').toLowerCase();
      const isTransientNet = errMsg.includes('fetch failed') || errMsg.includes('network') || errMsg.includes('connect');
      if (isTransientNet && (typeof isRetry === 'number' ? isRetry < 2 : !isRetry)) {
        const nextRetry = typeof isRetry === 'number' ? isRetry + 1 : 1;
        await new Promise((resolve) => setTimeout(resolve, 500 * nextRetry));
        return this.request<T>(endpoint, options, nextRetry as any);
      }

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
