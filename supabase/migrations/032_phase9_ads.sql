-- ============================================================
-- 032_phase9_ads.sql — المرحلة 09: نظام إعلانات الـFree
--
-- المبدأ (من الخطة): الإعلانات قابلة للتحكم بالكامل من النظام،
-- Free فقط. البوابة الحقيقية كودية في /api/rise/ads (خطة من
-- user_subscriptions) — هذه الهجرة تزرع طبقة التحكم اليدوي
-- (تشغيل/إيقاف + slot IDs + Direct Ads) في app_config.
--
-- كل شيء idempotent: تشغيلها أكثر من مرة آمن (ON CONFLICT DO
-- NOTHING — لا تُفسد قيمًا عدّلها المالك يدويًا).
--
-- ترتيب أسبقية القراءة (src/lib/ads/config.ts):
--   env أولاً → app_config هنا → الافتراضي المدمج (pub-ID المالك).
-- أي أن عدم تشغيل هذه الهجرة لا يعطل الإعلانات — الافتراضي يعمل.
-- ============================================================

-- app_config موجود من هجرة 028 (RLS بلا policies = service_role فقط)
-- نزرع المفاتيح الجديدة دون المساس بالمفاتيح القائمة (VAPID/Turso):

INSERT INTO public.app_config (key, value) VALUES
  -- مُعرّف ناشر AdSense (سلّمه المالك 13/9/2026 — عام بحكم التصميم)
  ('adsense_client_id', 'ca-pub-7322285983808380'),
  -- البوابة العالمية: 'true' = إعلانات تعمل، 'false' = إيقاف فوري
  ('ads_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ملاحظات للمالك (بدون تنفيذ — توثيق داخل الهجرة):
--
-- 1) تفعيل وحدة AdSense حقيقية لكل موضع: أنشئ Display unit في
--    لوحة AdSense (Ads → By ad unit → Display ads) وانسخ رقم
--    data-ad-slot ثم:
--      INSERT INTO app_config (key, value) VALUES
--        ('adsense_slot_home',      '<رقم-slot>')   -- أسفل الرئيسية
--      , ('adsense_slot_community', '<رقم-slot>')   -- أسفل المجتمع
--      , ('adsense_slot_tasks',     '<رقم-slot>')   -- أسفل المهام
--      ON CONFLICT (key) DO UPDATE SET value = excluded.value;
--    (أو env: ADSENSE_SLOT_HOME/COMMUNITY/TASKS في Vercel)
--    بدون slot: يظهر إعلان بيت «أوج بلس» (بطاقة ترقية) بدلاً منها.
--
-- 2) إعلانات مباشرة (شركات لاحقًا) — JSON في direct_ads:
--    [
--      {"id":"acme-1","title":"عرض شركة كذا","description":"…",
--       "cta":"اعرف أكثر","href":"https://…",
--       "placement":"home","startAt":"2026-10-01",
--       "endAt":"2026-10-31","priority":10,"active":true}
--    ]
--    placement: home | community | tasks | all
--    الفلترة (active/start/end/priority) تجري على الخادم — العميل
--    لا يرى إلا الإعلان الفائز.
--
-- 3) إيقاف كل الإعلانات فورًا:
--      UPDATE app_config SET value='false' WHERE key='ads_enabled';
--    أو env ADS_ENABLED=false في Vercel (أسبقية أعلى).
-- ============================================================
