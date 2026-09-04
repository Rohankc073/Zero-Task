import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl, getWsUrl } from '../../adapter/config';

export const SESSION_STORAGE_KEY = '@zerotask_self_hosted_session';

export interface UserSession {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  user: {
    id: string;
    email: string;
    name?: string | null;
    full_name?: string | null;
    role: string;
    company_id?: string | null;
    department_id?: string | null;
    designation_id?: string | null;
    is_approved: boolean;
    is_active: boolean;
    avatar_url?: string | null;
    app_metadata?: Record<string, any>;
    user_metadata?: Record<string, any>;
  };
}

export interface ApiResponse<T = any> {
  data: T | null;
  error: { message: string; code?: string; status?: number } | null;
  count?: number | null;
}

export type WebSocketEventHandler = (event: string, payload: any) => void;

class ApiClient {
  private currentSession: UserSession | null = null;
  private isRefreshing = false;
  private refreshSubscribers: Array<(session: UserSession | null) => void> = [];
  private ws: WebSocket | null = null;
  private wsHandlers: Set<WebSocketEventHandler> = new Set();
  private wsPingInterval: any = null;
  private wsReconnectTimeout: any = null;
  private isWsConnecting = false;

  constructor() {
    this.loadStoredSession();
  }

  async loadStoredSession(): Promise<UserSession | null> {
    try {
      const data = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (data) {
        this.currentSession = JSON.parse(data);
        return this.currentSession;
      }
    } catch (e) {
      console.warn('[ApiClient] Failed to load stored session:', e);
    }
    return null;
  }

  async saveSession(session: UserSession | null): Promise<void> {
    this.currentSession = session;
    try {
      if (session) {
        await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('[ApiClient] Failed to persist session:', e);
    }
  }

  getSession(): UserSession | null {
    return this.currentSession;
  }

  getAccessToken(): string | null {
    return this.currentSession?.access_token || null;
  }

  getCurrentUser() {
    return this.currentSession?.user || null;
  }

  private onTokenRefreshed(session: UserSession | null) {
    this.refreshSubscribers.forEach((cb) => cb(session));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (session: UserSession | null) => void) {
    this.refreshSubscribers.push(cb);
  }

  async refreshAccessToken(): Promise<UserSession | null> {
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
      const newSession: UserSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      };

      await this.saveSession(newSession);
      this.onTokenRefreshed(newSession);
      return newSession;
    } catch (err) {
      console.error('[ApiClient] Token refresh failed:', err);
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
  ): Promise<ApiResponse<T>> {
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
          // non-json response
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

  // -------------------------------------------------------------
  // WebSocket Lifecycle & Subscriptions
  // -------------------------------------------------------------
  subscribeWebSocket(handler: WebSocketEventHandler): () => void {
    this.wsHandlers.add(handler);
    this.ensureWebSocketConnection();
    return () => {
      this.wsHandlers.delete(handler);
    };
  }

  sendWebSocketMessage(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {
        console.warn('[ApiClient] Failed to send WebSocket message:', e);
      }
    }
  }

  private ensureWebSocketConnection() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = this.getAccessToken();
    if (!token) return;

    if (this.isWsConnecting) return;
    this.isWsConnecting = true;

    const wsUrl = `${getWsUrl()}?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isWsConnecting = false;
        this.startWsHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.action === 'pong') return;
          this.wsHandlers.forEach((handler) => {
            try {
              handler(msg.event || 'message', msg.payload || msg.data || msg);
            } catch (e) {
              console.error('[ApiClient] Error in WebSocket event handler:', e);
            }
          });
        } catch (e) {
          // ignore non-json
        }
      };

      this.ws.onerror = () => {
        this.isWsConnecting = false;
      };

      this.ws.onclose = () => {
        this.isWsConnecting = false;
        this.stopWsHeartbeat();
        this.scheduleWsReconnect();
      };
    } catch (e) {
      this.isWsConnecting = false;
      this.scheduleWsReconnect();
    }
  }

  private scheduleWsReconnect() {
    if (this.wsReconnectTimeout) clearTimeout(this.wsReconnectTimeout);
    this.wsReconnectTimeout = setTimeout(() => {
      if (this.wsHandlers.size > 0) {
        this.ensureWebSocketConnection();
      }
    }, 5000);
  }

  private startWsHeartbeat() {
    this.stopWsHeartbeat();
    this.wsPingInterval = setInterval(() => {
      this.sendWebSocketMessage({ action: 'ping' });
    }, 25000);
  }

  private stopWsHeartbeat() {
    if (this.wsPingInterval) {
      clearInterval(this.wsPingInterval);
      this.wsPingInterval = null;
    }
  }
}

export const apiClient = new ApiClient();
