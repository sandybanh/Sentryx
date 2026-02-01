import { supabase } from '@/lib/supabase';

export interface EmergencyContactInput {
  name: string;
  phone: string;
}

export interface EmergencyContactRow extends EmergencyContactInput {
  id: string;
  user_id: string;
  created_at: string;
}

export async function getEmergencyContacts(): Promise<EmergencyContactRow[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    console.warn('Cannot fetch contacts: No authenticated user');
    return [];
  }

  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching emergency contacts:', error.message);
    return [];
  }

  return data ?? [];
}

export async function saveEmergencyContacts(
  contacts: EmergencyContactInput[]
): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    console.warn('Cannot save contacts: No authenticated user');
    return false;
  }

  const payload = contacts.map((contact) => ({
    user_id: user.id,
    name: contact.name,
    phone: contact.phone,
  }));

  const { error } = await supabase
    .from('emergency_contacts')
    .upsert(payload, { onConflict: 'user_id,phone' });

  if (error) {
    console.error('Error saving emergency contacts:', error.message);
    return false;
  }

  return true;
}

export async function replaceEmergencyContacts(
  contacts: EmergencyContactInput[]
): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    console.warn('Cannot replace contacts: No authenticated user');
    return false;
  }

  const { error: deleteError } = await supabase
    .from('emergency_contacts')
    .delete()
    .eq('user_id', user.id);

  if (deleteError) {
    console.error('Error clearing emergency contacts:', deleteError.message);
    return false;
  }

  if (!contacts.length) {
    return true;
  }

  const payload = contacts.map((contact) => ({
    user_id: user.id,
    name: contact.name,
    phone: contact.phone,
  }));

  const { error: insertError } = await supabase
    .from('emergency_contacts')
    .insert(payload);

  if (insertError) {
    console.error('Error saving emergency contacts:', insertError.message);
    return false;
  }

  return true;
}

export async function sendEmergencySms(message: string): Promise<boolean> {
  try {
    // Force refresh the session to get a fresh JWT
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error('Failed to refresh session:', refreshError.message);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    console.log('Current session:', sessionData.session ? 'exists' : 'null');
    console.log('Token expires at:', sessionData.session?.expires_at
      ? new Date(sessionData.session.expires_at * 1000).toISOString()
      : 'unknown');

    if (!sessionData.session) {
      console.error('No active session - user not authenticated');
      return false;
    }

    // Call function directly with fetch to see full error response
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const response = await fetch(`${supabaseUrl}/functions/v1/send-emergency-sms`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionData.session.access_token}`,
        'apikey': anonKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();
    console.log('Edge Function response:', response.status, JSON.stringify(data, null, 2));

    if (!response.ok || data?.success === false) {
      console.error('Emergency SMS failed:', JSON.stringify(data, null, 2));
      return false;
    }

    return true;
  } catch (err) {
    console.error('Emergency SMS error:', err);
    return false;
  }
}
