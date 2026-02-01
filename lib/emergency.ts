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
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('*')
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

export async function sendEmergencySms(message: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-emergency-sms', {
      body: { message },
    });

    if (error) {
      console.error('Error sending emergency SMS:', error.message);
      return false;
    }

    if (data?.success === false) {
      console.error('Emergency SMS failed:', data?.error ?? 'Unknown error');
      return false;
    }

    return true;
  } catch (err) {
    console.error('Emergency SMS error:', err);
    return false;
  }
}
