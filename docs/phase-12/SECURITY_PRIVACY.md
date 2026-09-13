# الأمان والخصوصية — Security Gate (المرحلة 13 من خطة المالك)

> الهدف من المرحلة في الخطة: «عمل Security Gate قبل دخول مستخدمين حقيقيين بكثرة».
> هذه الوثيقة تقفل بند المرحلة بتوثيق حالة كل عنصر من الـ Checklist مع الدليل
> من الكود والهجرات والتقارير — لا مجرد «تم». (مجلد docs/phase-12/ يوازي
> الترقيم الداخلي لمستند الخطة الذي يعدّها القسم 14؛ تعداد المالك يسميها المرحلة 13.)

## حالة الـ Checklist

| # | البند | الحالة | الدليل / التنفيذ |
|---|-------|--------|------------------|
| 1 | RLS audit لكل جدول خاص | ✅ | هجرات 005/008/013/019/022/024/030/031 بنمط fail-closed (REVOKE من الجميع ثم GRANT الحد الأدنى)؛ تقرير `SECURITY_HARDENING_REPORT_FINAL` يوثّق تفعيل RLS عبر مخطط البيانات كله + triggers ملكية عابرة للجداول (focus→task) |
| 2 | API authorization audit | ✅ | `requireUser`/`requireAdmin` (api-auth.ts / audit.ts) + سياق توكن ALS بعد إصلاح 27-c (ربط التوكن تزامنيًا قبل أول await) + 38 مسار mutation بحماية idempotency + فحص CSRF للمصدر في middleware |
| 3 | Rate limiting للنقاط الحساسة | ✅ | middleware.ts: 28 قاعدة بسقوف مخصصة (login 5/د، signup 3/د، delete-account 2/د، كتابة المجتمع بمضادات سبام…) + Upstash موزع + fallback ذاكرة — ⚠️ متغيرات Upstash على المالك (انظر الأسفل) |
| 4 | Input validation | ✅ | `validators.ts` (Zod) على مسارات المالية/التركيز/الإشعارات + CHECK constraints في المخطط + `community_media_valid` (بنية المرفقات STRICT: نوع/مفتاح/حجم) |
| 5 | XSS عند عرض محتوى المجتمع | ✅ | `sanitize.ts` + عرض React النصي (escaping تلقائي) — لا `dangerouslySetInnerHTML` في الواجهة إلا JSON-LD ثابت في page.tsx |
| 6 | Secure session/cookie handling | ✅ | كوكيز httpOnly + Secure + SameSite=Lax؛ الـrefresh من كوكي `rise-refresh` فقط؛ `sync-token` مقفول دائمًا (410)؛ عملاء auth معزولون لكل طلب (BFF) |
| 7 | Storage permissions audit | ✅ | قرار المالك: بايتات الميديا خارج Supabase (Cloudinary) — السجل والحصص في `media_objects` (RLS select-own فقط، كل الكتابة service_role، هجرة 031) + روابط رفع موقّعة خادميًا (presign) |
| 8 | MCP security audit | ✅ | MCP v3.1: عزل user_id في كل استعلام، rate limit 60/د + 600/س، توكيد الحذف، مفاتيح rise_ مخزّنة SHA-256 وتُعرض مرة واحدة، OAuth 2.1 + PKCE إلزامي، DCR بعميل ثابت، سجل تدقيق |
| 9 | Secrets management | ✅ | لا `.env` في الريبو (`.env.example` فقط) + CodeQL security-extended أسبوعيًا + `bun audit` (security-scan.yml) + الأسرار في Vercel/Supabase فقط — التدوير مسؤولية المالك |
| 10 | Logs للأحداث الحساسة | ✅ | `audit.ts` + دفتر التدقيق (013) + `error_logs` (011) + تبويبات الأدمن (audit / health-errors) + تدقيق MCP |
| 11 | Backup/restore plan | ✅ **جديد** | `docs/phase-12/BACKUP_RESTORE.md` — جرد الأصول، ثلاث طبقات، أوامر جاهزة، إجراء استعادة خطوة بخطوة، جدول RPO/RTO |
| 12 | حذف/تصدير بيانات المستخدم | ✅ | `/api/auth/delete-account` + `/api/rise/delete-all` + `/api/rise/export` — كلها تحت rate limiting (2/د و2/د و5/د) |
| 13 | Cookie/consent review للإعلانات | ✅ **جديد** | NPA افتراضيًا (سكربت مضمن قبل adsbygoogle.js) + لافتة `ad-consent.tsx` + hook إعادة فتح `rise:ads-consent` + رابط سياسة الخصوصية |

## الجديد في هذه الجلسة (إغلاق البندين 11 و13)

