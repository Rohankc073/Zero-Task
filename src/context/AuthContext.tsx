import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { User as AppUser } from '../types';
import { AuthService } from '../services/auth/AuthService';
import { UserService } from '../services/users/UserService';
import { apiClient, UserSession } from '../services/api/apiClient';

interface AuthProps {
  user: AppUser | any | null;
  session: UserSession | any | null;
  isLoading: boolean;
  profile: AppUser | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthProps>({
  user: null,
  session: null,
  isLoading: true,
  profile: null,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | any | null>(null);
  const [session, setSession] = useState<UserSession | any | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleSession = async (currentSession: UserSession | any | null) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        try {
          // Fetch user profile from UserService
          const { data: profileData } = await UserService.getUserById(currentSession.user.id);

          if (profileData) {
            setProfile(profileData as AppUser);
          } else if (currentSession.user) {
            setProfile(currentSession.user as AppUser);
          }

          const token = await registerForPushNotificationsAsync();
          if (token) {
            await UserService.registerPushToken(token);
          }
        } catch (error) {
          console.log('[AuthContext] Error fetching profile or saving push token:', error);
        }
      } else {
        setProfile(null);
      }

      setIsLoading(false);
    };

    // 1. Initial Session Load
    apiClient.loadStoredSession().then((stored) => {
      handleSession(stored);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, s: any) => {
      handleSession(s);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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

  const signOut = async () => {
    await AuthService.logout();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, profile, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
