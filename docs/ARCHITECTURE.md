# معمارية أوج (rise-os) — الخريطة الكاملة

> هذا الملف هو نقطة الدخول لفهم المشروع بأكمله. اقرأه قبل تعديل أي شيء.
> آخر تحديث: 2026-09-12 (بعد phase-7c: Turso + Cloudinary).

## نظرة عامة — الطبقات الأربع

```
┌─────────────────────────────────────────────────────────────┐
│ 1. العرض (Presentation)                                     │
│    src/components/rise/*.tsx  — 20+ وحدة أعمال 'use client' │
│    src/app/app/page.tsx      — الموجّه الوحيد (lazy load)   │
└────────────────────────┬────────────────────────────────────┘
                         │ يستدعي (لا يعرف Supabase إطلاقاً)
┌────────────────────────▼────────────────────────────────────┐
│ 2. التحكم (Controllers)                                     │
│    src/hooks/use-*-controller|data.ts — منطق الجلب والطفرات │
│    src/store/app-store.ts (Zustand)    — الحالة العامة      │
└────────────────────────┬────────────────────────────────────┘
                         │ يستدعي عبر apiFetch أو data.*
┌────────────────────────▼────────────────────────────────────┐
│ 3. الأعمال والوصول (Services + Repositories)                 │
│    src/lib/api-fetch.ts   — عميل HTTP موحّد (جلسة+idempotency)│
│    src/lib/data/ (index.ts) — 25 مستودع نطاق (facade pattern) │
│    src/lib/api-auth.ts    — requireUser/requireAdmin        │
│    src/lib/{cloudinary,turso,supabase,...}.ts — الخدمات      │
└────────────────────────┬────────────────────────────────────┘
                         │ SQL/RPC + RLS
┌────────────────────────▼────────────────────────────────────┐
│ 4. البيانات (Persistence)                                   │
│    Supabase Postgres — المصدر الأساسي (38 جدولاً + 40 RPC)   │
│    Turso (libSQL)    — مرآة قراءة للمجتمع (phase-7c)        │
│    Cloudinary        — تخزين وسائط المجتمع                   │
│    Upstash Redis     — rate limiting                        │
└─────────────────────────────────────────────────────────────┘
```

**القاعدة الذهبية**: كل سهم يذهب لأسفل فقط. مكون عرض لا يستدعي Supabase،
ومستودع بيانات لا يُرجع JSX. أي كود يخلط الطبقتين = "كوشري" يُرفض في المراجعة.

## خريطة الوحدات (20 وحدة أعمال)

| الوحدة | الملف | المتحكم/البيانات | الوصف |
|---|---|---|---|
| لوحة التحكم | `dashboard.tsx` (2071) | `use-dashboard-data` | KPIs + مؤشرات اليوم |
| المجتمع | `community.tsx` (983) | `lib/community-*.ts` | خلاصة/منشورات/تعليقات/وسائط |
| المهام | `tasks.tsx` (1336) | `use-tasks-controller` | مهام + مهام فرعية + XP |
| المشاريع | `projects.tsx` (1104) | `data.projects` | مشاريع وربط بالمهام |
| الأهداف | `goals.tsx` (1044) | `data.goals` | أهداف كمّية وتقدم |
| العمل العميق | `deep-work.tsx` (1292) | `use-ambient-sounds` | جلسات تركيز + مؤقت + صوت |
| المخطط اليومي | `daily-planner.tsx` (1410) | `data.plannerItems` | كتل اليوم والجداول |
| الروتين الصباحي | `morning-routine.tsx` (1269) | `data.morningLogs` | خطوات الصباح والتقييم |
| العادات | `habits.tsx` (1137) | `data.habits/habitLogs` | تتبع يومي وسلاسل |
| اليوميات | `journal.tsx` (1014) | `data.journals` | كتابة ومراجعة |
| الصحة | `health.tsx` (1127) | `data.healthLogs` | نوم/طاقة/مقاييس |
| المالية | `finance.tsx` (1309) | `data.financeRecords` | معاملات وميزانية |
| القراءة | `reading.tsx` (1010) | `data.books` | كتب وجلسات قراءة |
| التعلم | `learning.tsx` (1302) | `data.knowledgeItems` | بطاقات وموارد تعلم |
| الدماغ الثاني | `second-brain.tsx` (806) | `data.knowledgeItems` | ملاحظات منظمة (PARA) |
| التقويم | `calendar.tsx` (670) | تجميع من عدة مستودعات | عرض شهري موحد |
| المراجعة الأسبوعية | `weekly-review.tsx` (754) | `data.dailyScores` | تحليل ومساءلة |
| المراجعة الشهرية | `monthly-review.tsx` (758) | `data.dailyScores` | اتجاهات شهرية |
| التحليلات | `analytics.tsx` (1086) | `aggregate-cache` | رسوم بيانية متراكمة |
| الإعدادات | `settings.tsx` (1495) | عدة خدمات | ملف/أفاتار/دفع/إشعارات |

**الصفحة الهبوط**: `landing.tsx` (735) — لا تحتاج جلسة.
**لوحة الإدارة**: `admin-panel.tsx` (1873) — `requireAdmin` + تابات مستقلة.

## تدفّق طلب واحد (مثال: إنشاء مهمة)

