# خطة أوج — حالة التنفيذ الكاملة (محينة)

> **آخر تحديث:** 2026-09-14 (جلسة 3) · ✅ **Upstash مكتمل ومتحقق منه حيًا في الإنتاج** (الدليل المطلق: 429 من أول محاولة على عزل جديد كليًا — العدّاد المشترك في Redis) · كل البنود التقنية للمراحل 0-14 مقفولة · التفاصيل في `docs/phase-14/UPSTASH_RETEST.md`
> **مفتاح الرموز:** ✅ منفَّذ ومتحقَّق منه بأدلة · ⏳ مجدول (لم يحن وقته) · 👤 إجراء يدوي على المالك · 🔴 غير مكتمل
> النسخة المعلَّمة بصريًا (علامات [✓] داخل نص الخطة الأصلي): `docs/Awj_Development_and_Launch_Plan.docx`

---

## المرحلة 0 — تثبيت المتطلبات والـMVP ✅
Scope freeze على SaaS شخصي/إنتاجي: الأدوات والبيانات والعمليات والمجتمع أساس القيمة، وMCP ربط للعملاء الخارجيين. القرار موثَّق في الخطة نفسها وفي `docs/ARCHITECTURE.md`.

## المرحلة 1 — Audit وتنظيف المشروع ✅
هجرات التنظيف 001-008 + `docs/phase-0`/`phase-1` · RLS أساسي · تنظيف المخطط.

