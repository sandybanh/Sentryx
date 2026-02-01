import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Check if using placeholder values
export const isSupabaseConfigured =
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!isSupabaseConfigured) {
  console.warn(
    '⚠️ Supabase not configured. Create a .env file with:\n' +
    'EXPO_PUBLIC_SUPABASE_URL=your-url\n' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database types for push tokens
export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
}

export interface EmergencyContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  created_at: string;
}

// Helper to save push token for the current user
export async function savePushToken(token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('Cannot save push token: No authenticated user');
    return;
  }

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: user.id, token },
      { onConflict: 'user_id,token' }
    );

  if (error) {
    console.error('Error saving push token:', error.message);
  }
}

// Helper to remove push token on logout
export async function removePushToken(token: string): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('token', token);

  if (error) {
    console.error('Error removing push token:', error.message);
  }
}
