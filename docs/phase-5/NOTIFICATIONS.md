# المرحلة الخامسة — نظام الإشعارات In-App (مركز الإشعارات الموحد)

> «بناء مركز إشعارات موحد داخل أوج يكون مصدرًا لكل القنوات الأخرى» — الخطة، البطاقة 06/18.

---

## 1. الهدف والنطاق

المرحلة تبني **مصدرًا واحدًا** لكل إشعارات أوج: جدول واحد موسَّع، خدمة خادم واحدة للإنشاء، خلاصة واحدة للعرض (جرس + Drawer)، وفلاتر server-side. أي قناة مستقبلية (Web Push المرحلة 06، بريد، مجتمع المرحلة 07) تتفرع من نفس المركز بدل منطق منفصل لكل قناة.

ما نُفِّذ مقابل مهام الخطة الثمانية:

| مهمة الخطة | التنفيذ |
|---|---|
| جدول notifications مع RLS | موجود منذ RiseOS ووُسِّع (migration 026): `priority` / `expires_at` / `read_at` / `dedup_key` + 5 أنواع أحداث جديدة. RLS لم يتغير (select/update/delete/insert للمالك فقط) |
| خدمة إشعارات موحدة | `src/lib/notifications-service.ts` — نقطة الإنشاء الوحيدة من جهة الخادم: `notifyUser` (أدمن/حدث نظام) + `notifySelf` (ذاتي) + نصوص موحّدة لكل مصدر |
| Notification Bell + unread count | الجرس قائم؛ الشارة الآن عبر RPC خفيف `notifications_unread_count` (mode=count) بدل جلب القائمة |
| صفحة/Drawer لكل الإشعارات | `notifications-drawer.tsx` — Drawer كامل (جوال: شبه شاشة / سطح مكتب: عمود جانبي) بـ 4 تابات فلترة |
| mark as read / mark all | الفردي كما كان؛ «الكل» أصبح RPC ذريًّا واحدًا `mark_all_notifications_read` (بـ fallback للمسار القديم) |
| روابط deep-link | `actionUrl` + `rise:navigate` (نفس آلية الجرس) — إشعارات الاشتراك/الحدود تقود إلى الإعدادات ← الخطة والاشتراك |
| فلترة وحذف/إخفاء المنتهي | فلاتر server-side في RPC الخلاصة + **حذف كسول** للمنتهي عند كل فتح (لا cron) |
| منع تكرار نفس الإشعار | فهرس فريد `(user_id, dedup_key)` + `ON CONFLICT DO NOTHING` في `notify_user` و`consume_usage` |

### أنواع الأحداث في الإصدار الأول (كما في الخطة)

| النوع | الحالة | المصدر الموحّد |
|---|---|---|
| تنبيه شخصي/تذكير | ✅ قائم | `reminder` — محرك التذكيرات الحالي |
| رد أو تعليق في المجتمع | 🔜 بنية جاهزة | `community` (المرحلة 07) |
| ذكر المستخدم | 🔜 بنية جاهزة | `mention` (المرحلة 07) |
| تحديث الاشتراك أو قرب الانتهاء | ✅ موصول | approve / reject / set-plan / **قرب الانتهاء (آخر 7 أيام)** |
| بلوغ Usage Limit أو قربه | ✅ موصول | داخل `consume_usage` نفسها: قرب 80% يومي / 90% شهري + منع — مرة واحدة لكل فترة |
| إشعار نظام مهم | ✅ موصول | تصليح إجراء notify الأدمن (كان مكسورًا) + إلغاء الإيقاف |
| نجاح/فشل عملية خلفية | ✅ موصول | تصدير البيانات: نجاح (background) + فشل (high) مع انتهاء تلقائي بعد 30 يومًا |

---

## 2. القرارات المعمارية

