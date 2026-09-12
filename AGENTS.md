# AGENTS.md

Canonical instruction file for this repository, shared by all coding agents
(Claude Code, Codex, Cursor, and others). Claude Code reaches it through the
`@AGENTS.md` import in `CLAUDE.md`. Repository guidance belongs here, while
tool-specific pointer files contain no duplicate guidance.

## Project knowledge

**أوج / awj.life (rise-os)** — نظام حياة شخصي متكامل عربي RTL أولاً:
إنتاجية، عادات، أهداف، عمل عميق، صحة، مالية، تعلّم، ومجتمع.
الإنتاج: `https://rise-os-gamma.vercel.app` — ينشر تلقائياً من `main` عبر Vercel.

### Commands

- Install: `npm install` (لا تستخدم bun — `bun.lock` أُزيل؛ npm هو المدير الرسمي)
- Build: `npm run build` (يشغّل `prisma generate` ثم `next build`)
- Lint: `npm run lint` (ESLint 9 flat config)
- Start (بعد build): `npm start` — يشغّل `.next/standalone/server.js`
- Typecheck: `npx tsc --noEmit`
- E2E: `npx playwright test` (Playwright مثبّت لكن يتطلب متصفحات: `npx playwright install`)

### Conventions

- **اللغة**: واجهة وتعليقات عربية أولاً (`dir="rtl"`)؛ أسماء المتغيرات والدوال بالإنجليزية.
  التعليقات التوضيحية تُكتب بالعربية بأسلوب موجز (انظر ترويسة `community.tsx` نموذجاً).
- **كل وحدة UI كبيرة** تبدأ بتعليق ترويسة يشرح: الغرض، البنية الداخلية، مبادئ UX.
  الوحدات الضخمة (1000+ سطر) تُقسم بفواصل تعليقات `// ── قسم ──` عند الحدود المنطقية.
- **طبقة التحكم**: منطق جلب البيانات/الطفرات للشاشات الكبيرة يُستخرج إلى `src/hooks/use-*-controller.ts`
  أو `use-*-data.ts` (أنماط قائمة: `use-dashboard-data`, `use-tasks-controller`, `use-ambient-sounds`).
  المكون يبقى عرضاً فقط.
- **طبقة البيانات**: الوصول للبيانات حصراً عبر الواجهة `data.<domain>` من `src/lib/data/index.ts`
  (facade فوق 25 وحدة نطاق في `src/lib/data/`). لا تستدعِ Supabase من مكونات الواجهة مباشرة.
- **طلبات API من العميل**: دائماً عبر `apiFetch`/`apiPost` من `src/lib/api-fetch.ts` —
  يضيف الجلسة و`Idempotency-Key` تلقائياً للطفرات.
- **كتابة مسارات API**: كل مسار تحت `src/app/api/rise/**` يبدأ بـ `requireUser(req)` من
  `src/lib/api-auth.ts` (يضبط جلسة Supabase + السياق). مسارات الإدارة تستخدم `requireAdmin`.
- **تخزين المتصفح**: ممنوع `localStorage` مباشرة — استخدم `getUserStorage`/`setUserStorage`
  من `src/lib/user-storage.ts` (يعزل قيم المستخدم ببادئة معرّفه).
  استثناءان مقصودان فقط: (1) `rise-user-info` — كاش هوية الجلسة الذي يشتق منه
  user-storage معرف المستخدم نفسه (تديره auth-provider/login-page حصراً)؛
  (2) حالة الجهاز البحتة مثل `rise-pwa-dismissed` (كتم بطاقة التثبيت 24 ساعة —
  التثبيت مفهوم per-device لا per-user).
- **الأفاتار**: قيمة الأفاتار في قاعدة البيانات **مفتاح ثيم** (مثل `ocean-3`) من
  `src/lib/avatars.tsx` (24 ثيماً)، وليست رابط صورة. اعرضها بتدرّج+SVG كما في `community.tsx`
  — لا تمررها أبداً كـ `<img src>` (سبب 404 سابقاً).
- **الأرقام في الواجهة**: تُعرض بأرقام عربية عبر `toArabicNum` من `src/lib/rise-utils.ts`.

### Architecture

```
src/
├── app/                      صفحات Next.js (App Router) + مسارات API
│   ├── app/page.tsx          مُوجِّه الوحدات الوحيد (lazy modules + خريطة MODULES)
│   └── api/                  auth/ (جلسات) + rise/ (40+ مسار أعمال) + webhooks
├── components/rise/          وحدات الأعمال (dashboard, tasks, community...) — 'use client'
├── hooks/                    متحكمات مستخرجة (بيانات/طفرات) للوحدات الكبيرة
├── lib/
│   ├── data/ (index.ts)       الواجهة الجماعية + 25 مستودع نطاق (Supabase RPC)
│   ├── api-fetch.ts          عميل HTTP موحّد (جلسة + idempotency + إعادة محاولة)
│   ├── api-auth.ts           requireUser/requireAdmin لمسارات API
│   ├── supabase.ts           عميل SSR/server، turso.ts المرآة، cloudinary.ts الوسائط
│   └── user-storage.ts       localStorage معزول لكل مستخدم
├── store/app-store.ts        Zustand: activeModule + auth + user
└── middleware.ts             CSP (nonce + strict-dynamic) + rate limit + CSRF + أمان

supabase/                     SQL migrations 001→029 (RLS + RPC + فهارس)
prisma/                       مخطط مرجعي (التشغيل الفعلي عبر Supabase RPC)
docs/                         توثيق المراحل phase-0→7 + ARCHITECTURE.md + reports/
```

