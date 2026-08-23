# خطة إصلاح RiseOS الشاملة (أمان + بيانات + وظائف)

## أولاً: خلاصة المراجعة المكتملة (الجزء الناقص + التحقق)

**نتائج جديدة أخطر مما كان مسجلاً:**
- أربعة مسارات أدمن تستورد `isAdmin` ولا تستدعيها: `admin/query` و`admin/stats` و`admin/users` و`admin/api-keys` (فقط `admin/storage` يفحص فعلاً). أي مستخدم مسجَّل يستطيع سرد كل مستخدمي المنصة (بريدهم وأدوارهم) و**كل مفاتيح API الخام** (`user_api_keys.key` مخزّنة كنص صريح حتى بعد أن أضاف الترحيل 005 عمود `key_hash`).
- `earn-xp/route.ts:15-16`: يقبل أي `amount` من العميل بلا سقف وبلا تحقق من إنجاز فعلي — منح ذاتي لملايين XP بأمر واحد.
- لا يوجد أي Rate limiting في الكود رغم أن تعليقات `.env.example` تدّعي وجوده؛ ولا توجد ترويسات CSP/HSTS/X-Frame في `next.config.ts` رغم نفس الادعاء.
- آلية فقدان جلسات العمل اتضحت: `api-fetch.ts` عند عدم الاتصال يعيد استجابة مزيفة `{success:true, offline:true}` فتبدأ الجلسة "بنجاح" و`session.id = undefined` (`work.tsx:262`) فيصمت الإنهاء (`work.tsx:330`) وتُفقد الجلسة.

**تأكيد النتائج السابقة:** كلها ما زالت قائمة (withAuth يمرر null كـstring في `auth.ts:97`، المزامنة تعتبر رفض الخادم "متزامناً" وتسحب بمسح السجلات غير المرسلة في `sync-manager.ts:175-181,237-243`، `delete-all` يهمل `work_sessions` و`user_api_keys`، Escape يعيد تفريغ حدث اصطناعي لنفس المستمع — خطر recursion في `keyboard-shortcuts.tsx:263-267`، توكن عام وحدوي في `data.ts:8`، ~20 موضع `ar-SA` بتقويم هجري). **ما تأكد أنه سليم:** مسار MCP POST مُهمَل ويعيد 503 (ليس ثغرة)، وPrisma/SQLite مستخدم فعلاً في وضع المحاكاة المحلي (يبقى كما هو).

---

## المرحلة 0 — شبكة أمان
- `git init` محلي فقط + commit أولي قبل أي تعديل (المجلد بلا git أصلاً؛ هذا لا يحتاج gh ولا remote ويتيح التراجع عن أي خطوة).

## المرحلة P0 — الأمن الحرج
1. **`src/lib/auth.ts`**: في `withAuth`، إذا `userId == null` → رد 401 مباشرة؛ حذف `userId as string`.
2. **حارس أدمن موحّد**: دالة `requireAdmin(req)` جديدة في `src/lib/audit.ts` (تستدعي requireAuth + isAdmin الموجودة أصلاً) واستخدامها في المسارات الأربعة: query/stats/users/api-keys → 403 لغير الأدمن.
3. **`admin/query`**: منع أي `;` في الاستعلام (يغلق multi-statement)، ومنع البادئة `WITH`، مع بقاء قائمة SELECT. (الحل الجذري — RPC للقراءة فقط بصلاحية محدودة — يُوثَّق كمقترح ترحيل SQL لا يُنفَّذ هنا).
4. **`earn-xp`**: سقف server-side للـamount (بحد أقصى 300)، والتحقق من صيغة `reason` مقابل أنماط مسموحة (`task:*|habit:*|work:*|morning:*|deepwork:*`)، ورفض غير المطابق.
5. **تسريب المفاتيح**: في `admin/api-keys` استبعاد عمود `key` من select وقناع العرض (أول 6 أحرف + …) والاعتماد على `key_hash`.
6. **استبدال التوكن الوحدوي**: وحدة جديدة `src/lib/request-context.ts` باستخدام `AsyncLocalStorage` من Node؛ `sb()` في `data.ts` يقرأ منها، والمسارات تستدعي `runWithRequest(req, ...)` بدل `setCurrentAuthToken`. تحديث المواضع المستدعية (~6 ملفات).

## المرحلة P1 — فقدان البيانات
7. **`sync-manager.ts`**: في pushUnsynced — أخطاء الشبكة/5xx تبقى غير متزامنة (إعادة محاولة)، و4xx فقط تُعلَّم متزامنة مع نسخة في سجل فشل محلي بدل الصمت. في pullFromServer — دمج upsert-by-id بدل `clear()+refill`، وحذف السجلات المحلية الغائبة عن الخادم فقط إذا لم تكن unsynced.
8. **`delete-all`**: إضافة `work_sessions` و`user_api_keys` إلى قائمة الجداول.
9. **`keyboard-shortcuts.tsx`**: حذف الـdispatch الاصطناعي بالكامل (حوارات Radix تقفل بـEscape أصلًا) — مجرد `return`.

## المرحلة P2 — الوظائف
10. **`work.tsx`**: إذا كانت الاستجابة تحمل `offline:true` → رسالة واضحة «بدء جلسة العمل يتطلب اتصالاً» وإلغاء البدء (fail-closed) بدل جلسة بلا معرّف.
11. **التواريخ**: استبدال `'ar-SA'` بـ`'ar-EG'` (ميلادي بتسميات عربية) في 8 ملفات (~20 موضعاً): finance, health, goals, journal, habits, dashboard, deep-work, admin-panel.
12. **401 بدل 200 فارغ** في tasks GET وما شابهه عند غياب المصادقة، مع مراجعة تعامل الواجهات مع 401.
13. **ترويسات أمنية** في `next.config.ts`: X-Frame-Options DENY، nosniff، Referrer-Policy، HSTS، وCSP متحفظة (default-src 'self'، style-src 'unsafe-inline' مؤقتاً لتوافق Next).
14. **Rate limiting فعلي**: وحدة `src/lib/rate-limit.ts` (عدّاد بالذاكرة) على auth login/signup/resend وearn-xp ومسارات AI.

## المرحلة P3 — نظافة وتوثيق
15. تعليق توثيقي أعلى `prisma/schema.prisma` يوضح أنه لوضع المحاكاة فقط وأن الحقيقة للإنتاج هي ترحيلات Supabase (بدون تغييرات بنية).
16. ملاحظة في التقرير النهائي: ازدواج lockfiles (bun.lock + package-lock.json) — قرار حذف أحدهما يُترك للمستخدم.

## التحقق بعد التنفيذ
- `npm run build` (يفحص الأنواع أيضاً لأن ignoreBuildErrors=false).
- فحوص يدوية عبر dev server إن أمكن تشغيله: admin/query كمستخدم عادي → 403، earn-xp بمبلغ 99999 → رفض، Escape لا يسبب recursion، delete-all يشمل work_sessions.
- تحديث ذاكرة الجلسة (`riseos-review-findings-2026-08`) بحالة ما أُصلح وما بقي.

**الملفات المتوقعة التعديل (~20):** auth.ts، audit.ts، data.ts، request-context.ts (جديد)، rate-limit.ts (جديد)، sync-manager.ts، api-fetch.ts (توثيق offline flag)، 4 مسارات أدمن، earn-xp، tasks، delete-all، next.config.ts، keyboard-shortcuts.tsx، work.tsx، و8 ملفات تواريخ.