## المرحلة 2 — Design System وهوية أوج ✅
`docs/phase-2` · مكوّنات rise/* · ثيم RTL عربي (Tajawal/ElMessiri) · dark/light.

## المرحلة 3 — Auth والحساب ✅
هجرة 024 (account security) · BFF كوكيز httpOnly · reset-password · sessions.

## المرحلة 4 — Plans والاشتراكات وUsage Limits ✅
هجرة 025 (plan_entitlements + consume_usage بقفل صف) · طلبات ترقية يدوية · 402 LIMIT_REACHED.

## المرحلة 5 — الإشعارات In-App ✅
هجرات 026/027 · مركز إشعارات · notifyUser بـdedup.

## المرحلة 6 — Web Push ✅
هجرات 028/029 · VAPID من app_config/env · تفضيلات المستخدم.

## المرحلة 7 — Community ✅
هجرات 030/031 · منشورات/تعليقات/تفاعلات/بلاغات · media_objects · moderation.

## المرحلة 8 — Ads للـFree ✅
هجرة 032 · /api/rise/ads بوابة خطة خادمية · consent (NPA) + ads.txt + وسم الناشر.

## المرحلة 9 — MCP للـMax ✅ (13/13)
82 أداة v3.1 · OAuth 2.1+PKCE · Bearer rise_… · rate limits 60/د · audit · confirm للحذف · عزل user_id · 128/128 اختبار E2E · مفاتيح SHA-256.
> ✅ **النسخة الحية على Supabase = v3.1 (منشورة ومتحقق منها 2026-09-14):** رد 401 يحمل `WWW-Authenticate` (علامة v3.x) + `/.well-known/oauth-protected-resource` يعمل 200 · بوابة Free ترد 403 PLAN_REQUIRED · استدعاء call بلا مفتاح rise_ → 401 (رفض واعٍ للكوكيز — قطع CSRF).

## المرحلة 10 — Admin Dashboard ✅ (12/12)
| الوحدة | الحالة | الدليل |
|---|---|---|
| Users | ✅ | تاب كامل: بحث/تصفية/الخطة/الحالة |
| Subscriptions | ✅ | approve/reject/set-plan بمرجع + activated_by + audit + إشعار |
| Usage | ✅ | تاب الإحصاءات (استخدام يومي/شهري) |
| Notifications | ✅ | broadcast نظامي |
| Community | ✅ | moderation queue + بلاغات + حظر |
| Ads | ✅ | `/api/rise/admin/ads` + تاب «الإعلانات»: تشغيل/إيقاف + slots المواضع + Direct Ads CRUD |
| Plans | ✅ | `/api/rise/admin/plans` + تاب «الخطط»: تعديل plan_entitlements (يسري فورًا خادميًا بلا نشر) |
| System | ✅ | `/api/rise/admin/system` + تاب «النظام»: وضع صيانة + أعلام ميزات + حالة النشر + `/api/rise/system/status` عامة |
| Security (4 بنود) | ✅ | requireAdmin على كل مسار + audit_logs + لا شاشة تعتمد Client authorization |

التنفيذ: middleware بوابة صيانة (503 MAINTENANCE_MODE للطفرات غير الإدارية، كاش 30ث، fail-open) + rate limits جديدة + هجرة 035 idempotent.

## المرحلة 11 — Landing + SEO + Legal ✅ (17/17 تقنيًا)
9 صفحات عامة (features/pricing/about/contact/privacy/terms/community-guidelines/refund-policy + الرئيسية) · Metadata + canonical + OG/Twitter للجميع · sitemap (9 مسارات) · robots · JSON-LD (SoftwareApplication/FAQPage/ItemList) · ads.txt · og.png.
- **ربط GSC:** 👤 فقط ضغطة **Verify** من المالك (خاصية URL prefix + الوسمان/الملف حيان) ثم Submit sitemap ثم Request indexing. (دليل الحل في جلسة GSC.)

## المرحلة 12 — الأمان والخصوصية ✅ (15/15)
RLS audit · authorization · rate limiting · input validation · XSS sanitize · كوكيز آمنة · MCP audit · secrets · logs · backup (docs/phase-12/BACKUP_RESTORE.md) · حذف/تصدير البيانات · consent (ad-consent.tsx). فحوصات حية كلها خضراء (رؤوس CSP/HSTS · TLS 1.3 · 429 brute-force · ملفات حساسة 404).

## المرحلة 13 — Performance وReliability ✅
`docs/phase-13/PERFORMANCE_RELIABILITY.md` — 11/12 بندًا بالأدلة + قياسات TTFB حية. 👤 البند الوحيد: مراجعة استهلاك الخدمات (لوحات المالك).
> ✅ **Upstash (الخطة المجانية): مكتمل ومتحقق منه حيًا 2026-09-14 (جلسة 3):** بعد إضافة المالك للمتغيرين: جلسة واحدة → 401×5 ثم 429@6 (رؤوس X-RateLimit كاملة) · مفاتيح العدّاد مسجّلة فعليًا في قاعدة Upstash مع TTL · **والدليل المطلق: عزل جديد كليًا بعد تجاوز الحد → 429 من أول محاولة** (لا مصدر له إلا العدّاد المشترك في Redis). ملاحظة منهجية: اختبار «اتصالات متفرقة» من sandbox واحد غير صالح لأن الـ egress IP يتبدل بين الاتصالات والعدّ لكل IP. الدليل الكامل في `docs/phase-14/UPSTASH_RETEST.md`.

## المرحلة 14 — QA شامل قبل النشر ✅ (31/31 + إعادة فحص 2026-09-14)
`docs/phase-14/QA_PRELAUNCH.md` — 31/31 فحصًا حيًا + دورة حياة حساب كاملة.
**QA كسرت المنتج عمدًا وكشفت 3 أخطاء إنتاج حقيقية — الثلاثة مقفولة الآن:**
1. ❌→✅ حذف الحساب لم يكن يعمل إطلاقًا (TypeError: auth.deleteUser على auth.admin) — أُصلح (b772388).
2. ❌→✅ إبطال الجلسات بعد كلمة المرور/الحذف كان صامت الفشل — أُصلح في 3 مسارات وتحقق حيًا.
3. ⏳→✅ مستخدمو المجتمع لا يُحذفون (audit_logs RESTRICT) — **هجرة 036 مطبقة ومتحقق منها حيًا 2026-09-14**: حذف حساب له منشور + بلاغ ضده = 200، والحساب التجريبي العالق qa-cycle-1789343456 نُظّف بنجاح.
**إعادة فحص ما بعد خطوات المالك (15/15 + 7/7):** بوابات MCP على Free (403 PLAN_REQUIRED / 401 بلا مفتاح) · مسار البلاغ كامل (B يبلّغ عن منشور A → 201 يدخل طابور المراجعة، وبلاغ وهمي → 404) · **منشور → تعليق → إشعار وصل فعلًا لمركز إشعارات صاحب المنشور** («تعليق جديد على منشورك») · تنظيف ذاتي للحسابات التجريبية.
⚠️ الحدود: ✅ كود الحدود مُتحقق منه + **العدّ الموزّع عبر Upstash Redis يعمل في الإنتاج** (تحقق ثلاثي بجلسة موحّدة + فحص المفاتيح مباشرة + 429 على عزل جديد كليًا — جلسة 3).

## المرحلة 15 — Beta مغلقة ⏳
كل البنية جاهزة (إشعارات · أخطاء · أعلام ميزات من تاب النظام · حد قابل للتعديل فورًا من تاب الخطط · حذف الحسابات يعمل 100%). 👤 المستخدم يستدعي أول دفعة مستخدمين حقيقيين.

## المرحلة 16 — Public Launch ⏳
Launch Gate جاهز تقنيًا؛ 👤 الدومين awj.life (آخر خطوة — Vercel A 76.76.21.21 / CNAME www → cname.vercel-dns.com + NEXT_PUBLIC_SITE_URL + Zoho MX/SPF/DKIM/DMARC + إعادة نشر + تحديث GSC/AdSense).

## المرحلة 17 — ما بعد الإطلاق (30 يوم) ⏳
مؤشرات قياس: تاب الإحصاءات + /api/rise/system/status + error_logs.

---

## التعريف بالجاهزية للنشر (Definition of Ready) — الوضع الحالي

| البند | الحالة |
|---|---|
| البراند والاسم ثابتان | ✅ أوج / awj.life |
| الدومين النهائي يعمل | 👤 شراء + ربط awj.life (مؤجل عمدًا للآخر) |
| التسجيل/الدخول/الاستعادة | ✅ حي |
| RLS والصلاحيات مجربة | ✅ (fail-closed + فحوص 401/403) |
| الخطط الثلاث محددة | ✅ (وقابلة للتعديل الآن من تاب الخطط) |
| Usage limits server-side | ✅ (consume_usage داخل DB) |
| الاشتراكات اليدوية end-to-end | ✅ آليًا · 👤 تجربة مرجع حقيقي في Beta |
| Free يرى الإعلانات فقط | ✅ بوابة خادمية · 👤 تحقق أول ظهور AdSense |
| In-App notifications | ✅ (متحقق حيًا: تعليق → إشعار) |
| Web Push | ✅ آليًا · 👤 تجربة جهاز حقيقي في Beta |
| Community + moderation | ✅ (البلاغ → الطابور متحقق حيًا) |
| MCP لـMax فقط | ✅ **v3.1 حية** · 👤 إعادة ربط موصل ChatGPT بالمفتاح الحالي |
| Admin Dashboard | ✅ 12/12 |
| Legal منشورة | ✅ (+ 👤 مراجعة بشرية للنصوص) |
| SEO basics + sitemap + robots | ✅ · 👤 Verify GSC |
| Error logging/monitoring | ✅ |
| Backups | ✅ (خطة موثقة) · 👤 أول dump أسبوعي |
| QA regression | ✅ آلي 31/31 + إعادة فحص · Beta البشرية ⏳ |
| Beta بدون مشاكل مانعة | ⏳ |
| خطة rollback | ✅ (git revert + Vercel instant rollback) |

## أوامر المالك المتبقية
1. GSC: **Verify** بخاصية URL prefix ثم Submit `sitemap.xml` ثم Request indexing لكل صفحة.
2. ~~نشر MCP v3.1~~ ✅ تم 2026-09-14 — يُنصح بإعادة ربط موصل ChatGPT/Gemini للتأكد من 82 أداة (`tools/list`).
3. ~~**Upstash**~~ ✅ **تم ومتحقق منه حيًا 2026-09-14 (جلسة 3):** أضاف المالك المتغيرين في Vercel مع بناء جديد، والأدلة الثلاثة قاطعة:
   - جلسة واحدة (IP واحد): 401×5 ثم **429@6** مع رؤوس `X-RateLimit-Limit: 5` · `X-RateLimit-Remaining: 0`.
   - مفاتيح `@upstash/ratelimit:ratelimit:{IP}:/api/auth/login:{bucket}` مسجّلة فعليًا في قاعدة Upstash مع TTL (فحص مباشر للقاعدة).
   - **الدليل المطلق:** جلسة جديدة كليًا (عزل + اتصال جديد) فور تجاوز الحد → **429 من أول محاولة** — لا مصدر له إلا العدّاد المشترك في Redis.
   - (نظافة اختيارية لاحقًا: توليد توكن Upstash جديد لتحل محل المُشارَك في المحادثة — ثم تحديثه في Vercel وبناء جديد.)
4. ~~تطبيق الهجرات 035/036~~ ✅ تم ومتحقق حيًا (حذف مستخدم مجتمع = 200). ~~حذف الحساب التجريبي العالق~~ ✅ نُظّف.
5. Beta مغلقة → ثم الدومين awj.life أخيرًا.
6. ⚠️ **إبطال توكن GitHub (ghp_aUh5…)** — انتهى استخدامه في هذه الجلسات.
