# المرحلة السادسة — Web Push Notifications

> **الحالة: منجزة** · الترتيب 07/18 · التنفيذ: Super Z · 12 سبتمبر 2026
> «إخراج الإشعارات المهمة من داخل المنصة إلى الجهاز، بدون إغراق المستخدم»

---

## 1. الفكرة المعمارية

القناة الجديدة **ليست نظامًا منفصلًا** — هي امتداد لمركز إشعارات المرحلة الخامسة
نفسه. نقطة الإنشاء الموحدة (`notifyUser` / `notifySelf` في
`src/lib/notifications-service.ts`) هي التي تطلق الإرسال: بعد إنشاء الإشعار
(وفقط عندما لم يمنعه `dedup_key`) تستدعي `dispatchPushQuietly` داخليًا. أي
مصدر حدث مستقبلي (مجتمع، تذكيرات، تسويق بموافقة) يحصل على قناة Push
**مجانًا** بمجرد أن ينادي نقطة الإنشاء — لا منطق جديد لكل قناة.

```
مصدر الحدث (admin/export/usage/…)
        │
        ▼
notifyUser / notifySelf  ←──────── نقطتان الموحدة فقط
        │  ① insert notifications (dedup فريد)
        │  ② dispatchPushQuietly (مهلة 10 ث، لا ترمي أبدًا)
        ▼
dispatchPushForNotification (src/lib/push/dispatch.ts)
        │  VAPID من app_config (أو env — env أولًا)
        │  RPC gate_push_for_notification (service_role فقط)
        │      ├─ خريطة type → فئة (community/mention→مجتمع، reminder→تذكيرات، metadata.category صريح للتسويق، وإلا «مهم»)
        │      ├─ تفضيلات المستخدم (push_enabled + فئة)
        │      ├─ سقوف الإغراق: ‹10/ساعة و‹30/يوم (تُعدّ من pushed_at)
        │      └─ ادعاء ذري: UPDATE pushed_at WHERE IS NULL (مرة واحدة فقط)
        ▼
web-push (مكتبة فعلية) → POST مشفّر لكل جهاز نشط
        ├─ نجاح → touch_push_subscription (last_push_at)
        └─ 404/410 → revoke_push_subscription («expired») — إبطال تلقائي
```

**ضمانات التصميم (DoD):**
- الإشعار يظهر داخل الموقع حتى لو فشل Push — الفشل صامت ولا يوقف المسار أبدًا.
- إيقاف Push من الإعدادات يمنع القناة فقط — البوابة ترفض قبل الادعاء فلا
  يتأثر مركز الإشعارات ولا العدادات.
- لا إشعار مكرر لنفس الحدث: dedup_key عند الإنشاء + ادعاء pushed_at ذري
  عند الإرسال (طبقتا منع مستقلتان).

## 2. قاعدة البيانات — الهجرة 028 (مُطبّقة في الإنتاج بواسطة Super Z)

| كائن | الغرض | الحماية |
|---|---|---|
| `push_subscriptions` | اشتراك لكل جهاز/متصفح (endpoint فريد عالميًا + p256dh/auth) | RLS select-own فقط؛ **كل الكتابة عبر RPCs** (fail-closed)؛ CHECK: endpoint https + أطوال المفاتيح |
| `notification_preferences` | تفضيلات الفئات لكل مستخدم | RLS select-own؛ الكتابة عبر `set_notification_preferences` |
| `app_config` | مفاتيح VAPID (public/private/subject) | RLS **بلا أي policy** = service_role فقط؛ المفتاح الخاص لا يظهر في أي ملف بالمستودع ولا لأي مستخدم |
| `notifications.pushed_at` | ادعاء الإرسال الذري + عدّاد السقوف | يُضبط فقط داخل بوابة `gate_push_for_notification` |

**RPCs (كلها SECURITY DEFINER + `SET search_path` + REVOKE/GRANT صريح):**
- `upsert_push_subscription` — بوابة auth.uid، سقف **10 أجهزة نشطة**،
  ON CONFLICT(endpoint) يجدد المفاتيح ويلغي الإبطال (المتصفح نفسه عاد).
- `revoke_push_subscription` / `revoke_push_subscription_by_id` — صفو
  المستخدم أو service_role (إبطال تلقائي 410 + يدوي من القائمة).
