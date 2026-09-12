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

### Things agents get wrong

- قيمة `avatar` في DB مفتاح ثيم (`ocean-3`) وليست URL — تمريرها كـ img يسبب 404.
- طفرات POST/PUT/PATCH/DELETE بدون `Idempotency-Key` ترجع 428 — دع `apiFetch` يضيفها.
- `test` في `.gitignore` بنمط bare حذف مسار `push/test` سابقاً — تأكد أن ملفاتك ملتزمة فعلاً.
- مسارات `/api/rise/*` بدون جلسة ترجع 401 بالتصميم — اختبر بجلسة (انظر `docs/reports/` لحساب QA).
- كل تعديل على CSP يجب أن يُطبَّق في الموضعين داخل `middleware.ts` (رأس الاستجابة + رأس الطلب).
- البناء يفشل صامتة إن نسيش `prisma generate` — استخدم `npm run build` كما هو.
