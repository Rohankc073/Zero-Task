import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User as AppUser } from '../types';
import { AuthService, LoginCredentials } from '../services/auth/AuthService';
import { UserService } from '../services/users/UserService';
import { apiClient, UserSession } from '../services/api/apiClient';
import { httpClient } from '../adapter/fastapi/httpClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationService } from '../services/notifications/NotificationService';
import { getNotificationsModule } from '../lib/notifications';

export interface AuthProps {
  user: AppUser | any | null;
  session: UserSession | any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: AppUser | null;
  signIn: (credentials: LoginCredentials) => Promise<{ error: any; data?: UserSession }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthProps>({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  profile: null,
  signIn: async () => ({ error: { message: 'AuthContext not initialized' } }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | any | null>(null);
  const [session, setSession] = useState<UserSession | any | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Synchronously and atomically update user/profile/session in memory
  const applySession = useCallback(async (currentSession: UserSession | any | null) => {
    if (currentSession?.user && currentSession?.access_token) {
      const authUser = currentSession.user;
      setSession(currentSession);
      setUser(authUser);
      
      // Immediately set the profile from currentSession.user so that router auth guards
      // react synchronously without being blocked on secondary network requests.
      setProfile((prevProfile) => {
        if (prevProfile && prevProfile.id === authUser.id) {
          return { ...authUser, ...prevProfile };
        }
        return authUser as AppUser;
      });
      setIsLoading(false);

      // In the background, enrich profile with full department/designation data if available
      try {
        const { data: profileData } = await UserService.getUserById(authUser.id);
        if (profileData) {
          setProfile(profileData as AppUser);
        }
      } catch (error) {
        console.warn('[AuthContext] Background profile enrichment note:', error);
      }
    } else {
      setSession(null);
      setUser(null);
      setProfile(null);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Initial bootstrap from persistent storage
    apiClient.loadStoredSession().then((stored) => {
      applySession(stored);
    }).catch(() => {
      setIsLoading(false);
    });

    // 2. Subscribe to live auth state events from the HTTP/API client layer
    const unsubscribe = httpClient.addAuthStateListener((event, newSession) => {
      applySession(newSession as any);
    });

    return () => {
      unsubscribe();
    };
  }, [applySession]);

  const signIn = async (credentials: LoginCredentials) => {
    try {
      console.log('[AUTH] AUTH_LOGIN_START', { email: credentials.email });
      setIsLoading(true);
      const res = await AuthService.login(credentials);
      if (res.error || !res.data) {
        console.log('[AUTH] AUTH_LOGIN_API_FAILURE', { error: res.error?.message });
        setIsLoading(false);
        return { error: res.error || { message: 'Invalid credentials' } };
      }

      console.log('[AUTH] AUTH_LOGIN_API_SUCCESS', { userId: res.data.user?.id, role: res.data.user?.role });
      const newSession = res.data;
      
      // Sync into both clients immediately (persists to AsyncStorage)
      await apiClient.saveSession(newSession);
      await httpClient.saveSession(newSession as any);
      console.log('[AUTH] AUTH_TOKEN_PERSISTED');

      // Atomically apply to in-memory state
      await applySession(newSession);
      console.log('[AUTH] AUTH_STATE_UPDATED', { isAuthenticated: true, userId: newSession.user?.id });
      console.log('[AUTH] AUTH_NAVIGATION_READY');
      console.log('[AUTH] AUTH_LOGIN_COMPLETE');

      return { error: null, data: newSession };
    } catch (err: any) {
      console.error('[AUTH] AUTH_LOGIN_EXCEPTION', { message: err.message });
      setIsLoading(false);
      return { error: { message: err.message || 'Login failed' } };
    }
  };

  const signOut = async () => {
    // 1. Unregister push tokens from backend so no push notifications arrive after logout
    try {
      await NotificationService.unregisterPushToken();
    } catch (pushErr) {
      console.warn('[AuthContext] Error unregistering push token:', pushErr);
    }

    // 2. Dismiss any active notifications from device tray
    try {
      const Notifications = getNotificationsModule();
      if (Notifications?.dismissAllNotificationsAsync) {
        await Notifications.dismissAllNotificationsAsync();
      }
    } catch (notifErr) {
      console.warn('[AuthContext] Error dismissing notifications:', notifErr);
    }

    try {
      await AuthService.logout();
    } catch (e) {
      console.warn('[AuthContext] Error in AuthService.logout:', e);
    }
    // Clear all task and dashboard caches to guarantee no cross-account leakage
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(
        (k) =>
          k.startsWith('@zerotask_dashboard_tasks_') ||
          k.startsWith('@zerotask_tasks_cache_') ||
          k.startsWith('projects_cache_')
      );
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (e) {
      console.warn('[AuthContext] Error clearing cache keys on logout:', e);
    }
    await apiClient.saveSession(null);
    await httpClient.saveSession(null);
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsLoading(false);
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    try {
      const { data: profileData } = await UserService.getUserById(user.id);
      if (profileData) {
        setProfile(profileData as AppUser);
      }
    } catch (error) {
      console.log('[AuthContext] Error refreshing profile:', error);
    }
  };

  const isAuthenticated = !!(session && user);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated,
        profile,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
