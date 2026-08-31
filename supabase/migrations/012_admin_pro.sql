-- ============================================================
-- 012. ADMIN PRO (إيقاف الحسابات + تلميحات التدقيق)
-- suspended: المالك يوقف حساباً مخالفاً — يُمنع من الدخول/API فوراً
-- (فرض عبر requireAuth بكاش 5 دقائق — بلا حمل إضافي على القاعدة)
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type, created_at DESC);