- `list_push_subscriptions` — صفوف المستخدم، **endpoint مقنّع: الأصل فقط**
  (مثل `fcm.googleapis.com`) — لا يُكشف المسار الكامل.
- `get_notification_preferences` / `set_notification_preferences` — صف
  المستخدم أو الافتراضيات.
- `gate_push_for_notification` — **service_role فقط** (GRANT مغلق حتى
  لـauthenticated): خريطة الفئات + التفضيلات + السقوف + الادعاء الذري.
- `touch_push_subscription` — last_push_at بعد النجاح.
- `cleanup_stale_push_subscriptions(30)` — إبطال (لا حذف) المهجور
  30+ يومًا؛ cron أسبوعي (الأحد 02:23 UTC).

## 3. الفئات والافتراضيات (من جدول الخطة)

| الفئة | In-App | Push | افتراضي Push |
|---|---|---|---|
| تحديثات مهمة (اشتراك/حدود/عمليات خلفية) | ✅ | ✅ | **مفتوح** |
| أمان الحساب | ✅ | ✅ | **مفتوح** |
| تذكيرات | ✅ | ✅ | **مفتوح** |
| نشاط المجتمع (community/mention) | ✅ | اختياري | **مغلق** |
| رسائل أوج (تسويق) | حسب الموافقة | اختياري | **مغلق — بوابة موافقة نصية صريحة في الواجهة قبل التشغيل** |

التسويق لا يُرسل أبدًا إلا بتصنيف صريح `metadata.category = 'marketing'` من
مصدر الحدث **و** موافقة المستخدم — انفصال كامل عن إشعارات الحساب والأمان.

## 4. مفاتيح VAPID — بلا خطوة مالك

المفاتيح مولّدة ومزروعة مباشرة في `app_config` بالقاعدة (Super Z عبر جلسة
الوصول الكامل). ترتيب القراءة في `src/lib/push/vapid.ts`:
1. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (env — لو
   وضعها المالك لاحقًا في Vercel تُستخدم فورًا؛ موثقة في `.env.example`).
2. `app_config` عبر service_role (الحالة الحالية — **صفر إعداد**)، كاش
   10 دقائق لكل نسخة خادم.

المفتاح العام يُقدَّم للعميل عبر `GET /api/rise/push/vapid-key` (عام — ليس
سرًا بحكم التصميم؛ `configured:false` لو غير مهيأ).

## 5. المسارات

| المسار | الوصف | الحد (middleware) |
|---|---|---|
| `GET /api/rise/push/vapid-key` | المفتاح العام + configured | 60/د |
| `POST /api/rise/push/subscribe` | zod (https + مفاتيح) → upsert RPC؛ 409 عند السقف | 30/د (resync عند كل إقلاع) |
| `DELETE /api/rise/push/subscribe` | إبطال بالـid (من القائمة) أو endpoint (جهازنا) | 30/د |
| `GET /api/rise/push/subscriptions` | أجهزتي (origin مقنّع + حالة الإبطال) | ضمن /api/rise |
| `POST /api/rise/push/test` | **إشعار حقيقي** عبر المسار الموحد نفسه → يظهر داخل الموقع ويُرسل Push فعليًا؛ expires بعد ساعة | **2/د** |
| `GET/PUT /api/rise/user/notification-preferences` | قراءة/تحديث الفئات (zod، categories اختيارية) | 10/د |
| `GET /api/rise/push/cleanup` | cron أسبوعي → RPC تنظيف المهجور | ضمن /api/rise |

**أُزيلت نهائيًا** (استبدالها في النظام الجديد): `/api/rise/notifications/push`
(كان يخزن اشتراكًا واحدًا JSON في userSettings) و
`/api/rise/notifications/send` — كلاهما 404 الآن (مُتحقق في E2E).

## 6. الواجهة (UX غير مزعج — متطلب الخطة)

- **`src/lib/push-notifications.ts`** (إعادة كتابة كاملة): الحالة تُقرأ بلا
  طلب أي شيء؛ `enablePush` يعمل **من إيماءة مستخدم فقط** (زر). المفتاح من
  الخادم — لا `NEXT_PUBLIC_VAPID_KEY`. إيقاف الجهاز = إبطال محلي + خادم.
