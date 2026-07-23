-- ============================================================
-- Budgets table
--
-- Previously the /api/rise/budgets route had no backing table at all
-- (GET always returned an empty list, PUT just echoed the input back
-- with `offline: true`) — every monthly budget limit the user set was
-- lost on refresh because it was never actually saved anywhere.
-- ============================================================

DO $$ BEGIN
  CREATE TABLE public.budgets (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category   TEXT NOT NULL,
    "limit"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, category)
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_budgets_user ON public.budgets(user_id);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgets_all" ON public.budgets;
CREATE POLICY "budgets_all" ON public.budgets FOR ALL USING (auth.uid() = user_id);
