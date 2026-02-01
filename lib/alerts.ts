import { supabase } from '@/lib/supabase';

export interface SensorEvent {
  id: string;
  device_id: string;
  motion: boolean;
  ultra_close: boolean;
  distance_cm: number | null;
  ts: string;
}

export async function fetchRecentEvents(
  limit: number,
  deviceId?: string
): Promise<{ data: SensorEvent[]; error: string | null }> {
  let query = supabase
    .from('sensor_events')
    .select('id, device_id, motion, ultra_close, distance_cm, ts')
    .order('ts', { ascending: false })
    .limit(limit);

  if (deviceId) {
    query = query.eq('device_id', deviceId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching sensor events:', error.message);
    return { data: [], error: error.message };
  }

  return { data: data ?? [], error: null };
}

export function subscribeToEvents(
  onInsert: (event: SensorEvent) => void,
  deviceId?: string,
  onStatus?: (status: string) => void
) {
  const channel = supabase.channel('sensor_events_stream');

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'sensor_events',
      ...(deviceId ? { filter: `device_id=eq.${deviceId}` } : {}),
    },
    (payload) => {
      onInsert(payload.new as SensorEvent);
    }
  );

  channel.subscribe((status) => {
    onStatus?.(status);
  });

  return () => {
    supabase.removeChannel(channel);
  };
}
