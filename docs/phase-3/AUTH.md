# المرحلة 03 — Auth والحساب والملف الشخصي: مراجعة وتوثيق أمني

> الوثيقة المرجعية لطبقة الحسابات في أوج (awj.life) — الترتيب 04/18.
> الهدف: تثبيت الحسابات كطبقة أمان أساسية قبل الاشتراكات والمجتمع وPush وMCP.

---

## 1. حالة المسارات عند بدء المرحلة (مراجعة أولية)

قبل هذه المرحلة كان الموقع يملك أساسًا صلبًا (مخرجات QA والتحصين السابق):

- **Sign up** (`/api/auth/signup`): zod + حد أدنى 8 أحرف + كوكيز httpOnly + رفض صريح للبريد المسجل (409) + `isAdmin: false` حرفيًا (لا يمكن للتسجيل الذاتي منح أدمن).
- **Sign in** (`/api/auth/login`): zod + فحص `role/avatar/suspended` من الخادم عبر service role + رفض الحساب الموقوف (423) + فشل مغلق عند تعذر التحقق.
- **Sign out** (`/api/auth/logout`): كان يمسح الكوكيز فقط.
- **Reset Password**: **غير موجود إطلاقًا** — لا مسار ولا واجهة (فجوة المرحلة).
- **profiles**: جدول منفصل عن `auth.users` مع Trigger إنشاء تلقائي عند التسجيل — تصميم سليم.
- **RLS**: 181 سياسة، والكتابة كلها عبر مسارات خادمية بعميل يحمل توكن المستخدم.

### الفجوات والثغرات المكتشفة (وكلها أُغلقت في هذه المرحلة)

| # | الخلل | الخطورة | الإصلاح |
|---|-------|---------|---------|
| 1 | لا يوجد استعادة كلمة مرور | وظيفية حرجة | مسار `/api/auth/reset-password` + `/auth/callback` + صفحة `/reset-password` |
| 2 | سياسة UPDATE على `profiles` تقيد الصفوف (`auth.uid()=id`) لا الأعمدة: مستخدم بـ JWT خاص يستطيع `SET role='admin'` أو `suspended=false` عبر REST مباشرة | 🔴 تصعيد صلاحيات | migration 024: `REVOKE UPDATE` ثم `GRANT UPDATE (name, avatar)` فقط — حجب على مستوى الأعمدة قبل RLS |
| 3 | سياسة `profiles_admin_select` تقبل `raw_user_meta_data->>'role'='admin'` — والمستخدم يتحكم في user metadata عند التسجيل المباشر عبر Supabase API | 🔴 تصعيد صلاحيات | migration 024: إسقاطها وإعادة إنشائها بفحص `raw_app_meta_data` فقط (يضبطه المشغّل حصرًا) |
| 4 | الخروج لا يبطل الجلسة على الخادم | برتقالية | `/api/auth/logout` يبطل توكن التحديث الحالي (setSession + signOut) |
| 5 | لا يوجد تغيير كلمة مرور من الإعدادات | وظيفية | `/api/auth/update-password` بمسارين (إعدادات/استعادة) + قسم «الحساب والأمان» |
| 6 | لا يوجد خروج من جميع الأجهزة | وظيفية أمنية | `/api/auth/logout-all` (إبطال شامل لكل refresh tokens) |
| 7 | لا يوجد حذف الحساب نهائيًا (بيانات فقط كانت) | وظيفية/امتثال | `/api/auth/delete-account` بمسح ذرّي متتالٍ ثم حذف `auth.users` |
| 8 | لا يوجد تخزين plan/status محمي من العميل | متطلب المرحلة | جدول `user_subscriptions` (migration 024): قراءة ذاتية فقط، لا سياسات كتابة للمصادقين أصلًا |

---

## 2. المعمارية النهائية لطبقة الحساب

### 2.1 تدفقات المصادقة (كلها كوكيز httpOnly — لا توكن في JS)

