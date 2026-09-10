-- 021. Notification integrity/performance indexes
-- Run AFTER 020_broadcast_schema_fix.sql.

CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON public.notifications (user_id, read, created_at DESC);

-- The client/API contract uses `read`; keep the legacy index if present,
-- but the composite index above is the preferred access path.
