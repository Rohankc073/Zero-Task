import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { User as AppUser } from '../types';

interface AuthProps {
  user: SupabaseUser | null;
  session: Session | null;
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
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleSession = async (currentSession: Session | null) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      if (currentSession?.user) {
        try {
          // Fetch user profile
          const { data: profileData } = await supabase
            .from('users')
            .select('*')
            .eq('id', currentSession.user.id)
            .single();
            
          if (profileData) {
            setProfile(profileData as AppUser);
          }

          const token = await registerForPushNotificationsAsync();
          if (token) {
            await supabase
              .from('users')
              .update({ push_token: token })
              .eq('id', currentSession.user.id);
          }
        } catch (error) {
          console.log('Error fetching profile or saving push token:', error);
        }
      } else {
        setProfile(null);
      }
      
      setIsLoading(false);
    };

    // 1. Initial Session Load (prevents flash of login screen)
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (!user?.id) return;
    try {
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (profileData) {
        setProfile(profileData as AppUser);
      }
    } catch (error) {
      console.log('Error refreshing profile:', error);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, profile, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