- **تسجيل**: `POST /api/auth/signup` → Supabase `signUp` → (تأكيد بريد) → كوكيز.
- **دخول**: `POST /api/auth/login` → `signInWithPassword` على عميل معزول → فحص الحالة → كوكيز.
- **خروج**: `POST /api/auth/logout` → إبطال توكن التحديث الحالي على الخادم → مسح الكوكيز.
- **خروج شامل**: `POST /api/auth/logout-all` → `admin.auth.signOut(userId)` يبطل كل refresh tokens للمستخدم في كل الأجهزة.
- **استعادة كلمة المرور** (hotfix 2026-09-11 — آلية PKCE خادمية موثوقة):
  1. «نسيت كلمة المرور؟» في صفحة الدخول → `POST /api/auth/reset-password {email}` → `resetPasswordForEmail` على عميل **flowType: pkce** مع شيم تخزين يلتقط الـ code_verifier لحظة توليده (`lib/auth-pkce.ts`) → يُرسل الـ code_challenge إلى Supabase ويوضع الـ verifier في **كوكي httpOnly** (`rise-pkce-verifier`، عمره ساعة، SameSite=Lax) على متصفح الطالب نفسه. الـ redirectTo بلا أي query: `${site}/auth/callback` (مطابقة حرفية للقائمة البيضاء).
  2. ضغط المستخدم على رابط الإيميل = تنقّل top-level من نفس المتصفح → الكوكي يصل مع الطلب → `/auth/callback` يبذل الكوكي كـ storage لعميل PKCE ثم `exchangeCodeForSession` على الخادم → كوكيز الجلسة httpOnly + **marker cookie عمره 10 دقائق** (`rise-pwd-recovery`) لأن الـ verifier نفسه يحمل لاحقة `/recovery` (إشارة لا يمكن تزويرها من العميل) → توجيه إلى `/reset-password`. الكوكي يُستهلك بعد أي محاولة تبديل (أحادي الاستخدام).
  3. صفحة `/reset-password` **محروسة على الخادم**: الفورم يظهر فقط عند وجود marker + جلسة حية؛ أي زيارة مباشرة أو رابط مستهلك أو جهاز مختلف تظهر حالة ودّية (`?state=expired|device|invalid`) مع تفسير السبب.
  4. الفورم يرسل `{newPassword}` إلى `POST /api/auth/update-password` — المسار يقبل الكلمة بدون كلمة المرور الحالية **فقط** بوجود الـ marker (إثبات أن الجلسة نشأت من رابط وصل فعلًا لبريد المالك).
  5. بعد التغيير: تُبطل كل الجلسات ويعاد المستخدم لتسجيل الدخول.
  - **السبب الجذري للعطل القديم**: استدعاء `resetPasswordForEmail` على عميل خادمي implicit → الإيميل يُرسل بلا code_challenge → رابط الاستعادة يوجّه إلى `/auth/callback#access_token=…` — توكنز في hash fragment لا يصل للخادم أبدًا → الكallback بلا `code` → المستخدم يُرمى على `/app` وصفحة الاستعادة كانت غير قابلة للوصول نهائيًا.
- **تغيير كلمة المرور من الإعدادات** (جديد): `{currentPassword, newPassword}` → جلب البريد من الجلسة → `signInWithPassword` على عميل معزول للتأكد من صحة كلمة المرور الحالية ومطابقة هوية المستخدم → `updateUser` → إبطال كل الجلسات.
- **تأكيد البريد**: رابط التأكيد يستخدم Site URL الافتراضي (signUp لا يمرر emailRedirectTo) — لا يعتمد على كوكي الـ verifier؛ دخول يدوي بعد التأكيد.

### 2.2 حذف الحساب نهائيًا (جديد) — `DELETE /api/auth/delete-account`

1. zod: `{email, password, confirmDelete: true}` (أقصى صرامة، بنمط delete-all).
2. إعادة إثبات هوية عبر عميل معزول — جلسة مسروقة لا تكفي.
3. `bustAggregateCache` → `admin.auth.signOut` (لا جلسة تبقى) → `delete_user_data_atomic` RPC (مسح المحتوى الشخصي ذرّيًا) → `admin.auth.deleteUser` → كل الجداول تتالى عبر FK `ON DELETE CASCADE` (`auth.users` → `profiles` → 22 جدول بيانات).
4. مسح الكوكيز. الواجهة: قسم «الحساب والأمان» → حوار خطرة بكتابة «حذف» + كلمة المرور.

