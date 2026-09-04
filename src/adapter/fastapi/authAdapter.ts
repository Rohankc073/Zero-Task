import { httpClient } from './httpClient';
import {
  AdapterSession,
  AdapterUser,
  AdapterResponse,
  AuthStateChangeCallback,
  AuthChangeEvent,
} from '../types';

export class AuthAdapter {
  private listeners: Set<AuthStateChangeCallback> = new Set();
  private initialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    if (this.initialized) return;
    this.initialized = true;
    const session = await httpClient.loadStoredSession();
    if (session) {
      this.notifyListeners('SIGNED_IN', session);
    }
  }

  private notifyListeners(event: AuthChangeEvent, session: AdapterSession | null) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, session as any);
      } catch (e) {
        console.error('[AuthAdapter] Error in auth listener callback:', e);
      }
    });
  }

  async signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ data: { user: AdapterUser | null; session: AdapterSession | null }; error: any }> {
    const { data, error } = await httpClient.post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      return { data: { user: null, session: null }, error };
    }

    const session: AdapterSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
    };

    await httpClient.saveSession(session);
    this.notifyListeners('SIGNED_IN', session);

    return {
      data: {
        user: session.user,
        session,
      },
      error: null,
    };
  }

  async signOut(): Promise<{ error: any }> {
    const session = httpClient.getSession();
    if (session?.refresh_token) {
      try {
        await httpClient.post('/auth/logout', { refresh_token: session.refresh_token });
      } catch (e) {
        // Continue logging out locally even if server call fails
      }
    }

    await httpClient.saveSession(null);
    this.notifyListeners('SIGNED_OUT', null);

    return { error: null };
  }

  async getSession(): Promise<{ data: { session: AdapterSession | null }; error: any }> {
    let session = httpClient.getSession();
    if (!session) {
      session = await httpClient.loadStoredSession();
    }
    return { data: { session }, error: null };
  }

  async getUser(): Promise<{ data: { user: AdapterUser | null }; error: any }> {
    const session = httpClient.getSession() || (await httpClient.loadStoredSession());
    return { data: { user: session?.user || null }, error: null };
  }

  async updateUser(attributes: {
    password?: string;
    data?: Partial<AdapterUser>;
  }): Promise<{ data: { user: AdapterUser | null }; error: any }> {
    const session = httpClient.getSession();
    if (!session?.user) {
      return { data: { user: null }, error: { message: 'Not authenticated' } };
    }

    if (attributes.password) {
      const { error } = await httpClient.post('/auth/change-password', {
        current_password: '', // Handled by administrative or self reset
        new_password: attributes.password,
      });
      if (error) return { data: { user: null }, error };
    }

    if (attributes.data) {
      const { data, error } = await httpClient.patch(`/users/${session.user.id}`, attributes.data);
      if (error) return { data: { user: null }, error };

      session.user = { ...session.user, ...data };
      await httpClient.saveSession(session);
      this.notifyListeners('USER_UPDATED', session);
    }

    return { data: { user: session.user }, error: null };
  }

  onAuthStateChange(callback: AuthStateChangeCallback): {
    data: { subscription: { unsubscribe: () => void } };
  } {
    this.listeners.add(callback);

    // Initial trigger if session already loaded
    const current = httpClient.getSession();
    if (current) {
      setTimeout(() => callback('SIGNED_IN', current as any), 0);
    }

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners.delete(callback);
          },
        },
      },
    };
  }
}

export const authAdapter = new AuthAdapter();