### 1) موافقة الإعلانات — «الخصوصية أولًا» (البند 13)

- **سكربت مضمن في `layout.tsx`** يقرأ `awj-ads-consent` من localStorage تزامنيًا
  في `<head>` **قبل** تحميل `adsbygoogle.js`، ويضبط
  `requestNonPersonalizedAds = 1` لكل من لم يوافق صراحة — أي أن
  **الإعلانات المخصصة هي الاستثناء الذي يحتاج موافقة**، لا العكس.
- **`src/components/rise/ad-consent.tsx`**: لافتة عربية RTL تظهر مرة
  واحدة لأول زيارة (موافقة / إعلانات غير مخصصة + رابط سياسة الخصوصية)؛
  إعادة الفتح لاحقًا عبر `window.dispatchEvent(new Event('rise:ads-consent'))`
  (hook جاهز لشاشة الإعدادات).
- القرار يمس إعلانات Google فقط — بيانات أوج نفسها محلية ومشفّرة أصلًا
  (secure-offline-db) ولا تُشارك.
- **ملاحظة EEA/أوروبا**: زوار الاتحاد الأوروبي يحتاجون للامتثال الكامل
  CMP معتمدًا من Google — النهج الحالي (NPA افتراضيًا + موافقة صريحة)
  هو التطبيق العملي الآمن لجمهورنا الحالي؛ عند نمو زوار EEA فعّل
  Funding Choices / Google CMP من لوحة AdSense.

### 2) خطة النسخ الاحتياطي (البند 11)

`BACKUP_RESTORE.md` (نفس المجلد): ماذا نحمي، بثلاث طبقات (dump يدوي
أسبوعي الآن → Supabase Pro يومي + PITR قبل الإطلاق العام → تصدير
المستخدم الذاتي)، أوامر جاهزة، إجراء استعادة مُختبَر، وRPO/RTO.

### 3) توثيق Upstash في `.env.example` (البند 3)

بدون `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` تعمل حدود
الـrate limiting في الذاكرة لكل-نسخة serverless لا لكل-IP — موثّقة الآن
في `.env.example` مع خطوات الحصول عليها.

## Definition of Done

- ✅ **اختبارات صلاحيات لمستخدم عادي + Free + Plus + Max + Admin**:
  suites الجلسات الخمس — `tests/security-hardening.spec.ts` +
  `tests/session3-security.spec.ts` + `tests/final-security-invariants.spec.ts`
  + `tests/session5-integrity.spec.ts` — تغطي طبقات الخطة عبر البوابة
  الخادمية (`/api/rise/ads` + `user_subscriptions` + `plan_entitlements`)
  وصلاحيات الأدمن (`requireAdmin`).
- ✅ **لا مسار معروف يسمح بتجاوز plan limits من العميل**: كل قرارات الخطة
  والحدود تصدر من الخادم (RPCs ذرية + `plan_entitlements` بحدود يومية/شهرية
  + بوابة الإعلانات الخادمية)؛ العميل يستقبل القرار فقط — التعديل من
  DevTools لا يغيّر قاعدة البيانات، ومحاولات الحذق تصطدم بـRLS وfail-closed.

## المطلوب من المالك (Owner Actions)

1. **Upstash**: أنشئ قاعدة Redis مجانية (upstash.com) وضبط
   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` في Vercel —
   ليصبح الـrate limiting موزعًا حقيقيًا لكل-IP عبر كل نسخ serverless.
2. **النسخ الاحتياطي**: اتبع `BACKUP_RESTORE.md` — على الأقل dump يدوي
   أسبوعي الآن، والترقية لـSupabase Pro قبل الإطلاق العام (نسخ يومية + PITR).
3. **SQL الإصلاح المعلق**: شغّل `supabase/fixes/riseos-fix-composite-functions.sql`
   في Supabase SQL Editor (إصلاح عيب uuid-cast في task-create المكتشف في 27-c).
4. **مراجعة بشرية** لنص سياسة الخصوصية — تأكد أنها تذكر صراحةً ملفات تعريف
   Google للإعلانات (لافتة الموافقة ترابط إليها).
5. **تدوير أسرار**: أي بيانات اعتماد سبقت عمل الـhardening إن كان هناك أي
   احتمال تعرضها (توصية تقرير FINAL).

## مراجع

- `docs/reports/SECURITY_HARDENING_REPORT*.md` (جلسات 1-5 + FINAL + PATCH_NOTES)
- `docs/reports/SUPABASE_SESSION4_SQL.md` / `SUPABASE_SESSION5_SQL.md`
- `SECURITY.md` + `public/.well-known/security.txt`
- `.github/workflows/security-scan.yml` (bun audit + CodeQL أسبوعي)
