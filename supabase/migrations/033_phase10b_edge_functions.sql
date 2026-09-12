-- ============================================================
-- 033_phase10b_edge_functions.sql — Supabase Edge Functions
-- (المرحلة 10-ب: MCP للـMax + مرسل Web Push على المنصة)
--
-- ماذا تضيف هذه الهجرة؟
--   1) جدول push_dispatch_log: سجل نتائج مرسل الويب بوش
--      (الوظيفة push-dispatch) — من أرسل/مُنع/أخطأ ومتى،
--      لكل إشعار صف واحد (upsert على notification_id).
--   2) تجهيز الجدولة: pg_cron + pg_net (إن لم تكونا مثبتتين)
--      ودالة مجدولة تستدعي الوظيفة كل دقيقتين.
--
-- الوظائف المُنشورة (بواسطة المالك — انظر التعليمات آخر الملف):
--   • functions/v1/mcp            — خادم MCP (خطة ماكس) بلا
--     أي إعداد إضافي: يقرأ مفاتيح rise_ من user_api_keys
--     والبوابة من user_subscriptions مباشرة.
--   • functions/v1/push-dispatch  — مكنسة طابور البوش؛ تقرأ
--     مفاتيح VAPID من app_config (زرع الهجرة 028) فلا إعداد
--     إضافي مطلوب أيضًا.
--
-- الأمان:
--   • push_dispatch_log بلا أي policy — القراءة/الكتابة
--     لـservice_role فقط (fail-closed مثل app_config).
--   • المجدول يستدعي الوظيفة بمصادقة: مفتاح الخدمة محفوظ في
--     Supabase Vault (وليس نصًا صريحًا في جدول cron) — الخطوة
--     «تهيئة الجدولة» أسفل الملف تنشئ السر وتفعّل الجدولة.
--   • الوظيفتان يجب نشرهما بـ--no-verify-jwt (مفاتيح rise_
--     وسر المجدول ليست JWT منصة) — كل التحقق داخل الوظيفة.
--
-- التكرار: الهجرة idempotent بالكامل — يمكن تشغيلها مرارًا.
-- ============================================================

-- ── 1) جدول سجل الإرسال ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_dispatch_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  -- sent: أُرسل (قد يكون جزئيًا للاشتراكات الحية)
  -- denied: بوابة الرفض (تفضيلات/سقوف) — نهائي
  -- no-subscriptions: لا أجهزة نشطة — نهائي ضمن النافذة
  -- claimed-elsewhere: مسار Vercel السريع أرسله — نهائي
  -- not-found: الإشعار حُذف — نهائي
  -- error: فشل قابل لإعادة المحاولة في جولة لاحقة
  status          TEXT NOT NULL CHECK (status IN
                    ('sent','denied','no-subscriptions','error',
                     'claimed-elsewhere','not-found')),
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS مفعل بلا policies = service_role فقط (نمط app_config)
ALTER TABLE public.push_dispatch_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_dispatch_log_service ON public.push_dispatch_log;

-- فهرس الاستعلام: أحدث النتائج لمراقبة الأدمن لاحقًا
CREATE INDEX IF NOT EXISTS push_dispatch_log_created_idx
  ON public.push_dispatch_log (created_at DESC);

COMMENT ON TABLE public.push_dispatch_log IS
  'نتائج مرسل Web Push على Edge Function (push-dispatch): صف واحد لكل إشعار (upsert على notification_id)؛ القراءة/الكتابة لـservice_role فقط — status=error وحده يعيد المحاولة ضمن نافذة 15 دقيقة.';

-- ── 2) الامتدادات (pg_cron + pg_net) ───────────────────────
-- على Supabase المستضاف يملك دور postgres حق إنشائهما.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 3) الجدولة: مصادقة المجدول + رابط الوظيفة ───────────────
-- المنصة تحقن SUPABASE_SERVICE_ROLE_KEY في الوظيفة نفسها،
-- لكن المجدول (pg_net) يحتاج قيمة نصية في رأس Authorization —
-- نقرأها من Vault عند كل تشغيل فلا تُخزَّن نصًا في cron.job،
-- وتدوير المفتاح لاحقًا يعمل بلا أي تعديل على الجدولة.
--
-- المدخلان (يضبطهما المالك مرة واحدة — انظر أسفل الملف):
--   • سر Vault: push_dispatch_auth = مفتاح service_role
--   • app_config: edge_push_dispatch_url = رابط الوظيفة
--
-- كتلة الجدولة الآمنة أدناه لا تُنشئ مجدولًا قبل اكتمال المدخلين
-- (كي لا يدور استدعاء فاشل بلا فائدة) — وتعيد المحاولة كل مرة
-- تُشغَّل فيها الهجرة (idempotent بالكامل).

