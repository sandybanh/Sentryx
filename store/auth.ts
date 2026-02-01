import { create } from 'zustand';
import { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase, removePushToken, isSupabaseConfigured } from '@/lib/supabase';
import { registerForPushNotifications } from '@/lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_TOKEN_KEY = 'push_token';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    // If Supabase not configured, just mark as initialized
    if (!isSupabaseConfigured) {
      console.log('Running in demo mode - Supabase not configured');
      set({ isInitialized: true });
      return;
    }

    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        set({
          session,
          user: session.user,
          isInitialized: true,
        });

        // Register for push notifications after auth
        const token = await registerForPushNotifications();
        if (token) {
          await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
        }
      } else {
        set({ isInitialized: true });
      }

      // Listen for auth state changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        set({
          session,
          user: session?.user ?? null,
        });

        if (event === 'SIGNED_IN' && session) {
          const token = await registerForPushNotifications();
          if (token) {
            await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
          }
        }

        if (event === 'SIGNED_OUT') {
          const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
          if (token) {
            await removePushToken(token);
            await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
          }
        }
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ isInitialized: true });
    }
  },

  signUp: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    // Demo mode - simulate signup
    if (!isSupabaseConfigured) {
      set({
        isLoading: false,
        error: 'Demo mode: Configure Supabase to enable authentication.',
      });
      return { error: { message: 'Demo mode' } as AuthError };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      set({
        isLoading: false,
        error: error.message,
      });
      return { error };
    }

    set({
      user: data.user,
      session: data.session,
      isLoading: false,
    });

    return { error: null };
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    // Demo mode - simulate login with fake user
    if (!isSupabaseConfigured) {
      const demoUser = {
        id: 'demo-user-id',
        email: email,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User;

      set({
        user: demoUser,
        session: { user: demoUser } as Session,
        isLoading: false,
      });
      return { error: null };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      let errorMessage = error.message;

      // Provide friendlier error messages
      if (error.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection.';
      }

      set({
        isLoading: false,
        error: errorMessage,
      });
      return { error };
    }

    set({
      user: data.user,
      session: data.session,
      isLoading: false,
    });

    return { error: null };
  },

  signOut: async () => {
    set({ isLoading: true });

    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      await removePushToken(token);
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    }

    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }

    set({
      user: null,
      session: null,
      isLoading: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