### 2.3 تخزين plan/status المحمي (مهمة المرحلة) — migration 024

```
user_subscriptions(user_id PK → auth.users ON DELETE CASCADE,
                   plan CHECK(free|plus|max), status CHECK(active|past_due|canceled|expired),
                   started_at, expires_at, updated_at)
```

- **RLS**: سياسة SELECT واحدة (`auth.uid() = user_id`). **لا توجد أي سياسة INSERT/UPDATE/DELETE** — والإنكار الافتراضي يعني استحالة التعديل من أي عميل مصادق.
- **أذونات الأعمدة**: `GRANT SELECT` فقط للمصادقين. الكتابة حكر على `service_role` (مسارات خادمية / لوحة المالك) — جاهز للمرحلة 04 (الخطط والاشتراكات).
- Trigger `on_auth_user_created_subscription` ينشئ صف `free/active` لكل مستخدم جديد + backfill للمستخدمين الحاليين.
- المسار `GET /api/rise/user/subscription` يعرض للمستخدم خطته (قراءة RLS لصفه وحده).

### 2.4 حماية أعمدة الحساسية في `profiles` — migration 024

```
REVOKE UPDATE ON profiles FROM anon, authenticated;
GRANT UPDATE (name, avatar) ON profiles TO authenticated;
```

- المستخدم يستطيع تعديل اسمه وصورته الرمزية فقط. `role` و`suspended` و`xp` و`level`... محجوبة على مستوى امتيازات Postgres (قبل RLS).
- المسارات الخادمية الشرعية (award_xp_atomic وسواها من دوال SECURITY DEFINER وservice_role) تعمل بصفة المالك/الخدمة فلا تتأثر.
- `handle_new_user` أعيدت كتابته بـ `ON CONFLICT DO NOTHING` + `role='user'` حرفيًا (طبقة دفاع إضافية).

---

## 3. Security Gate — الأدلة

### البند 1: «مستخدم A لا يقرأ/يعدل بيانات مستخدم B أبدًا» ✅

- كل جدول بيانات عليه سياسات RLS بشرط `user_id = auth.uid()` (سياسات «own row» الشاملة من migration 008 وما بعدها — 181 سياسة).
- التحقق المباشر: عميل بجلسة A يقرأ `/api/rise/user/subscription` فيرى صفه فقط؛ أي استعلام بصيغة مستخدم B يرجع صفر صفوف من RLS (سلوك `\*` مع `maybeSingle`).
- الكتابة تمر عبر `requireUser` + عميل RLS بتوكن المستخدم نفسه — المسارات الخادمية الوحيدة التي تتجاوز ذلك هي أدمن عبر `requireAdmin` (فصل كامل، انظر §4).
- حذف/تعديل كل بيانات مستخدم آخر **مستحيل** من العميل: لا سياسة تسمح، والمسار الإداري الوحيد (`admin_delete_user_data_atomic`) يُنفذ بـ service_role فقط ويُستدعى من مسارات أدمن.

### البند 2: «لا يمكن رفع الخطة أو تعديل subscription/status من DevTools» ✅

- `user_subscriptions` بلا أي سياسة كتابة للمصادقين + `GRANT SELECT` فقط (migration 024): أي `fetch('/rest/v1/user_subscriptions', {method:'PATCH'})` من DevTools يرفضه Postgres صلاحياتٍ وسياساتٍ معًا.
- رفع الخطة عبر `profiles` القديم مسدود أيضًا: عمود `role` لم يعد قابلًا للتحديث من المصادق (GRANT أعمدة).
- الاستجابة الوحيدة لطلب تعديل الخطة من أي عميل: رفض صريح من قاعدة البيانات (وليس «مسار غير موجود» فقط).

### البند 3: «كل endpoint حساس يتحقق من session وauthorization على الخادم» ✅

جرد المسارات الحساسة الجديدة/المراجعة:

