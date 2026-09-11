# المرحلة 04 — Plans والاشتراكات والـUsage Limits: Monetization Core

> الوثيقة المرجعية لنظام الخطط في أوج (awj.life) — الترتيب 05/18.
> الهدف (من الخطة): «بناء Monetization Core مركزي يمكنه التحكم في Free/Plus/Max
> بدون نسخ منطق الحدود داخل كل Feature».

---

## 1. نظرة عامة على القرارات المعمارية

| القرار | الخيار المتبنى | لماذا |
|---|---|---|
| مصدر الحدود | جدول `plan_entitlements` في قاعدة البيانات (migration 025) | مصدر واحد فعلي: تعديل حد = سطر SQL واحد بلا نشر؛ وقراءته من داخل `consume_usage` (SECURITY DEFINER) تجعل العميل عاجزًا عن تمرير حد مزيّف |
| تنفيذ الحد (Enforcement) | دالة `consume_usage` داخل قاعدة البيانات | قفل صف `FOR UPDATE` + فحص + زيادة في معاملة واحدة — لا نافذة سباق، ولا اعتماد على الفرونت إطلاقًا |
| الكتابة في العدادات | **لا سياسات INSERT/UPDATE/DELETE** لجدولات `usage_*` إطلاقًا | fail-closed: المستخدم لا يستطيع حتى بـ JWT مباشر عبر PostgREST تعديل عداده — الكتابة الوحيدة من الدالة الموقعة |
| التقويم | Africa/Cairo (يوم/شهر القاهرة) | إعادة التعيين على منتصف الليل المصري، لا UTC (مستخدمو أوج مصريون) |
| Fair Use لماكس | كل حدود ماكس أرقام صريحة (لا NULL) | تنفيذًا لمتطلب «تجهيز Fair Use لـ Max بدل Unlimited مطلق» |
| الدفع v1 | طلب ترقية → تعليمات دفع يدوي → مرجع → مراجعة أدمن → تفعيل | كما تنص الخطة: يُسجَّل المرجع والتاريخ ومن فعّل؛ الاستبدال بـ Payment Gateway لاحقًا لا يغيّر النموذج |
| انتهاء الصلاحية | قراءة زمنية عبر `effective_plan` (بدون cron) | أي صف `active` مع `expires_at` ماضٍ يعامل كـ free في كل مكان لحظيًا |

## 2. الخطط والحدود (كما مزروعة في الهجرة)

| الميزة | Free (0 ج.م) | Plus (30 ج.م/شهر) | Max (50 ج.م/شهر) |
|---|---|---|---|
| `ai.action` — عمليات الذكاء الاصطناعي | 5/يوم · 60/شهر | 30/يوم · 600/شهر | 100/يوم · 3000/شهر |
| `export.data` — تصدير البيانات | 3/يوم | 15/يوم | 50/يوم |
| `mcp.key` — مفتاح MCP | ✗ | ✗ | ✓ (بدون عدّاد) |
| الإعلانات | نعم (خفيفة — تُبنى في مرحلة 09) | لا | لا |

> `ai.action` موصول بالبنية وجاهز لأول ميزة AI فعلية؛ الحدود المزروعة أعلاه قابلة
> للتعديل بـ `UPDATE plan_entitlements SET daily_limit = …` دون نشر جديد.

## 3. المعمارية (طبقات التنفيذ)

```
الفرونت (settings.tsx / أي معالج)
   │ apiFetch / apiPost  ── لا قرارات حدود هنا أبدًا
   ▼
مسارات API (Next.js server)
   │ consumeUsage(req,'export.data') / checkEntitlement(req,'mcp.key')
   ▼
RPC: consume_usage / check_entitlement / get_usage_overview   ← SECURITY DEFINER
   │ effective_plan(user) → user_subscriptions
   │ plan_entitlements → الحدود
   │ usage_daily / usage_monthly → قفل FOR UPDATE + زيادة
   ▼
عند المنع: 402 LIMIT_REACHED { usage } → toast + Upgrade Prompt
```

### 3.1 الدوال المعرّضة (RPCs)