**قواعد CSP مهمة**: `connect-src` يجب أن يشمل `https://api.cloudinary.com` (رفع الوسائط)
و`img-src` يسمح بـ `https:` (عرض صور المنشورات). CSP يُبنى في `middleware.ts` في موضعين.

**الوسائط**: presign من `POST /api/rise/community/media/presign` → رفع مباشر من
المتصفح إلى Cloudinary → النشر بمفتاح media. **البيانات**: Supabase أساسي،
Turso مرآة قراءة (phase-7c)، Upstash للـ rate limiting.

### سير العمل — منهجية ismail9k/skills

المستودع يتبع منهجية [ismail9k/skills](https://github.com/ismail9k/skills) للتطوير
والتدقيق، وأهمها مهارة `anti-koshary` (تدقيق من مرحلتين):

- **Pass 1 (تقرير بلا تعديل)**: مسح سبعي الأبعاد — انهيار الطبقات، التكرار
  المنطقي، الملفات التي توقفت عن القِراءة، الكود الميت، القطع القابلة
  لإعادة الاستخدام، فحوص الصحة، الأمان والاعتماديات. كل ملاحظة تُذكر مرة
  واحدة مع: ما هي، أين (ملف+سطر)، لماذا تهم، والإصلاح المقترح.
- **Pass 2 (إصلاح بعد الموافقة)**: الأمني أولاً، ثم الهيكلي (لا يغير السلوك
  من دون إعلان صريح)، ثم الاعتماديات (patch/minor فقط)، ثم بقية الأمان.
  كل مجموعة تُثبت أن البناء سليم قبل التالية وتُرتك منفصلة.
- **قواعد ذهبية**: أصغر تغيير يحل الملاحظة؛ لا تلمس منطق الأعمال من دون
  سؤال؛ لا تعيد كتابة كود يعمل لأنه لا يروق لك أسلوبياً؛ لا تدّعي أن تعديلاً
  «آمن» بلا اختبارات — قل ما تحققته فعلاً.

المراحل الأخرى من المستودع (brainstorm-to-issue، implement-issues، review-prs)
تُستخدم عند تتبع الأفكار في GitHub Issues قبل بنائها — الفكرة تُحوّل Intent
Issue يحمل سياقها عبر spec/plan/PR ثم يُغلق بالربط الرجعي.

### Lint — الدين المعروف (خط الأساس)

`npm run lint` يقف عند **56 مشكلة معروفة وموثقة** (47 خطأ + 9 تحذيرات)
بعد استبعاد `scripts/` (أدوات تطوير لا تُشحن — تستخدم require() عمداً).
هي حصراً من فئتين ولا تُصلح بالجملة:

1. **صرامة React Compiler** (`set-state-in-effect` ×37 وما جاورها): نمط
   «جلب البيانات عند التركيب ثم setState» القياسي في React — يعمل صحيحاً؛
   إصلاحها يتطلب إعادة هيكلة 15+ ملفاً أساسياً بلا مكسب مرئي = مخاطرة
   تراجع بلا مبرر. تُصلح ملفاً ملفاً عند لمس الشاشة لأي سبب آخر.
2. **تنقّلات كاملة مقصودة** (`window.location.href` ×7): في الخروج/حذف
   الحساب/استرداد كلمة المرور/حد الأخطاء — إعادة التحميل الكاملة تنقي
   حالة العميل عمداً. تحويلها لـ router.push() سيكون تراجعاً.

أي مساهمة جديدة يجب أن لا تضيف فوق هذا الخط (56 = السقف لا الهدف).

### Things agents get wrong

- قيمة `avatar` في DB مفتاح ثيم (`ocean-3`) وليست URL — تمريرها كـ img يسبب 404.
- طفرات POST/PUT/PATCH/DELETE بدون `Idempotency-Key` ترجع 428 — دع `apiFetch` يضيفها.
- `test` في `.gitignore` بنمط bare حذف مسار `push/test` سابقاً — تأكد أن ملفاتك ملتزمة فعلاً.
- مسارات `/api/rise/*` بدون جلسة ترجع 401 بالتصميم — اختبر بجلسة (انظر `docs/reports/` لحساب QA).
- كل تعديل على CSP يجب أن يُطبَّق في الموضعين داخل `middleware.ts` (رأس الاستجابة + رأس الطلب).
- البناء يفشل صامتة إن نسيش `prisma generate` — استخدم `npm run build` كما هو.
- `/api/rise/export` عند فشل حقيقي يرد **500 صريحاً** (لا ملف fallback وهمياً)
  — العميل يلتقط !res.ok ويعرض toast الخطأ. لا تُرجع 200 فارغاً أبداً.
- بطاقات إحصاءات الأدمن (`/api/rise/admin/stats`): التخزين/الذكاء مجمّعان
  فعلياً من user_storage.storage_used و user_ai_usage.total_used — إن عدت 0
  تحقق من الجدولين لا من الكود.