```
المستخدم يضغط «إضافة» في tasks.tsx
  → use-tasks-controller.createTask()
    → apiPost('/api/rise/tasks', body)          [api-fetch.ts يضيف:
        جلسة الكوكيز + Idempotency-Key + CSRF origin]
      → app/api/rise/tasks/route.ts
        → requireUser(req)                      [api-auth.ts: يتحقق من الجلسة
            ويضبط السياق على عميل Supabase]
          → data.tasks.create(...)              [lib/data/tasks.ts: يستدعي RPC
              مع user_id من الجلسة — RLS يفرض العزل]
            → Supabase Postgres (RPC + RLS)
```

الاستجابة تعود نفس المسار صعوداً؛ `apiFetch` يوحّد معالجة الأخطاء (401 →
تسجيل خروج، 429 → رسالة انتظار). المتحكم يحدّث الحالة المحلية تفاؤلياً
ثم يصالحها مع الاستجابة (optimistic reconciliation).

## تدفّق الوسائط في المجتمع (Cloudinary)

```
اختيار صورة في community.tsx
  → POST /api/rise/community/media/presign     [يعيد: publicId + توقيع + مفتاح]
    → POST https://api.cloudinary.com/...        [رفع مباشر من المتصفح —
        CSP connect-src يسمح بـ api.cloudinary.com]
      → نشر المنشور مع {mediaId, key}           [السيرفر يسجّل الوسيط]
        → الخلاصة تعيد media[].url              [روابط res.cloudinary.com]
```

**لماذا presign؟** مفتاح السر لا يصل للمتصفح أبداً — التوقيع يُولَّد على
السيرفر لصلاحية محدودة، والرفع يتم بلا اعتمادات دائمة.

## المصادقة والأمان (طبقة عرضية)

- **الجلسة**: كوكيز httpOnly (Supabase refresh) — `src/lib/cookie-auth.ts`
  و`auth-pkce.ts` لتبادل PKCE في التسجيل/الدخول.
- **كل مسار أعمال** يبدأ بـ `requireUser` (401 فورية بدون جلسة)؛
  الإدارة بـ `requireAdmin`.
- **Idempotency**: كل طفرة تحمل مفتاح UUID — التكرار الشبكي لا ينشئ
  سجلاً مزدوجاً (إرجاع 428 عند غيابه — `src/lib/idempotency.ts`).
- **CSP**: nonce لكل طلب + strict-dynamic (يُبنى في `middleware.ts`).
- **Rate limiting**: Upstash لكل مسار حساس (`middleware.ts` + `RATE_LIMITS`).
- **RLS**: كل جدول في Supabase مفروض على `auth.uid()` — العزل حتى لو
  تسرب مسار. الهجرات في `supabase/` (001→029).

## القرارات المعمارية المسجّلة (ADR مختصرة)

| # | القرار | البديل المرفوض | السبب |
|---|---|---|---|
| 1 | Supabase RPC بدل Prisma Client | Prisma مباشرة | RLS + دوال SQL معزولة أقوى للعزل متعدد المستخدمين |
| 2 | Prisma يبقى كمخطط مرجعي فقط | حذفه | توثيق الأنواع موحّد للجداول المشتركة |
| 3 | Turso مرآة قراءة للمجتمع فقط | ترحيل كامل | المجتمع يقرأ كثيراً ويكتب قليلاً — قراءة رخيصة عند الحواف |
| 4 | Cloudinary للوسائط (بديل R2) | R2 | طلب المالك + presign أسهل + تسليم CDN جاهز |
| 5 | Zustand للحالة العامة | Redux/Context | حجم صغير + selectors بدون re-render |
| 6 | واجهة `data.*` facade | استيراد مباشر | نقطة واحدة للتغيير عند تبديل المستودعات |
| 7 | lazy loading للوحدات العشرين | حزم كاملة | سرعة تحميل /app الأولية |
| 8 | sonner وحده للإشعارات المرئية | نظامان | قرار phase-2: نظام واحد أبسط |

## الحزم والأدوات

- **Next.js 15** (App Router + Turbopack + standalone output)
- **TypeScript** صارم، ESLint 9 (flat config)
- **Tailwind CSS 4** + shadcn/ui (Radix) — `components.json`
- **Zustand** للحالة، **TanStack Query** للكاش في بعض الوحدات
- **@supabase/supabase-js** للخادم، **@libsql/client** لـ Turso
- **Prisma** (توليد أنواع فقط)، **Playwright** للاختبارات

## أين أضع كوداً جديداً؟

| نوع الكود | المكان | مثال |
|---|---|---|
| شاشة/وحدة UI | `src/components/rise/<module>.tsx` | `finance.tsx` |
| منطق جلب/طفرات لشاشة كبيرة | `src/hooks/use-<module>-controller.ts` | `use-tasks-controller.ts` |
| مسار API | `src/app/api/rise/<domain>/route.ts` | `tasks/route.ts` |
| مستودع بيانات نطاق | `src/lib/data/<domain>.ts` (ثم صدّره من `index.ts`) | `tasks.ts` |
| خدمة عامة (لا تخزين) | `src/lib/<service>.ts` | `gamification.ts` |
| هجرة قاعدة بيانات | `supabase/0NN_<وصف>.sql` | `029_push_defaults.sql` |
| حالة عامة بين الوحدات | `src/store/app-store.ts` | `activeModule` |

**قبل فتح PR**: `npm run build` يجب أن ينجح، و`npm run lint` بلا أخطاء جديدة،
وكل طفرة جديدة تحمل Idempotency-Key، وكل مسار جديد يبدأ بـ requireUser.