| الدالة | الوظيفة | الصلاحية |
|---|---|---|
| `consume_usage(p_feature_key)` | بوابة ذرية: تقرأ الخطة + الحد + تقفل العدّادين + تفحص + تزيد — ترجع jsonb بالاستخدام ومواعيد التجدد | authenticated |
| `check_entitlement(p_feature_key)` | فحص منطقي بلا عدّ (MCP لماكس) | authenticated |
| `get_usage_overview()` | لوحة كاملة (خطة فعّالة + كل الميزات + عدادات اليوم/الشهر) بطلب واحد | authenticated |
| `effective_plan(p_user)` | الخطة الفعّالة (تحترم انتهاء الصلاحية) — تُستخدم داخليًا | authenticated, service_role |

### 3.2 المسارات الجديدة/المعدّلة

| المسار | التغيير |
|---|---|
| `GET /api/rise/user/subscription` | + لوحة الاستخدام + بيانات العرض + خطوات الدفع (من env) + `effectivePlan` |
| `GET/POST /api/rise/user/subscription/requests` | جديد: قائمة طلباتي / إنشاء طلب ترقية (zod + فهرس فريد يمنع التكرار) |
| `GET/POST /api/rise/admin/subscriptions` | جديد: طلبات معلّقة + المشتركون + `approve`/`reject`/`set-plan` (requireAdmin + logAudit) |
| `GET /api/rise/export` | + `consumeUsage('export.data')` — عند المنع 402 مع حزمة الاستخدام |
| `POST /api/rise/mcp/key` | + `checkEntitlement('mcp.key')` — 403 PLAN_REQUIRED لغير ماكس |
| middleware | حدود معدل: طلبات الترقية 3/د، أدمن الاشتراكات 20/د |

### 3.3 الواجهات

- **الإعدادات → «الخطة والاشتراك»** (قسم أول): بطاقة الخطة + عدادات Progress لكل ميزة
  (تتلون تحذيريًا قرب الحد وأحمر عنده) + موعد التجدد + سجل الطلبات + حالات الرفض.
- **ديالوج الترقية**: مقارنة بلس/ماكس + خطوات الدفع اليدوي (تُقرأ من env) + نموذج
  (الوسيلة + رقم العملية + ملاحظة) → POST → حالة pending.
- **Upgrade Prompt عند بلوغ الحد**: زر التصدير عند 402 → toast برسالة عربية +
  زر «ترقية الخطة» يفتح الديالوج مباشرة (حدث `awj:open-upgrade`).
- **لوحة الأدمن → تبويب «الاشتراكات»**: طلبات معلّقة (الاسم/البريد/الوسيلة/المرجع/
  الملاحظة) → اعتماد (مدة 1–12 شهرًا + تأكيد المرجع) أو رفض بسبب يظهر للمستخدم +
  جدول المشتركتين الحاليين + تعيين يدوي + آخر المراجعات.

## 4. تدفق الدفع اليدوي (v1) — تتبّع كامل

```
المستخدم: اختيار الخطة → تعليمات الدفع (env) → تحويل فعلي → يرسل المرجع
   ▼ subscription_requests (pending) — لا يمكنه اختيار الحالة أو انتحال مراجعة
أدمن: لوحة الاشتراكات → يتحقق من المرجع → اعتماد
   ▼ service_role: user_subscriptions (plan/status/started/expires/payment_method/
     reference/activated_by) + الطلب approved + logAudit (من/متى/ماذا)
المستخدم: الخطة مفعّلة فورًا (expires_at = +N شهر)
   ▼ عند انتهاء الصلاحية: effective_plan → free تلقائيًا (بدون cron)
```

متغيرات تعليمات الدفع (تُضبط في Vercel بلا نشر):
`PAYMENT_INSTAPAY` / `PAYMENT_VODAFONE_CASH` / `PAYMENT_ETISALAT_CASH`.

## 5. متطلبات تشغيل (Owner Actions)

1. **تطبيق الهجرة**: Supabase SQL Editor → تشغيل
   `supabase/migrations/025_phase4_monetization.sql` كاملًا.
