<div align="center">

# 🌿 RiseOS — نظام تشغيل الحياة

### صُنع بأيدٍ عربية eg

**نظام إنتاجية شامل** يدمج ٢٠ أداة في واجهة واحدة لتمكينك من امتلاك صباحك وحياتك.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_%26_DB-3ECF8E?logo=supabase)](https://supabase.com/)
[![shadcn/ui](https://img.shields.io/badge/shadcn/ui-Components-black)](https://ui.shadcn.com/)

</div>

---

## 📋 فهرس

- [ما هو RiseOS؟](#-ما-هو-riseos)
- [لقطات من التطبيق](#-لقطات-من-التطبيق)
- [الوحدات الـ ٢٠](#-الوحدات-ال-٢٠)
- [الهندسة المعمارية](#-الهندسة-المعمارية)
- [قاعدة البيانات](#-قاعدة-البيانات)
- [الـ API Routes](#-api-routes)
- [نظام الأمان](#-نظام-الأمان)
- [PWA ودعم الأوفلاين](#-pwa-ودعم-الأوفلاين)
- [التصميم ونظام الألوان](#-التصميم-ونظام-الألوان)
- [الإعداد والتشغيل](#-الإعداد-والتشغيل)
- [هيكل المشروع](#-هيكل-المشروع)
- [الحالة الحالية](#-الحالة-الحالية)
- [خارطة الطريق](#-خارطة-الطريق)

---

## 🤔 ما هو RiseOS؟

**RiseOS** ليس مجرد تطبيق مهام — هو **نظام تشغيل كامل لحياتك**. يدمج بين:

- 🧠 **إدارة الذات**: روتين صباحي، عادات، يوميات، صحة
- ⚡ **الإنتاجية**: مهام مع تبعيات، مشاريع، أهداف، تخطيط يومي
- 📚 **التطوير الذاتي**: قراءة، تعلم، دماغ ثاني (Second Brain)
- 📊 **التحليلات**: درجة إنتاجية يومية، رسوم بيانية، مراجعات أسبوعية وشهرية
- 🤖 **الذكاء الاصطناعي**: مدرب ذكي بالعربية (ZhipuAI مع Fallback ذكي)
- 🎮 **اللعب (Gamification)**: XP، مستويات، ١٥ شارة، سلاسل (Streaks)

كل شيء في **مكان واحد**، بتصميم **premium** باللغة العربية مع دعم كامل لـ **RTL**.

---

## 🖼️ لقطات من التطبيق

| لوحة التحكم | المهام (Kanban) | المدرب الذكي |
|:---:|:---:|:---:|
| درجة إنتاجية دائرية، رسوم بيانية أسبوعية، جدار تحفيز، تتبع الأهداف | أعمدة Kanban مع Drag & Drop، تبعيات المهام، فلترات متعددة | محادثة AI بالعربية، اقتراحات سريعة، أفاتار مداري متحرك |
| | | |

| العادات | العمل العميق | التقويم |
|:---:|:---:|:---:|
| خريطة حرارية، تذكيرات، درجة إنجاز اليوم، أفضل سلسلة | مؤقت بومودورو، Focus Zone، ربط بالمهام، اقتباسات تحفيزية | عرض شهري/أسبوعي، مهام اليوم، نقاط ملونة، لوحة انزلاقية |

---

## 🧩 الوحدات الـ ٢٠

### 📊 الأساسية
| # | الوحدة | الوصف |
|---|--------|-------|
| 1 | **لوحة التحكم** | درجة إنتاجية يومية (0-100)، رسوم بيانية، تتبع الأهداف، جدار تحفيز (٢٤ اقتباس)، تقدم المهام والعادات، "في مثل هذا اليوم" |
| 2 | **الروتين الصباحي** | ٧ خطوات (ماء، صلاة، رياضة، قراءة، تأمل، أهداف، شكر) مع توقيت، حلقة تقدم، رسائل تحية ديناميكية |
| 3 | **المخطط اليومي** | ٤ أقسام (صباح، ظهر، مساء، ليل) مع ساعة حية، سحب وإفلات، ملاحظات سريعة، حفظ في قاعدة البيانات |
| 4 | **المهام** | عرض Kanban (Todo → In Progress → Done)، Drag & Drop، تبعيات، أولويات ملونة، ربط بالمشاريع، XP عند الإنجاز |
| 5 | **المشاريع** | حلقات تقدم متدرجة، ألوان مخصصة، إحصائيات المهام، مشروع مميز (Hero)، لوحة الفريق |
| 6 | **الأهداف** | أنواع (سنوي/ربع سنوي/شهري/أسبوعي)، معالم (Milestones)، لوحة رؤية (Vision Board)، أشرطة shimmer |

### 🎯 النمو الشخصي
| # | الوحدة | الوصف |
|---|--------|-------|
| 7 | **تتبع العادات** | خريطة حرارية (Heatmap)، تذكيرات بالوقت، سلاسل، Toggle سريع، درجة إنجاز اليوم (A-D) |
| 8 | **اليوميات** | مزاج يومي مع Sparkline، طاقة، تتبع السلسلة، تنسيق MDX، محرر متقدم |
| 9 | **العمل العميق** | مؤقت بومودورو، Focus Zone (وضع تركيز مُعتّم)، ربط الجلسات بالمهام، اقتباسات تحفيزية |
| 10 | **القراءة** | كتب مع تقدم ونجوم، Tilt Cards ثلاثية الأبعاد، سلسلة القراءة، تصنيفات ملونة |
| 11 | **التعلم** | شجرة المهارات (SVG)، Progress Rings، أهداف تعلم، رادار المهارات |
| 12 | **الصحة** | نوم/ماء/خطوات/مزاج/طاقة، درجة صحة يومية (0-100)، مقارنة أسبوعية، رؤى صحية تلقائية |

### 💰 الإدارة
| # | الوحدة | الوصف |
|---|--------|-------|
| 13 | **المالية** | إيرادات ومصروفات، ٨ فئات ميزانية، هدف ادخار متحرك، رسم تدفق نقدي (Waterfall)، تقرير شهري |
| 14 | **التقويم** | عرض شهري/أسبوعي، مهام اليوم مع نقاط ملونة، لوحة انزلاقية عند النقر، إحصائيات شهرية |

### 🧠 المعرفة
| # | الوحدة | الوصف |
|---|--------|-------|
| 15 | **الدماغ الثاني** | ملاحظات سريعة (Quick Capture)، ٧ أنواع محتوى، سحابة وسوم ديناميكية، "فكرة عشوائية"، شوهد مؤخراً |

### 📈 المراجعة والتحليل
| # | الوحدة | الوصف |
|---|--------|-------|
| 16 | **المراجعة الأسبوعية** | Auto-Fill من API، رسوم رادار SVG، أشرطة متحركة، كونفيتي عند الحفظ |
| 17 | **المراجعة الشهرية** | "الشهر في أرقام" مع Animated Counter، أفضل إنجاز بتوهج ذهبي، رسوم رادار |
| 18 | **التحليلات** | درجة أداء (A+ إلى F)، Best/Worst Day، سجلات شخصية، رؤى تحليلية عربية تلقائية |

### 🤖 الذكاء
| # | الوحدة | الوصف |
|---|--------|-------|
| 19 | **المدرب الذكي** | محادثة AI بالعربية، ٤ أسئلة مُثبّتة، AIAvatar بحلقات مدارية، اقتراحات ذكية، تتبع الاستخدام الشهري |

### ⚙️ النظام
| # | الوحدة | الوصف |
|---|--------|-------|
| 20 | **الإعدادات** | ملف شخصي + Avatar، أوقات النوم/الصحوة، أهداف صحية، إشعارات، تصدير/استيراد بيانات، لوحة أدمن |

---

## 🏗️ الهندسة المعمارية

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js 16 App Router                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Client (React 19)                   │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐  │  │
│  │  │ Zustand │  │ TanStack │  │  25 Lazy Components │  │  │
│  │  │  Store  │  │  Query   │  │  (Code Splitting)   │  │  │
│  │  └────┬────┘  └────┬─────┘  └──────────┬──────────┘  │  │
│  │       │            │                    │             │  │
│  │  ┌────┴────────────┴────────────────────┴──────────┐ │  │
│  │  │            apiFetch() Utility                   │ │  │
│  │  │  (Auto-attach JWT from localStorage)             │ │  │
│  │  └─────────────────────┬──────────────────────────┘ │  │
│  └────────────────────────┼──────────────────────────────┘  │
│                           │ HTTP (JSON)                    │
│  ┌────────────────────────┼──────────────────────────────┐  │
│  │                API Routes (24)                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │  │
│  │  │  Auth x6 │  │ Rise x18 │  │ Admin x1           │  │  │
│  │  │ login    │  │ tasks    │  │ users CRUD         │  │  │
│  │  │ signup   │  │ habits   │  │ limits editing     │  │  │
│  │  │ session  │  │ goals    │  │                    │  │  │
│  │  │ refresh  │  │ journal  │  └────────────────────┘  │  │
│  │  │ resend   │  │ finance  │                          │  │
│  │  └─────┬────┘  │ AI chat  │                          │  │
│  │        │       │ ...etc   │                          │  │
│  │  ┌─────┴──────────────────┘                          │  │
│  │  │      getSupabaseWithAuth(req)                     │  │
│  │  │      (Per-request client with JWT for RLS)         │  │
│  │  └─────────────────────┬────────────────────────────┘  │
│  └────────────────────────┼───────────────────────────────┘  │
│                            │ Supabase Client                │
│  ┌────────────────────────┼───────────────────────────────┐  │
│  │              Supabase (PostgreSQL)                     │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  Row Level Security (RLS) — Per-User Isolation  │  │  │
│  │  │  18 Tables · 30+ Policies · JOIN-based for     │  │  │
│  │  │  Child Tables (SubTask, Milestone, HabitLog)   │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    PWA Layer (Standalone Only)                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Service Worker│  │  IndexedDB   │  │ Bluetooth Share    │  │
│  │ (Cache-First │  │ (Per-User    │  │ (Web Bluetooth +   │  │
│  │  + Network)  │  │  Isolation)  │  │  Web Share Fallback)│  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ قاعدة البيانات

### الجداول (18 جدول في Supabase)

| الجدول | الوصف |
|--------|-------|
| **User** | الملف الشخصي، XP، المستوى، السلسلة |
| **Task** | المهام مع الحالة والأولوية والتبعيات |
| **SubTask** | المهام الفرعية (ربط عبر Task) |
| **Project** | المشاريع مع اللون والتقدم |
| **Goal** | الأهداف مع النوع والدين |
| **Milestone** | معالم الأهداف (ربط عبر Goal) |
| **Habit** | العادات مع الأيقونة واللون والتذكير |
| **HabitLog** | سجلات العادات اليومية (ربط عبر Habit) |
| **Journal** | اليوميات مع المزاج والطاقة |
| **FocusSession** | جلسات التركيز مع المدة والنوع |
| **HealthLog** | سجلات الصحة اليومية |
| **MorningLog** | سجلات الروتين الصباحي |
| **PlannerItem** | عناصر المخطط اليومي |
| **Book** | الكتب مع التقدم والحالة |
| **FinanceRecord** | السجلات المالية |
| **KnowledgeItem** | عناصر الدماغ الثاني |
| **DailyScore** | درجات الإنتاجية اليومية |
| **UserAchievement** | الشارات المكتسبة |
| **UserAIUsage** | تتبع استخدام AI (شهري) |
| **UserStorage** | حدود التخزين والصلاحيات |

### سياسات RLS
- كل جدول به `userId` يحمي بـ `auth.uid()`
- الجداول الفرعية (SubTask, Milestone, HabitLog) تستخدم **JOIN-based policies**
- `ON DELETE CASCADE` لتنظيف البيانات تلقائياً
- فهرسة مركبة (Composite Indexes) لتحسين الأداء

---

## 🛣️ API Routes

### المصادقة (6)
| المسار | الوصف |
|--------|-------|
| `POST /api/auth/login` | تسجيل دخول بالإيميل وكلمة المرور |
| `POST /api/auth/signup` | إنشاء حساب جديد |
| `GET /api/auth/session` | التحقق من الجلسة الحالية |
| `POST /api/auth/refresh` | تجديد صلاحية الجلسة |
| `POST /api/auth/resend` | إعادة إرسال رابط التأكيد |

### البيانات (18)
| المسار | العمليات |
|--------|----------|
| `/api/rise/dashboard` | GET — لوحة تحكم شاملة (12 استعلام متوازي) |
| `/api/rise/tasks` | GET, POST, PUT, DELETE — CRUD كامل |
| `/api/rise/habits` | GET, POST, PUT, DELETE — مع سجلات يومية |
| `/api/rise/goals` | GET, POST, PUT, DELETE — مع معالم |
| `/api/rise/projects` | GET, POST, PUT, DELETE |
| `/api/rise/journal` | GET, POST — مع Upsert لليومية |
| `/api/rise/health` | GET, POST — Upsert لليومية |
| `/api/rise/finance` | GET, POST, DELETE |
| `/api/rise/books` | GET, POST, PUT, DELETE |
| `/api/rise/knowledge` | GET, POST, PUT, DELETE |
| `/api/rise/focus` | GET, POST, PUT — جلسات التركيز |
| `/api/rise/morning` | GET, POST — الروتين الصباحي |
| `/api/rise/planner` | GET, POST, PUT, DELETE — المخطط |
| `/api/rise/productivity-score` | GET — درجة الإنتاجية |
| `/api/rise/earn-xp` | POST — اكتساب خبرة |
| `/api/rise/ai-chat` | POST — محادثة AI |
| `/api/rise/export` | GET — تصدير كل البيانات JSON |
| `/api/rise/seed` | POST — بيانات تجريبية |

### الأدمن (1)
| المسار | الوصف |
|--------|-------|
| `/api/rise/admin/users` | GET, POST, DELETE — إدارة المستخدمين |

---

## 🔒 نظام الأمان

| الطبقة | التفاصيل |
|--------|----------|
| **المصادقة** | Supabase Auth (JWT) — تسجيل دخول/خروج/جلسات |
| **RLS** | Row Level Security على كل جدول — المستخدم يرى بياناته فقط |
| **التحقق من الملكية** | كل PUT/DELETE يتحقق `userId` قبل التعديل |
| **IDOR Protection** | Milestones و HabitLog تتحقق ملكية الأصل |
| **Admin** | بريد الأدمن في `process.env.ADMIN_EMAIL` (غير مكشوف في الكود) |
| **API Auth** | `getSupabaseWithAuth(req)` — عميل Supabase بـ JWT لكل طلب |
| **Error Boundaries** | `error.tsx` + `global-error.tsx` — منع الشاشة البيضاء |
| **Input Validation** | Zod schemas + Server-side validation |
| **XSS** | React auto-escaping + CSP headers |

---

## 📱 PWA ودعم الأوفلاين

| الميزة | التفاصيل |
|--------|----------|
| **Web App Manifest** | `manifest.json` مع أيقونات + shortcuts بالعربية |
| **Service Worker** | `sw.js` — Cache-First للموارد الثابتة + Network-First للـ API |
| **IndexedDB** | `offline-db.ts` — عزل كامل لكل مستخدم (`riseos-offline-{userId}`) |
| **Sync Manager** | `sync-manager.ts` — مزامنة ثنائية الاتجاه عند العودة للإنترنت |
| **Bluetooth Share** | مشاركة البيانات بين الأجهزة عبر Web Bluetooth API |
| **Install Prompt** | عرض موجه تثبيت PWA تلقائياً للمتصفحات الداعمة |
| **وضع مزدوج** | المتصفح = Supabase فقط / التطبيق المثبت = Supabase + IndexedDB |

---

## 🎨 التصميم ونظام الألوان

### نظام الألوان (oklch)
```
Forest:       oklch(0.35 0.10 160)     — اللون الأساسي
Emerald:      oklch(0.55 0.14 163)     — التمييز والنجاح
Gold:         oklch(0.78 0.12 85)      — الإنجازات والمكافآت
Gold Light:   oklch(0.88 0.08 85)      — تمييز خفيف
```

### تأثيرات CSS مخصصة
| الفئة | التأثير |
|--------|---------|
| `.glass` | Glassmorphism مع backdrop-blur + حدود شفافة |
| `.premium-card` | ظل متعدد الطبقات + إضاءة داخلية |
| `.shimmer` | تأثير لمع متحرك للتحميل |
| `.glow-emerald` / `.glow-gold` | توهج خارجي |
| `.text-gradient-forest` / `.text-gradient-gold` | نص متدرج |
| `.noise-bg` | نسيج ضوضاء (SVG) |
| `.pulse-glow` | نبض توهجي للإنجازات |
| `.fadeSlideIn` / `.fadeSlideUp` | أنيميشن دخول خفيفة (CSS Keyframes) |

### المكتبات المرئية
- **shadcn/ui** — 40+ مكون (New York style)
- **Lucide React** — أيقونات
- **Recharts** — رسوم بيانية (AreaChart, RadarChart, BarChart)
- **Framer Motion** — أنيميشن في الوحدات الداخلية (lazy-loaded)
- **dnd-kit** — سحب وإفلات

---

## ⚡ الإعداد والتشغيل

### المتطلبات
- Node.js 18+ أو Bun
- حساب Supabase (مجاني)
- مفتاح ZhipuAI API (اختياري — للمدرب الذكي)

### 1. استنساخ المشروع
```bash
git clone <repo-url>
cd rise-os
bun install
```

### 2. إعداد Supabase
1. أنشئ مشروع جديد في [supabase.com](https://supabase.com)
2. انسخ `NEXT_PUBLIC_SUPABASE_URL` و `NEXT_PUBLIC_SUPABASE_ANON_KEY` من Settings → API
3. افتح SQL Editor في Supabase
4. انسخ محتوى `supabase-schema.sql` ونفّذه
5. عطّل تأكيد البريد: Authentication → Settings → Email → ألغِ "Confirm email"

### 3. إعداد المتغيرات البيئية
```bash
cp .env.example .env
```
عدّل `.env`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ADMIN_EMAIL=your-email@example.com
# BIGMODEL_API_KEY=your-zhipuai-key  # اختياري
```

### 4. تشغيل التطوير
```bash
bun run dev
```
افتح [http://localhost:3000](http://localhost:3000)

### 5. البناء للإنتاج
```bash
bun run build
bun run start
```

### 6. النشر على Vercel
```bash
npx vercel
```
أضف المتغيرات البيئية في Vercel Dashboard → Settings → Environment Variables.

---

## 📁 هيكل المشروع

```
src/
├── app/
│   ├── layout.tsx              # التخطيط الرئيسي (RTL, meta, PWA)
│   ├── page.tsx                # الصفحة الوحيدة — Shell + 20 وحدة lazy-loaded
│   ├── error.tsx               # Error boundary (عميل)
│   ├── global-error.tsx        # Error boundary (شامل)
│   └── api/
│       ├── auth/               # 6 routes للمصادقة
│       └── rise/               # 18 routes للبيانات + 1 أدمن
│
├── components/
│   ├── rise/                   # 25 مكون RiseOS
│   │   ├── dashboard.tsx       # لوحة التحكم (1865 سطر)
│   │   ├── tasks.tsx           # المهام مع Kanban + DnD
│   │   ├── onboarding.tsx      # معالج الترحيب (5 خطوات)
│   │   ├── login-page.tsx      # صفحة تسجيل الدخول
│   │   ├── sidebar.tsx         # الشريط الجانبي
│   │   ├── settings.tsx        # الإعدادات + لوحة الأدمن
│   │   ├── keyboard-shortcuts.tsx
│   │   └── ... (20 وحدة)
│   └── ui/                     # 40+ مكون shadcn/ui
│
├── lib/
│   ├── supabase.ts            # Supabase clients + ZhipuAI JWT
│   ├── api-fetch.ts           # مركزي fetch مع auth تلقائي
│   ├── gamification.ts        # نظام XP/Level/شارات
│   ├── pwa.tsx                # مكونات PWA
│   ├── offline-db.ts          # IndexedDB wrapper
│   ├── sync-manager.ts        # مزامنة أوفلاين
│   └── bluetooth-share.ts     # مشاركة بلوتوث
│
├── store/
│   └── app-store.ts           # Zustand — حالة التطبيق
│
├── hooks/
│   └── use-toast.ts           # نظام الإشعارات
│
└── public/
    ├── manifest.json          # PWA manifest
    ├── sw.js                  # Service Worker
    └── icons/                 # أيقونات التطبيق
```

---

## 📊 الحالة الحالية

### ✅ مكتمل
- [x] 20 وحدة واجهة مستخدم كاملة ومحسّنة بتصميم premium
- [x] 24 API route (6 مصادقة + 18 بيانات + 1 أدمن)
- [x] Full Supabase integration مع RLS لكل جدول
- [x] نظام Gamification كامل (XP, المستويات, 15 شارة, سلاسل)
- [x] مصادقة Supabase Auth مع تحقق من الجلسة
- [x] لوحة تحكم أدمن (بحث، تعديل صلاحيات، حذف مع تأكيد)
- [x] بحث شامل ⌘K (6 أنواع بيانات + كل الوحدات)
- [x] اختصارات لوحة المفاتيح (Ctrl+1-0, Ctrl+N, Ctrl+D, Ctrl+/)
- [x] PWA مع Service Worker و IndexedDB و Bluetooth
- [x] Drag & Drop لترتيب المهام
- [x] تبعيات المهام + تذكيرات العادات
- [x] نظام الميزانية الشهرية (8 فئات)
- [x] جدار تحفيز متحرك (24 اقتباس)
- [x] Error Boundaries (عميل + شامل)
- [x] معالج ترحيب 5 خطوات للمستخدمين الجدد
- [x] Lighthouse: Best Practices 100, SEO 100
- [x] وضع فاتح/داكن + RTL عربي كامل
- [x] حماية أمنية (RLS, IDOR, Admin في env)

### ⏳ قيد التطوير
- [ ] تحسين Lighthouse Performance (>70)
- [ ] نقل Learning و Budgets من localStorage إلى Supabase
- [ ] نظام إشعارات Web Push API
- [ ] تصدير التقارير PDF
- [ ] تكامل مع Google Calendar / Notion
- [ ] Service Worker فعلي للعمل بدون إنترنت

---

## 🗺️ خارطة الطريق

### المرحلة القادمة (التحسين والإنتاج)
1. **الأداء**: تقليل حجم الحزمة الأولية أكثر (lazy load recharts, mdxeditor)
2. **الاستقرار**: اختبار E2E شامل على Vercel
3. **الأوفلاين**: Service Worker حقيقي مع Sync
4. **الإشعارات**: Web Push API للتنبيهات
5. **التصدير**: PDF للتقارير و Excel للبيانات

### مراحل لاحقة
- تطبيق Tauri لسطح المكتب (EXE)
- تكامل مع تطبيقات خارجية
- وضع متعدد المستخدمين (فرق)
- لوحة تحكم متقدمة (Analytics للمستخدمين)
- API عامة للتكاملات

---

## 🤝 المساهمة

المشروع مفتوح المصدر. Contributions مرحب بها!

1. Fork المشروع
2. أنشئ فرع (`git checkout -b feature/amazing`)
3. Commit (`git commit -m 'feat: add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. افتح Pull Request

---

## 📄 الرخصة

MIT License — صُنع بـ ❤️ لأمة عربية

---

<div align="center">

**"امتلك صباحك. امتلك حياتك."**

Made with ⚡ by [RiseOS Team](https://github.com)

</div>
