-- ============================================================
-- RiseOS Migration 013: Security Hardening
-- P0/P1: API keys hash-only + durable audit log
-- Run AFTER migrations 001..012.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1) API keys: migrate plaintext -> SHA-256 and remove plaintext
-- ============================================================
ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS key_hash TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_api_keys' AND column_name = 'key'
  ) THEN
    UPDATE public.user_api_keys
    SET key_hash = encode(digest(key, 'sha256'), 'hex')
    WHERE key_hash IS NULL AND key IS NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_api_keys_key_hash_unique
  ON public.user_api_keys(key_hash)
  WHERE key_hash IS NOT NULL;

ALTER TABLE public.user_api_keys
  ALTER COLUMN key_hash SET NOT NULL;

-- Drop the old plaintext unique constraint/index and plaintext secret column.
ALTER TABLE public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_key_key;
DROP INDEX IF EXISTS idx_user_api_keys_key;
ALTER TABLE public.user_api_keys DROP COLUMN IF EXISTS key;

-- Key records must only be selectable/managed by their owner through RLS.
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "APIKeys: own" ON public.user_api_keys;
DROP POLICY IF EXISTS "APIKeys own" ON public.user_api_keys;
DROP POLICY IF EXISTS "user_api_keys_all" ON public.user_api_keys;
CREATE POLICY "user_api_keys_own" ON public.user_api_keys
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2) Durable audit ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs(target_type, target_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_none" ON public.audit_logs;
CREATE POLICY "audit_logs_none" ON public.audit_logs
  FOR ALL USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
GRANT SELECT ON TABLE public.audit_logs TO service_role;
GRANT INSERT ON TABLE public.audit_logs TO service_role;

-- Audit ledger is application-managed and append-oriented. No DELETE/UPDATE grants.
REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM service_role;

-- ============================================================
-- 3) Fix duplicate migration numbering in repo metadata
-- ============================================================
-- (No SQL action; rename the duplicate 008 file in source control to a unique number.)