2. **(اختياري) تشغيل اختبار الإعادة اليومية/الشهرية**: SQL Editor →
   `supabase/tests/phase4_usage_limits.sql` — 8 مجموعات فحص داخل معاملة
   تُلغى تلقائيًا (ROLLBACK) ولا تترك أثرًا.
3. **(اختياري) ضبط وسائل الدفع**: متغيرات البيئة أعلاه في Vercel.
4. **قوالب الخطط/الحدود**: أي تعديل مستقبلي = `UPDATE plan_entitlements …`
   في SQL Editor (المصدر الوحيد — لا حاجة لنشر).

## 6. أدلة الاختبار (Test Evidence)

| الاختبار | النتيجة |
|---|---|
| `bunx tsc --noEmit` | نظيف |
| `bun run build` | ناجح — المسارات الثلاثة الجديدة/الموسعة مدرجة |
| `bash scripts/e2e-usage-run.sh` (E2E محلي كامل ضد mock PostgREST) | **17/17 ✅**: 3 تصديحات ناجحة → الرابعة 402 LIMIT_REACHED (كود + رسالة عربية + usedDaily 3/3 + resetDailyAt) · mcp/key → 403 PLAN_REQUIRED (requiredPlan=max) · طلب ترقية صحيح 200 pending · طلب غير صالح 400 (zod) · القائمة 1 pending · لوحة الاشتراك (خطة/usage/خطط/تعليمات دفع) |
| `pglast` (مُحلّل PostgreSQL 17) على الهجرة 025 | **56 عبارة سليمة** — التقط قبلها خطأ `IF EXISTS` بدل `IF NOT EXISTS` وأُصلح |
| `supabase/tests/phase4_usage_limits.sql` (يُشغّلها المالك) | 8 مجموعات: الحد اليومي (3 سماح/2 منع) · عزل عدّاد الأمس · عزل الشهر الماضي · mcp.key للمجانية · رفض كتابة مباشرة (UPDATE/INSERT) · RLS بين المستخدمين · انتهاء الصلاحية → free · طلب ترقية صحيح/مزوّر |
| تحسين إيميل الاستعادة (طلب المالك) | قالب HTML عربي RTL بهوية أوج — تقييم VLM 9/10 — انظر §7 |

## 7. تحسين إيميل إعادة تعيين كلمة المرور (طلب إضافي من المالك)

- **القالب**: `docs/phase-3/recovery-email-template.html` — RTL عربي، هوية أوج
  (obsidian `#070B14` + forest `#1B342B` + lime `#D6FF3D`)، زر CTA بارز،
  بطاقة «قبل الضغط تذكّر» (ساعة صلاحية / نفس المتصفح / إنهاء الجلسات)، رابط نصّي
  احتياطي، تذييل awj.life.
- **أمان التدفق**: الرابط يبقى `{{ .ConfirmationURL }}` نفسه — تغيير شكل الرسالة
  فقط، لا آلية الـ PKCE — التدفق المُصلَّح في المرحلة السابقة لا يتأثر.
- **التطبيق (Owner Action)**: Supabase Dashboard → Authentication → Email
  Templates → **Reset Password** → Body type: **HTML** → الصق محتوى الملف
  كاملًا → Save. (لا يمكن تغيير القوالب من الـ git — لوحة Supabase فقط).
- **معاينة**: `download/recovery-email-preview.png` (لقطة بالقيم التجريبية).

## 8. ما بعد المرحلة (توصيات)

- عند أول ميزة AI فعلية: نادِ `consumeUsage(req,'ai.action')` قبل التنفيذ —
  البنية والحدود جاهزة.
- **Ads للـ Free** (مرحلة 09): عمود `features->ads` في جدول `plans` جاهز كمفتاح.
- **MCP للـ Max** (مرحلة 10): البوابة (403 PLAN_REQUIRED) مفعّلة مسبقًا في
  `/api/rise/mcp/key`.
- **Payment Gateway** (لاحقًا): استبدال خطوة «الدفع اليدوي» فقط —
  `subscription_requests`/`user_subscriptions`/`consume_usage` لا تتغير.
