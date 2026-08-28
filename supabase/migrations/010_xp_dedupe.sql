-- ============================================================
-- 010. XP AWARD IDEMPOTENCY (anti double-submit farming)
-- Records every server-side XP award with a dedupe key so the
-- same logical action can never be paid twice:
--   - task:<id>              → once, ever
--   - habit:<id>             → once per local calendar day
--   - morning-routine-complete → once per local calendar day
-- Repeatable sources (work:<n>min / focus:<n>min) are NOT recorded.
--
-- The earn-xp route inserts here BEFORE updating the profile; a
-- unique-violation (ignored duplicate) means "already awarded" and
-- the request returns without adding XP.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.xp_awards (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  dedupe_key  TEXT NOT NULL,
  amount      INT  NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_xp_awards_user_created ON public.xp_awards(user_id, created_at DESC);

ALTER TABLE public.xp_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xp_awards_select_own" ON public.xp_awards
  FOR SELECT USING (auth.uid() = user_id);

-- The earn-xp route prefers the service-role client (bypasses RLS), but
-- falls back to the user's own JWT when SUPABASE_SERVICE_ROLE_KEY is unset.
-- Without this policy that fallback insert fails and dedupe silently no-ops.
CREATE POLICY "xp_awards_insert_own" ON public.xp_awards
  FOR INSERT WITH CHECK (auth.uid() = user_id);
