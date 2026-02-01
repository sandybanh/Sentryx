import { supabase } from '@/lib/supabase';

export interface AlertLog {
  id: string;
  device_id: string;
  identity: string;
  is_known: boolean;
  confidence: number;
  thumbnail_filename: string | null;
  video_filename: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  gemini_assessment: string | null;
  threat_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  created_at: string;
}

export interface AlertStats {
  total_alerts: number;
  unknown_alerts: number;
  high_threat_alerts: number;
}

export async function fetchAlertLogs(
  limit = 20,
  offset = 0,
  isKnown?: boolean
): Promise<{ data: AlertLog[]; error: string | null }> {
  try {
    let query = supabase
      .from('alert_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isKnown !== undefined) {
      query = query.eq('is_known', isKnown);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching alert logs:', error.message);
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching alert logs:', error);
    return { data: [], error: String(error) };
  }
}

export async function fetchAlertById(
  alertId: string
): Promise<{ data: AlertLog | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('alert_logs')
      .select('*')
      .eq('id', alertId)
      .single();

    if (error) {
      console.error('Error fetching alert:', error.message);
      return { data: null, error: error.message };
    }

    return { data: data || null, error: null };
  } catch (error) {
    console.error('Error fetching alert:', error);
    return { data: null, error: String(error) };
  }
}

export async function deleteAlert(
  alertId: string,
  _deleteFiles = true
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('alert_logs')
      .delete()
      .eq('id', alertId);

    if (error) {
      console.error('Error deleting alert:', error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true, error: null };
  } catch (error) {
    console.error('Error deleting alert:', error);
    return { ok: false, error: String(error) };
  }
}

export async function fetchAlertStats(): Promise<{
  data: AlertStats | null;
  error: string | null;
}> {
  try {
    // Fetch counts using Supabase
    const [totalResult, unknownResult, highThreatResult] = await Promise.all([
      supabase.from('alert_logs').select('id', { count: 'exact', head: true }),
      supabase.from('alert_logs').select('id', { count: 'exact', head: true }).eq('is_known', false),
      supabase.from('alert_logs').select('id', { count: 'exact', head: true }).eq('threat_level', 'HIGH'),
    ]);

    return {
      data: {
        total_alerts: totalResult.count || 0,
        unknown_alerts: unknownResult.count || 0,
        high_threat_alerts: highThreatResult.count || 0,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching alert stats:', error);
    return { data: null, error: String(error) };
  }
}

export function subscribeToAlertLogs(
  onInsert: (alert: AlertLog) => void,
  userId: string
) {
  const channel = supabase.channel('alert_logs_stream');

  channel.on(
    'postgres_changes',
    {
      event: '*',  // Listen for all events (INSERT and UPDATE)
      schema: 'public',
      table: 'alert_logs',
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        onInsert(payload.new as AlertLog);
      }
    }
  );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function formatAlertTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

export function getThreatColor(threatLevel: string | null): string {
  switch (threatLevel) {
    case 'HIGH':
      return '#EF4444'; // red
    case 'MEDIUM':
      return '#F59E0B'; // amber
    case 'LOW':
      return '#22C55E'; // green
    default:
      return '#6B7280'; // gray
  }
}
