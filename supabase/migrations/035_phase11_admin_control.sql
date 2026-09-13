-- ============================================================
-- 035_phase11_admin_control.sql — المرحلة 11: استكمال وحدات
-- لوحة الإدارة الثلاث الناقصة (Ads UI / Plans UI / System)
--
-- كل شيء idempotent: ON CONFLICT DO NOTHING — لا تُفسد قيمًا
-- عدّلها المالك يدويًا. الجداول نفسها موجودة أصلًا:
--   • app_config (هجرة 028 — RLS بلا policies = service_role فقط)
--   • plan_entitlements (هجرة 025 — المصدر الوحيد للحدود؛
--     consume_usage يقرأه داخل DB بقفل صف)
-- الكتابات الإدارية تجري بـservice_role من مسارات
-- /api/rise/admin/{ads,plans,system} بعد requireAdmin + logAudit
-- — لا نضيف أي write policy للمستخدمين (fail-closed يظل ساريًا).
-- ============================================================

-- مفاتيح النظام (تاب «النظام»): الصيانة معطلة افتراضيًا + لا أعلام
INSERT INTO public.app_config (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('maintenance_message', 'أوج تحت الصيانة حاليًا — نرجو المحاولة بعد قليل.'),
  ('feature_flags', '{}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ملاحظات للمالك (توثيق داخل الهجرة — بدون تنفيذ):
--
-- 1) وضع الصيانة من اللوحة (تاب النظام) أو مباشرة:
--      UPDATE app_config SET value='true'  WHERE key='maintenance_mode';
--      UPDATE app_config SET value='false' WHERE key='maintenance_mode';
--    الأثر: middleware يرفض طفرات /api/rise/* غير الإدارية
--    برسالة 503 MAINTENANCE_MODE (القراءة والمسارات الإدارية
--    تستمر — الأدمن يستطيع دائمًا الدخول والإيقاف).
--    kill-switch أعلى أسبقية من Vercel عند تعطل قاعدة البيانات:
--      env SYSTEM_MAINTENANCE_MODE=true
--
-- 2) أعلام الميزات (JSON في feature_flags) — أمثلة:
--      {"community_enabled":true,"push_enabled":true}
--    مفاتيح مقترحة: community_enabled / push_enabled /
--    mcp_enabled / signup_enabled
--
-- 3) حدود الخطط (tab «الخطط») — تعديل مباشر بدون نشر:
--      UPDATE plan_entitlements SET daily_limit = 10
--      WHERE plan_code='free' AND feature_key='ai.action';
--    يسري فورًا على consume_usage (قرار خادمي داخل DB).
-- ============================================================
