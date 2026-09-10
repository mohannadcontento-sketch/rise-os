-- ============================================================
-- 024. Phase 3 — Account security & server-controlled plan
-- Run AFTER 023_drop_abandoned_app_config.sql.
-- Fixes: client-writable role/suspended, user-metadata admin
-- escalation, missing server-controlled subscription storage.
-- ============================================================

-- ── 1. COLUMN-LEVEL PRIVILEGES ON profiles ──────────────────
-- The RLS UPDATE policy ("auth.uid() = id") restricted WHICH rows
-- a user can touch but not WHICH columns. A user holding their own
-- JWT (obtainable directly from /auth/v1/token with the public anon
-- key) could PATCH profiles SET role='admin' / suspended=false.
-- Postgres column-level grants close this at the permission layer,
-- BEFORE RLS: authenticated may now only write (name, avatar).
-- Server-side paths (award_xp_atomic & other SECURITY DEFINER RPCs,
-- service_role) are unaffected — they run as the function/table owner.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (name, avatar) ON public.profiles TO authenticated;

-- Same defense for auth-critical future columns: reads stay open via
-- SELECT policies (own row only), writes are column-restricted above.

-- ── 2. KILL THE USER-METADATA ADMIN FALLBACK ─────────────────
-- Old policy (005) accepted raw_user_meta_data->>'role' = 'admin'.
-- raw_user_meta_data is CLIENT-CONTROLLED at signup: anyone can call
-- /auth/v1/signup directly with metadata {role: 'admin'} and pass this
-- policy. Only raw_app_meta_data (operator/service-role only) is a
-- trustworthy admin signal.

DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_app_meta_data->>'role' = 'admin'
    )
  );

-- ── 3. SERVER-CONTROLLED SUBSCRIPTION (plan / status) ────────
-- Phase-3 task: "حفظ plan/status بطريقة لا يمكن للمستخدم تعديلها
-- من Client". Storage layer for the upcoming plans/billing phase.
-- Rules:
--   * users can READ their own row (RLS SELECT)
--   * users can NEVER INSERT / UPDATE / DELETE — no policies exist
--     for authenticated, so RLS denies by default (fail closed)
--   * only service_role (server routes / admin panel) can write

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan       TEXT NOT NULL DEFAULT 'free'
             CHECK (plan IN ('free', 'plus', 'max')),
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'past_due', 'canceled', 'expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read own subscription only. No write policies on purpose:
-- "no policy" + RLS = deny for authenticated/anon.
DROP POLICY IF EXISTS "user_subscriptions_select_own" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions_select_own" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Column grants: SELECT only for authenticated (no writes at all).
REVOKE ALL ON public.user_subscriptions FROM anon, authenticated;
GRANT SELECT ON public.user_subscriptions TO authenticated;

-- ── 4. AUTO-PROVISION SUBSCRIPTION ROW ON SIGNUP ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- Backfill: existing users without a subscription row get 'free'.
INSERT INTO public.user_subscriptions (user_id, plan, status)
SELECT u.id, 'free', 'active'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ── 5. HARDEN handle_new_user (profile creation) ─────────────
-- Ensure signup metadata can never pre-seed a privileged profile.
-- (defense-in-depth: 008 insert policy is auth.uid()=id so a fresh
-- user could insert their own profile row WITH role='admin' before
-- the trigger runs — the trigger runs first, but keep the guard.)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.user_subscriptions IS 'Server-controlled plan/status storage — client read-only, written only by service_role (phase 3 security requirement)';
