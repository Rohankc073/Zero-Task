import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl, getWsUrl } from '../../adapter/config';
import { httpClient } from '../../adapter/fastapi/httpClient';

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
    // Synchronize in-memory session whenever httpClient changes state
    httpClient.addAuthStateListener((event, session) => {
      this.currentSession = session as any;
    });
  }

  async loadStoredSession(): Promise<UserSession | null> {
    try {
      const data = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (data) {
        this.currentSession = JSON.parse(data);
        if (!httpClient.getSession()) {
          await httpClient.loadStoredSession();
        }
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

    // Keep httpClient in sync without infinite recursion
    if (httpClient.getSession() !== (session as any)) {
      await httpClient.saveSession(session as any);
    }
  }

  getSession(): UserSession | null {
    return (httpClient.getSession() as any) || this.currentSession;
  }

  getAccessToken(): string | null {
    return httpClient.getAccessToken() || this.currentSession?.access_token || null;
  }

  getCurrentUser() {
    return httpClient.getSession()?.user || this.currentSession?.user || null;
  }

  private onTokenRefreshed(session: UserSession | null) {
    this.refreshSubscribers.forEach((cb) => cb(session));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (session: UserSession | null) => void) {
    this.refreshSubscribers.push(cb);
  }

  async refreshAccessToken(): Promise<UserSession | null> {
    const res = await httpClient.refreshAccessToken();
    if (res) {
      this.currentSession = res as any;
      return this.currentSession;
    }
    return null;
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
      'bypass-tunnel-reminder': 'true',
      ...(options.headers as Record<string, string>),
    };

    if (!this.getAccessToken()) {
      await this.loadStoredSession();
      if (!this.getAccessToken()) {
        await httpClient.loadStoredSession();
      }
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

      if (response.status === 401 && !isRetry && this.currentSession?.refresh_token) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.request<T>(endpoint, options, true);
        }
      }

      // Handle transient 502/503/504 Bad Gateway / Service Unavailable blips from tunnel
      if ((response.status === 502 || response.status === 503 || response.status === 504) && (typeof isRetry === 'number' ? isRetry < 2 : !isRetry)) {
        const nextRetry = typeof isRetry === 'number' ? isRetry + 1 : 1;
        await new Promise(r => setTimeout(r, 600 * nextRetry));
        return this.request<T>(endpoint, options, nextRetry as any);
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

  /**
   * Uploads raw binary data (ArrayBuffer | Uint8Array) to the FastAPI /storage/upload endpoint.
   * This bypasses Supabase Storage entirely; files go to MinIO via FastAPI.
   * @param bucket  - MinIO bucket name (e.g. 'task-attachments', 'task-audio')
   * @param storagePath - Path within bucket (e.g. 'company_id/task_id/filename.pdf')
   * @param data    - Raw binary data
   * @param mimeType - Content-Type of the file
   * @param fileName - Original file name (for server-side naming fallback)
   */
  async uploadBinary(
    bucket: string,
    storagePath: string,
    data: ArrayBuffer | Uint8Array,
    mimeType: string,
    fileName?: string
  ): Promise<ApiResponse<{ storage_path: string; file_url?: string; message?: string }>> {
    const baseUrl = getApiUrl();
    const params = new URLSearchParams({ bucket, storage_path: storagePath });
    if (fileName) params.set('file_name', fileName);
    const url = `${baseUrl}/storage/upload?${params.toString()}`;

    if (!this.getAccessToken()) {
      await this.loadStoredSession();
      if (!this.getAccessToken()) {
        await httpClient.loadStoredSession();
      }
    }
    const token = this.getAccessToken();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType || 'application/octet-stream',
          'bypass-tunnel-reminder': 'true',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: (data instanceof Uint8Array ? data.buffer.slice(0) : data) as ArrayBuffer,
      });

      if (!response.ok) {
        let errMessage = `Upload HTTP ${response.status}: ${response.statusText}`;
        try {
          const errBody = await response.json();
          errMessage = errBody.detail || errBody.message || errMessage;
        } catch { /* non-json response */ }
        return { data: null, error: { message: errMessage, status: response.status, code: `HTTP_${response.status}` } };
      }

      if (response.status === 204) {
        return { data: { storage_path: storagePath }, error: null };
      }

      const respData = await response.json();
      return { data: respData, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'Upload failed', code: 'NETWORK_ERROR' } };
    }
  }

  /**
   * Uploads a file directly from a local URI (file:// or absolute path) to FastAPI /storage/upload.
   * On mobile (iOS / Android), streams binary using FileSystem.uploadAsync (native OkHttp / NSURLSession).
   * On Web / test runner, falls back to fetch with ArrayBuffer / Blob.
   */
  async uploadFileUri(
    bucket: string,
    storagePath: string,
    fileUri: string,
    mimeType: string,
    fileName?: string
  ): Promise<ApiResponse<{ storage_path: string; file_url?: string; message?: string }>> {
    const baseUrl = getApiUrl();
    const params = new URLSearchParams({ bucket, storage_path: storagePath });
    if (fileName) params.set('file_name', fileName);
    const url = `${baseUrl}/storage/upload?${params.toString()}`;

    if (!this.getAccessToken()) {
      await this.loadStoredSession();
      if (!this.getAccessToken()) {
        await httpClient.loadStoredSession();
      }
    }
    const token = this.getAccessToken();

    // Strategy 1: Native FileSystem.uploadAsync (Best for Mobile Android/iOS)
    try {
      const FileSystem = require('expo-file-system/legacy');
      if (FileSystem && typeof FileSystem.uploadAsync === 'function') {
        const normalizedUri = fileUri.startsWith('/') ? `file://${fileUri}` : fileUri;
        const uploadType = FileSystem.FileSystemUploadType?.BINARY_CONTENT ?? 0;
        const uploadRes = await FileSystem.uploadAsync(url, normalizedUri, {
          httpMethod: 'POST',
          uploadType,
          headers: {
            'Content-Type': mimeType || 'application/octet-stream',
            'bypass-tunnel-reminder': 'true',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (uploadRes.status >= 200 && uploadRes.status < 300) {
          let respData: any = { storage_path: storagePath };
          try {
            if (uploadRes.body) {
              respData = JSON.parse(uploadRes.body);
            }
          } catch {}
          return { data: respData, error: null };
        } else {
          console.warn(`[apiClient] FileSystem.uploadAsync returned ${uploadRes.status}, attempting ArrayBuffer fallback...`);
        }
      }
    } catch (fsErr: any) {
      console.warn('[apiClient] FileSystem.uploadAsync fallback:', fsErr?.message || fsErr);
    }

    // Strategy 2: ArrayBuffer read via readFileAsArrayBuffer (Robust for Mobile base64 & Web)
    try {
      const { readFileAsArrayBuffer } = require('../../utils/attachmentPipeline');
      const buffer = await readFileAsArrayBuffer(fileUri);
      return await this.uploadBinary(bucket, storagePath, buffer, mimeType, fileName);
    } catch (readErr: any) {
      // Strategy 3: Standard fetch ArrayBuffer fallback
      try {
        const response = await fetch(fileUri);
        const buffer = await response.arrayBuffer();
        return await this.uploadBinary(bucket, storagePath, buffer, mimeType, fileName);
      } catch (err: any) {
        return { data: null, error: { message: readErr?.message || err?.message || 'File upload failed', code: 'UPLOAD_ERROR' } };
      }
    }
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