| المسار | الحماية |
|--------|---------|
| `POST /api/auth/reset-password` | zod + rate limit 3/د + رد عام (لا تعداد بريد) |
| `POST /api/auth/update-password` | zod + جلسة + (كلمة مرور حالية محقّنة أو marker استعادة) + rate limit 5/د |
| `POST /api/auth/logout-all` | جلسة (getUserId) + service role |
| `DELETE /api/auth/delete-account` | zod (email+password+confirm) + جلسة + إعادة إثبات على عميل معزول + rate limit 2/د |
| `GET /api/rise/user/subscription` | `requireUser` (جلسة + فحص تعليق) + عميل RLS |
| `POST /api/auth/logout` | إبطال توكن + مسح كوكيز (لا بيانات) |
| كل `/api/rise/*` (48 مسارًا) | `requireUser`/`withAuth` مع ربط توكن RLS + فشل مغلق عند تعطل فحص التعليق |

الـ rate limits الجديدة في middleware: reset-password 3/د، update-password 5/د، delete-account 2/د، logout-all 10/د.

---

## 4. فصل صلاحيات Admin عن المستخدم العادي (مراجعة)

- **مصدر الحقيقة الوحيد للدور**: عمود `profiles.role` يُقرأ على الخادم فقط (login/session عبر service role، و`requireAdmin` في `lib/audit.ts` قبل كل مسار أدمن). الواجهة لا ترى الدور إلا كعرض نصي غير موثوق من `/api/auth/session`.
- **التسجيل الذاتي لا يمنح أدمن أبدًا**: `isAdmin: false` حرفيًا في signup، وmigration 024 أغلق مسار `raw_user_meta_data` المزوّر في سياسة `profiles_admin_select` (بقي `raw_app_meta_data` الذي يضبطه المشغّل فقط).
- **كل عمليات الأدمن الثقيلة** عبر دوال ذرّية بـ service_role فقط (admin_read، admin_broadcast_notifications_atomic، admin_delete_user_data_atomic — مُنحت لـ service_role حصرًا في migration 019): مستخدم عادي بجلسة سليمة لا يستطيع تنفيذها.
- **لوحة الأدمن** تظهر فقط عند `isAdmin` من الجلسة، وكل مساراتها تتحقق من الدور على الخادم مجددًا — العرض في الواجهة لا يفتح شيئًا بذاته.

---

## 5. خطوات تشغيلية مطلوبة من المالك

1. **تطبيق migration 024** على Supabase (نفس آلية تطبيق الـ migrations السابقة):
   `supabase/migrations/024_phase3_account_security.sql`
   — بدونه تبقى حماية الأعمدة والجدول الجديد غير مفعلة في الإنتاج.
2. **إضافة رابط الاستعادة للقائمة البيضاء** في Supabase:
   Dashboard → Authentication → URL Configuration → Redirect URLs → إضافة:
   - `https://rise-os-gamma.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (للتطوير)
   بدون هذه الخطوة يرسل Supabase رابط الاستعادة إلى العنوان الافتراضي بدل `/auth/callback` فلا تُنشأ جلسة الاستعادة.
3. **(المرحلة 05 — محدّث 2026-09-12) قالب الإيميل المحسَّن — شبه آلي (خطوة نسخ/لصق واحدة)**:
   طلب المالك «زبط الايميل لاني مش فاهم» → أُزيل تاب «الإيميل» من لوحة الأدمن
   بالكامل. **نتيجة الفحص المباشر للإنتاج**: هذا المشروع على Supabase لا يملك
   جدول `auth.email_templates` (نسخة المنصة تخزّن القوالب في إعدادات GoTrue
   لا في SQL) — لذا التطبيق الآلي الكامل مستحيل على مستوى المنصة، والـRPC
   يرجع `reason:table_missing` بصدق (لو وفّرت المنصة الجدول لاحقًا سيعمل
   الـcron تلقائيًا).
   - **آلية دائمة**: `vercel.json` → Vercel Cron يوميًا (01:17 UTC) ينادي
     `GET /api/rise/email-template/ensure` بصلاحيات الخادم — idempotent +
     self-healing (يرجع الحالة الصادقة: applied / table_missing / …).
   - **الخطوة الواحدة المتبقية (مرة واحدة فقط)**: افتح صفحة المساعدة
     `https://rise-os-gamma.vercel.app/api/rise/email-template/view`
     → اضغط «نسخ كود القالب» → Supabase Dashboard → Authentication →
     Email Templates → Reset Password → Body type: HTML → الصق → Save.
     (الصفحة فيها المعاينة + الخطوات + زر النسخ.)
   - الرابط الحي `{{ .ConfirmationURL }}` نفسه (لا تغيير في آلية PKCE).
   - فحص الحالة في أي وقت:
     `curl https://rise-os-gamma.vercel.app/api/rise/email-template/ensure`