1. **التوسيع لا الاستبدال**: جدول `notifications` القائم هو نفسه (كل بيانات RiseOS/أوج الحية سليمة). عقد واجهة الجرس (`read`/`action_url`/`metadata`) لم يتغير — توافق خلفي كامل مع 24 اختبار E2E السابقة.
2. **منع التكرار في قاعدة البيانات لا في التطبيق**: فهرس فريد `(user_id, dedup_key)` — قيم NULL متمايزة فالإشعارات بلا dedup لا تتأثر. `notify_user` يعيد NULL عند التكرار (ليست فشلًا).
3. **بوابة الصلاحيات داخل RPC** (`notify_user`): `service_role` (مسارات الأدمن/الخادم) أو `auth.uid() = الهدف` (ذاتي). مستخدم عادي **لا يستطيع** إشعار غيره — المحاولة ترفض بـ `forbidden`.
4. **الفلترة والحذف الكسول server-side**: `get_notifications_feed` يحذف صفوف المستخدم المنتهية ثم يقرأ — لا يمكن للعميل «نسيان» الفلترة. الفلاتر: `all` / `unread` / `high` / `account` (اشتراك+حدود+نظام+خلفية) / `activity` (إنجاز+تذكير+مجتمع...).
5. **إشعارات الحدود من نفس نقطة الـenforcement**: consume_usage تُدرج الإشعار داخل نفس معاملة العدّاد — المستخدم يرى الإشعار حتى لو رد الـAPI 402 في نفس اللحظة. dedup لكل (ميزة × فترة): مرة واحدة يوميًا/شهريًا مهما تكررت المحاولات.
6. **degraded-graceful**: قبل تطبيق migration 026 كل شيء يعمل كما في المرحلة 04 (المسار القديم) — النشر لا يعتمد على ترتيب التطبيق.
7. **قرار UI**: الـDrawer خارج `<header>` عمدًا — الـheader فيه `backdrop-blur` الذي ينشئ containing block للـfixed فيُفسد تموضع اللوحة.

### تصليح جذري داخل المرحلة

إجراء `POST /api/rise/admin/users { action: 'notify' }` القديم كان **مكسورًا في الإنتاج بصمت**: يكتب `type: 'admin_message'` (خارج CHECK constraint) وعمود `is_read` (غير موجود) → الإدراج يفشل دائمًا. أُعيد بناؤه عبر الخدمة الموحدة (`type: system` صحيح + dedup يومي على محتوى الرسالة).

---

## 3. الملفات

**الهجرة**: `supabase/migrations/026_phase5_notifications_center.sql` (32 عبارة، متحقق بها بـpglast) — أعمدة جديدة + قيد أنواع v2 + فهرس dedup + تريجر read_at + 5 RPCs + consume_usage v2 + `admin_apply_recovery_email_template`.

**جديد**:
- `src/lib/notifications-service.ts` — الخدمة الموحدة + نصوص الرسائل
- `src/components/rise/notifications-drawer.tsx` — مركز الإشعارات الكامل
- `src/app/api/rise/email-template/ensure/route.ts` — تطبيق قالب إيميل الريست في Supabase آليًا (cron يومي) — حلّ محل مسار الأدمن القديم
- `src/lib/email/recovery-template.ts` — القالب برمجيًا (نفس `docs/phase-3/recovery-email-template.html`)

**محذوف (طلب المالك «شيل الجزء الخاص بالإيميل من التحكم»)**:
- `src/app/api/rise/admin/email-template/route.ts` — استُبدل بـ`/api/rise/email-template/ensure`
- `src/components/rise/admin-email-template-tab.tsx` — تاب «الإيميل» أُزيل من لوحة الأدمن

