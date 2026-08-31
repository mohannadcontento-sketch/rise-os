-- ============================================================
-- 011. ERROR LOGS (سجل أخطاء العميل — لوحة الإدارة)
-- Client-side errors (window.error / unhandledrejection / manual
-- reportError) are POSTed to /api/error-log, which persists them
-- here via the service-role client. RLS denies everyone by design:
-- reads happen ONLY through admin API routes (service role bypasses
-- RLS), so no user can read another user's error trail.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.error_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  stack       TEXT,
  url         TEXT,
  context     TEXT,                 -- JSON-encoded context object
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs(user_id);

-- RLS: deny-all by default (no policies). Service role (admin API)
-- bypasses RLS; anon/authenticated clients must never read or write
-- this table directly — writes go exclusively through /api/error-log.
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