---

## 6. خلاصة التنفيذ

- **مِلَفات جديدة**: 5 مسارات API (`reset-password`, `update-password`, `logout-all`, `delete-account`, `user/subscription`) + مسار تبادل بريد (`/auth/callback`) + صفحة `/reset-password` + migration 024.
- **مِلَفات معدلة**: `login-page.tsx` (وضع «نسيت كلمة المرور؟»)، `settings.tsx` (قسم «الحساب والأمان»)، `logout/route.ts` (إبطال الجلسة)، `validators.ts` (3 مخططات)، `middleware.ts` (4 rate limits).
- **اختبارات**: tsc نظيف، build ناجح، اختبار دخان محلي: صفحة 200، callback يعيد التوجيه الصحيح بدون كود، الحراسات ترفض بلا جلسة (401/503 كما هو متوقع في الوضع المحلي).

### 6.1 هوتفيكس PKCE (2026-09-11) — أدلة الاختبار

- `scripts/pkce-flow-test.ts` (ميكانيكا دون شبكة): 12/12 ✅ — الطلب يحمل s256 code_challenge، الكابتور يلتقط `<verifier>/recovery`، والتبادل يرسل نفس الـ code_verifier ويكشف `redirectType=recovery`.
- `scripts/e2e-mock-supabase.ts` + `scripts/e2e-reset-flow.ts` (E2E كاملة ضد stub خادمي بتحقق SHA-256 حقيقي): 24 فحصًا ✅ — كوكي verifier httpOnly، إعادة التوجيه إلى `/reset-password` (وليس `/app`)، الفورم يظهر فقط بجلسة استعادة، الزيارة المباشرة محروسة، الجهاز الآخر → `state=device`، التغيير ينجح ويمحو الكوكيز، وبدون marker يُرفض 403.
- `scripts/e2e-reset-run.sh` (بيئة العميل): يرفع الـ stub + `next start -p 3100` ويشغّل الـ E2E — النتيجة: «ALL E2E RECOVERY-FLOW CHECKS PASSED ✅» مع تبادل PKCE موثّق في سجل الـ stub.
- tsc نظيف، والبناء يحتوي كوكي `rise-pkce-verifier` في chunks الخادم (تم التحقق بـ rg).

### 6.2 دليل إرسال الإيميل المباشر (2026-09-12) — اتصال DB كامل

- كلمة مرور قاعدة البيانات التي وفّرها المالك → تحقق مباشر من خط الاستعادة كاملًا على الإنتاج:
  طلب استعادة لإيميل المالك الحقيقي عبر `POST /api/auth/reset-password` → 200 + كوكي verifier httpOnly،
  وخلال ثانيتين ظهرت في القاعدة صف `recovery_token` في `auth.one_time_tokens` + صف PKCE جديد في
  `auth.flow_state` — أي أن GoTrue قبل الطلب وأنشأ التوكن وأرسل الإيميل فعلًا لإنبوكس المالك.
- فحص قاطع لتخزين القوالب: استعراض كامل لجداول schema الـ`auth` بصلاحيات postgres —
  **لا يوجد جدول قوالب إيميل في Postgres** (المنصة تخزّنها في إعدادات GoTrue خارج القاعدة)،
  لذا يبقى تغيير «شكل» الإيميل خطوة لوحة تحكم واحدة (صفحة المساعدة موجودة).
- فحص المجهول (anti-enumeration) على الإنتاج: إيميل غير موجود → 200 نجاح عام + كوكي verifier ✓.