**معدَّل**:
- `src/lib/data/notifications.ts` — feed / markAllRead / unreadCount (RPC + fallback)
- `src/app/api/rise/notifications/route.ts` — mode=count + الفلاتر + {all:true} + zod الأنواع الجديدة
- `src/components/rise/notification-bell.tsx` — شارة RPC + تمييز «مهم» + زر عرض الكل
- `src/app/app/page.tsx` — تسجيل الـDrawer
- `src/app/api/rise/admin/subscriptions/route.ts` — إشعارات approve/reject/set-plan
- `src/app/api/rise/admin/users/route.ts` — تصليح notify + إشعار إلغاء الإيقاف
- `src/app/api/rise/export/route.ts` — إشعارات نجاح/فشل الخلفية
- `src/app/api/rise/user/subscription/route.ts` — إشعار قرب انتهاء الاشتراك (آخر 7 أيام)
- `src/components/rise/admin-panel.tsx` — إزالة تاب «الإيميل» (طلب المالك)
- `vercel.json` — cron يومي (01:17 UTC) لمسار التطبيق الآلي
- `src/middleware.ts` — rate-limit 2/min لمسار التطبيق الآلي
- `docs/phase-3/AUTH.md` §5.3 — التطبيق الآلي عبر الـcron

---

## 4. الاختبارات

- **E2E (محلي، PostgREST stub بمنطق حقيقي)**: `scripts/e2e-notifications-mock.ts` + `scripts/e2e-notifications.ts` عبر `scripts/e2e-notifications-run.sh` — **كل الفحوص تمر**: أنواع zod (قبول الجديدة/رفض غير الصالحة)، الفلاتر الأربعة، mode=count، تحديد الكل الذري، تصدير ×3 + إشعار background واحد (dedup)، 402 في الرابعة + إشعار usage واحد (dedup، priority high)، near-limit عند 80%، منع متكرر بلا تكرار إشعار.
- **SQL للمالك**: `supabase/tests/phase5_notifications.sql` (11 مجموعة داخل ROLLBACK): notify_user ذاتي، dedup، forbidden صليب المستخدمين، service_role مسموح، الأنواع، الفلاتر، تريجر read_at، العدّاد، الحذف الكسول، قرب/منع الحدود، RLS.
- **tsc نظيف + build نظيف** (3 مسارات).

---

## 5. خطوات تشغيلية مطلوبة من المالك

1. **تطبيق migration 026** في Supabase SQL Editor:
   `supabase/migrations/026_phase5_notifications_center.sql`
   — بدونه تعمل المنصة بوضع degraded (المسار القديم: بلا فلاتر/dedup/أولوية) ولا يُطبَّق قالب الإيميل آليًا.
2. **(اختياري) تشغيل اختبار SQL**: `supabase/tests/phase5_notifications.sql` — لا يترك أثرًا.
3. **قالب إيميل إعادة التعيين — آلي، لا خطوة مطلوبة** (طلب المالك «زبط الايميل لاني مش فاهم»):
   التاب اليدوي أُزيل من لوحة الأدمن، والمسار
   `GET /api/rise/email-template/ensure` يُطبّق القالب بصلاحيات الخادم
   (service role موجودة أصلًا في بيئة Vercel)، وVercel Cron يعيد
   التطبيق يوميًا (self-healing).
   الفحص: `curl https://rise-os-gamma.vercel.app/api/rise/email-template/ensure`
   - `applied:true` → تم ✓
   - `table_missing`/`permission` → لصق يدوي مرة واحدة من الـDashboard
     (الخطوات في `docs/phase-3/AUTH.md` §5.3).
4. (اختياري) بعد التطبيق: جرّب «نسيت كلمة المرور؟» وتأكد من شكل الإيميل الجديد.

> ملاحظة: التطبيق الآلي يحتاج migration 026 — **متطبق فعلًا في الإنتاج** (تم التحقق 2026-09-12: الـRPC موجود ويستجيب).

---

## 6. الأثر على المراحل التالية

- **المرحلة 06 (Web Push)**: بنية الأنواع وdedup وpriority جاهزة؛ يبقى تسجيل Push Subscription + تفضيلات لكل فئة.
- **المرحلة 07 (المجتمع)**: نوعا `community` و`mention` مقبولان في CHECK والفلاتر من اليوم.
- **المرحلة 10 (MCP)**: إشعار not_entitled يعمل تلقائيًا من consume_usage.
