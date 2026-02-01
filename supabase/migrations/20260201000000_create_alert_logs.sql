-- Create alert_logs table to store detection alerts with media paths
CREATE TABLE IF NOT EXISTS alert_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    identity TEXT NOT NULL DEFAULT 'UNKNOWN',
    is_known BOOLEAN NOT NULL DEFAULT FALSE,
    confidence REAL DEFAULT 0,
    thumbnail_filename TEXT,
    video_filename TEXT,
    thumbnail_url TEXT,
    video_url TEXT,
    gemini_assessment TEXT,
    threat_level TEXT CHECK (threat_level IN ('LOW', 'MEDIUM', 'HIGH')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_alert_logs_user_id ON alert_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_logs_device_id ON alert_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_alert_logs_created_at ON alert_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_logs_is_known ON alert_logs(is_known);

-- Row Level Security
ALTER TABLE alert_logs ENABLE ROW LEVEL SECURITY;

-- Users can only read their own alerts
CREATE POLICY "Users can read own alerts"
    ON alert_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert (from backend)
CREATE POLICY "Service role can insert alerts"
    ON alert_logs FOR INSERT
    WITH CHECK (true);

-- Users can delete their own alerts
CREATE POLICY "Users can delete own alerts"
    ON alert_logs FOR DELETE
    USING (auth.uid() = user_id);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE alert_logs;