DO $$
DECLARE
  v_secret TEXT;
  v_url    TEXT;
  v_cmd    TEXT;
BEGIN
  -- السر من Vault (إن أُنشئ)
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'push_dispatch_auth'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL; -- Vault غير متاح في هذه البيئة — نتجاوز
  END;

  -- رابط الوظيفة من app_config (إن ضبطه المالك)
  BEGIN
    SELECT value INTO v_url
    FROM public.app_config
    WHERE key = 'edge_push_dispatch_url'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL;
  END;

  IF v_secret IS NULL OR v_url IS NULL
     OR v_url NOT LIKE 'https://%.supabase.co/functions/v1/push-dispatch' THEN
    RAISE NOTICE 'push-dispatch: الجدولة غير مفعّلة بعد (ناقص السر أو الرابط) — شغّل الخطوة (أ) أسفل الملف.';
    RETURN;
  END IF;

  -- أمر الجدولة: الرابط ثابت، والمصادقة تُقرأ من Vault كل تشغيل
  v_cmd := $cmd$SELECT net.http_post(
    url := '$cmd$ || v_url || $cmd$',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_auth' LIMIT 1)
    ),
    body := '{}'::jsonb
  );$cmd$;

  -- إعادة الجدولة نظيفة (idempotent)
  PERFORM cron.unschedule('awj-push-dispatch-sweep');
  PERFORM cron.schedule(
    'awj-push-dispatch-sweep',
    '*/2 * * * *',
    v_cmd
  );
  RAISE NOTICE 'push-dispatch: الجدولة نشطة كل دقيقتين.';
END $$;

-- ─────────────────────────────────────────────────────────────
-- (أ) تفعيل الجدولة — يشغّله المالك مرة واحدة في SQL Editor:
--
--   -- 1) انسخ service_role key من Dashboard → Settings → API
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'push_dispatch_auth');
--
--   -- 2) اضبط رابط الوظيفة (استبدل <PROJECT_REF> من إعدادات المشروع)
--   insert into public.app_config (key, value, updated_at) values
--     ('edge_push_dispatch_url',
--      'https://<PROJECT_REF>.supabase.co/functions/v1/push-dispatch',
--      now())
--   on conflict (key) do update set value = excluded.value, updated_at = now();
--
--   -- 3) أعد تشغيل هذه الهجرة كاملة (آمنة للتكرار) — أو كتلة
--      الجدولة وحدها — وستجد السر والرابط وتنشّط الجدولة.
--
-- (ب) نشر الوظيفتين من الطرفية (مرة واحدة + عند أي تعديل):
--
--   supabase functions deploy mcp --no-verify-jwt
--   supabase functions deploy push-dispatch --no-verify-jwt
--
-- (ج) الاختبار اليدوي بعد النشر (بمفتاح الخدمة):
--
--   curl -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/push-dispatch' \
--        -H 'Authorization: Bearer <SERVICE_ROLE_KEY>'
--   -- → {"ok":true,"scanned":0,...} جولة فارغة نظيفة
--   -- فرض إشعار: ?notification_id=<uuid>
--
-- (د) نقطة MCP الجاهزة (بلا أي إعداد — تقرأ المفاتيح والبوابة
--     من القاعدة مباشرة):
--
--   https://<PROJECT_REF>.supabase.co/functions/v1/mcp
--   Authorization: Bearer rise_…
--
-- ─────────────────────────────────────────────────────────────

-- توثيق التشغيل داخل app_config (يظهر في استعلامات الإدارة)
INSERT INTO public.app_config (key, value, updated_at) VALUES
  ('edge_mcp_deployed', 'false', now()),
  ('edge_push_dispatch_deployed', 'false', now()),
  ('edge_push_dispatch_cron', 'pending-owner-setup', now())
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.app_config.value IS
  'existing column; لا تغيير — القيم أعلاه توثّق حالة نشر الوظائف (يحدّثها المالك/الأدمن بعد النشر: true / active)';