- **إعدادات ← «إشعارات الجهاز (Push)»** (`push-notifications-section.tsx`):
  حالة القناة (مفعّلة/محظورة من المتصفح + إرشاد فتح الصلاحية)، تفعيل/إيقاف،
  زر تجربة، مفاتيح الفئات الخمسة مع وصف كل فئة، **بوابة موافقة نصية**
  للتسويق قبل تشغيله، قائمة الأجهزة المسجلة (origin فقط) مع إزالة أي جهاز.
- **درج الإشعارات**: شريحة «استلم إشعارات أوج على جهازك» — تظهر فقط عند
  صلاحية `default` + لا اشتراك، تُغلق مرة واحدة للجلسة، والنقر هو الإيماءة
  الصريحة. لا يوجد أي طلب صلاحية تلقائي عند التحميل.
- **`pwa-init.tsx`**: لم يعد يطلب الصلاحية عند أول نقرة (كان مزعجًا) —
  الآن **إعادة مزامنة صامتة فقط** لاشتراك قائم عند الإقلاع.
- **`sw.js`** (من phase-1): معالجات push/notificationclick جاهزة أصلًا —
  payload الجديد يطابق العقد (`title/body/icon/badge/tag/url`)، والنقر يفتح
  `/app?module=<الوحدة>&notification=<id>` (آلية `?module=` الموجودة أصلًا).

## 7. الاختبارات (كلها تُنفّذ ضد سلوك حقيقي)

**SQL المالك** — `supabase/tests/phase6_web_push.sql` (BEGIN…ROLLBACK،
صفر أثر): **21/21 مجموعة ناجحة على قاعدة الإنتاج الفعلية** — upsert لكل
جهاز + التجديد، رفض الأشكال، سقف 10، القائمة المقنّعة، إبطال صفو/منع
التطفل، RLS صليب المستخدمين، التفضيلات، بوابة الإرسال (GRANT ممنوع
للجلسات العادية / ok+ادعاء / already_pushed / فئة مغلقة / تسويق بلا
موافقة / push_disabled والإشعار حي / سقف الساعة)، تنظيف المهجور، touch.

**E2E كامل** — `scripts/e2e-push-run.sh` (mock PostgREST + **مستقبِل HTTPS
بشهادة موقّعة ذاتيًا**): **كل الفحوص ناجحة** — أبرزها أن **مكتبة web-push
الحقيقية** أرسلت POST مشفّرًا فعليًا للمستقبِل (ترويسات VAPID JWT + TTL +
Urgency + حجم payload) وأن جهازًا يرجّع 410 **أُبطل تلقائيًا** بعد الإرسال؛
إضافة إلى: zod (401/400/409)، upsert بلا تكرار، سقف الأجهزة، origin مقنّع،
حد التجربة 2/د (429)، إبطال بالمعرّف، cron التنظيف، **DoD**: إيقاف القناة
→ export يعمل والإشعار داخل الموقع موجود ولا POST للمستقبِل + pushed_at
غير مضبوط (البوابة رفضت قبل الادعاء)، وdedup: تكرار export → صف واحد.

**انحدار المراحل 4 و5** — `e2e-usage-run.sh` 17/17 و
`e2e-notifications-run.sh` كل الفحوص ناجحة (دمج dispatch في notifyUser لا
يكسر شيئًا — تدرّج رشيق ضد mock بلا RPCs المرحلة 06).

tsc نظيف؛ build نظيف (ضمن تشغيل E2E).

## 8. أثر التدقيق (audit_logs)

`push-subscribe` / `push-unsubscribe` / `push-test` /
`push-preferences-update` — من المسارات، مع IP + UA (نفس سجل المراحل
السابقة). البوابة نفسها لا تُسجّل (صخب بلا قيمة أمنية).

## 9. خطوات المالك: **لا شيء** ✅

الهجرة 028 مُطبّقة ومفاتيح VAPID مزروعة ومُتحقق منها بالفعل بواسطة
Super Z عبر جلسة الوصول الكامل لقاعدة البيانات. الاختبار الاختياري الوحيد:
لصق `supabase/tests/phase6_web_push.sql` في SQL Editor إن رغبت برؤية
21 ✅ بنفسك — النتيجة نفسها مُنفّذة وموثقة أعلاه.

**تجربة المستخدم النهائي**: سجّل دخولك → افتح جرس الإشعارات → شريحة
«استلم إشعارات أوج على جهازك» → تفعيل → زر التجربة في الإعدادات.

---

*المرحلة التالية (row 08/18): المرحلة السابعة — Community.*
